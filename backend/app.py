import hashlib
import hmac
import json
import os
import secrets
import re
import asyncio
import contextlib
from datetime import datetime, timedelta, timezone

from fastapi import Depends, FastAPI, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token
from pydantic import BaseModel, Field
from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint, create_engine, event, select, update
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column
from sqlalchemy.exc import IntegrityError
from contextlib import asynccontextmanager


def now():
    return datetime.now(timezone.utc).replace(tzinfo=None)


DATABASE_URL = os.getenv('DATABASE_URL', 'sqlite:///./edumerge.db')
GOOGLE_CLIENT_ID = os.getenv('GOOGLE_CLIENT_ID', '538215766505-7nnc9d9sa938hrqr2it9nqmrdeckeuh2.apps.googleusercontent.com')
engine = create_engine(DATABASE_URL, connect_args={'check_same_thread': False} if DATABASE_URL.startswith('sqlite') else {})
if DATABASE_URL.startswith('sqlite'):
    @event.listens_for(engine, 'connect')
    def sqlite_foreign_keys(connection, _):
        connection.execute('PRAGMA foreign_keys=ON')


class Base(DeclarativeBase):
    pass


class Department(Base):
    __tablename__ = 'departments'
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100), unique=True)


class User(Base):
    __tablename__ = 'users'
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100))
    email: Mapped[str] = mapped_column(String(200), unique=True)
    password_hash: Mapped[str] = mapped_column(String(300))
    role: Mapped[str] = mapped_column(String(20))
    department_id: Mapped[int | None] = mapped_column(ForeignKey('departments.id'))


class LoginSession(Base):
    __tablename__ = 'sessions'
    token_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey('users.id'))
    expires_at: Mapped[datetime] = mapped_column(DateTime)


class Category(Base):
    __tablename__ = 'categories'
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100))
    department_id: Mapped[int] = mapped_column(ForeignKey('departments.id'))


class Ticket(Base):
    __tablename__ = 'tickets'
    id: Mapped[int] = mapped_column(primary_key=True)
    student_id: Mapped[int] = mapped_column(ForeignKey('users.id'), index=True)
    category_id: Mapped[int] = mapped_column(ForeignKey('categories.id'))
    department_id: Mapped[int] = mapped_column(ForeignKey('departments.id'), index=True)
    owner_id: Mapped[int | None] = mapped_column(ForeignKey('users.id'))
    subject: Mapped[str] = mapped_column(String(160))
    description: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(30), default='open')
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)


class TicketEvent(Base):
    __tablename__ = 'ticket_events'
    id: Mapped[int] = mapped_column(primary_key=True)
    ticket_id: Mapped[int] = mapped_column(ForeignKey('tickets.id'), index=True)
    actor_id: Mapped[int] = mapped_column(ForeignKey('users.id'))
    message: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)


class TicketIntake(Base):
    __tablename__ = 'ticket_intakes'
    ticket_id: Mapped[int] = mapped_column(ForeignKey('tickets.id'), primary_key=True)
    answers_json: Mapped[str] = mapped_column(Text)


class TicketComment(Base):
    __tablename__ = 'ticket_comments'
    id: Mapped[int] = mapped_column(primary_key=True)
    ticket_id: Mapped[int] = mapped_column(ForeignKey('tickets.id'), index=True)
    author_id: Mapped[int] = mapped_column(ForeignKey('users.id'))
    body: Mapped[str] = mapped_column(Text)
    is_internal: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)


class TicketMeta(Base):
    __tablename__ = 'ticket_meta'
    ticket_id: Mapped[int] = mapped_column(ForeignKey('tickets.id'), primary_key=True)
    priority: Mapped[str] = mapped_column(String(20), default='normal')
    first_response_at: Mapped[datetime | None] = mapped_column(DateTime)
    last_staff_action_at: Mapped[datetime | None] = mapped_column(DateTime)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime)
    reopen_count: Mapped[int] = mapped_column(Integer, default=0)


class TicketSlaCycle(Base):
    __tablename__ = 'ticket_sla_cycles'
    __table_args__ = (UniqueConstraint('ticket_id', 'cycle_number'),)
    id: Mapped[int] = mapped_column(primary_key=True)
    ticket_id: Mapped[int] = mapped_column(ForeignKey('tickets.id'), index=True)
    cycle_number: Mapped[int] = mapped_column(Integer)
    started_at: Mapped[datetime] = mapped_column(DateTime)
    due_at: Mapped[datetime] = mapped_column(DateTime)
    paused_at: Mapped[datetime | None] = mapped_column(DateTime)
    paused_minutes: Mapped[int] = mapped_column(Integer, default=0)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime)


class Escalation(Base):
    __tablename__ = 'escalations'
    __table_args__ = (UniqueConstraint('ticket_id', 'cycle_number', 'level'),)
    id: Mapped[int] = mapped_column(primary_key=True)
    ticket_id: Mapped[int] = mapped_column(ForeignKey('tickets.id'), index=True)
    cycle_number: Mapped[int] = mapped_column(Integer)
    level: Mapped[str] = mapped_column(String(30))
    reason: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)
    acknowledged_at: Mapped[datetime | None] = mapped_column(DateTime)
    acknowledged_by: Mapped[int | None] = mapped_column(ForeignKey('users.id'))


class Notification(Base):
    __tablename__ = 'notifications'
    id: Mapped[int] = mapped_column(primary_key=True)
    recipient_id: Mapped[int] = mapped_column(ForeignKey('users.id'), index=True)
    ticket_id: Mapped[int] = mapped_column(ForeignKey('tickets.id'))
    escalation_id: Mapped[int | None] = mapped_column(ForeignKey('escalations.id'))
    message: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)
    read_at: Mapped[datetime | None] = mapped_column(DateTime)


INTAKE_FIELDS = {
    1: {
        'roll_number': ('Roll number', True),
        'class_section': ('Class / section', True),
        'subject_name': ('Subject', True),
        'attendance_date': ('Affected date', True),
        'session': ('Period / session', True),
        'expected_correction': ('Correction needed', True),
    },
    2: {
        'roll_number': ('Roll number', True),
        'semester': ('Semester', True),
        'fee_type': ('Fee type', True),
        'issue_type': ('Issue type', True),
        'payment_date': ('Payment date', False),
        'amount': ('Amount paid', False),
        'transaction_reference': ('Transaction reference', False),
    },
    3: {
        'roll_number': ('Roll number', True),
        'class_section': ('Class / section', True),
        'issue_type': ('ID card issue', True),
        'correction_details': ('Details to correct', False),
    },
    4: {
        'roll_number': ('Roll number', True),
        'certificate_type': ('Certificate type', True),
        'name_on_certificate': ('Name on certificate', True),
        'purpose': ('Purpose', True),
        'required_by': ('Required by', False),
    },
}
SLA_HOURS = {1: 24, 2: 24, 3: 48, 4: 48}


def current_cycle(db, ticket_id):
    return db.scalar(select(TicketSlaCycle).where(TicketSlaCycle.ticket_id == ticket_id).order_by(TicketSlaCycle.cycle_number.desc()).limit(1))


def add_cycle(db, ticket, cycle_number=1, started_at=None):
    started = started_at or now()
    cycle = TicketSlaCycle(ticket_id=ticket.id, cycle_number=cycle_number, started_at=started,
                           due_at=started + timedelta(hours=SLA_HOURS.get(ticket.category_id, 48)), paused_minutes=0)
    db.add(cycle)
    return cycle


def ensure_support_data(db):
    for ticket in db.scalars(select(Ticket)):
        if not db.get(TicketMeta, ticket.id):
            db.add(TicketMeta(ticket_id=ticket.id, priority='normal', reopen_count=0))
        if not current_cycle(db, ticket.id):
            cycle = add_cycle(db, ticket, started_at=ticket.created_at)
            if ticket.status == 'resolved':
                cycle.resolved_at = ticket.created_at
    db.commit()


def notify_managers(db, ticket, escalation):
    for manager_id in db.scalars(select(User.id).where(User.role == 'manager')):
        db.add(Notification(recipient_id=manager_id, ticket_id=ticket.id, escalation_id=escalation.id,
                            message=f'{ticket.subject}: {escalation.reason}'))


def create_escalation(db, ticket, cycle, level, reason):
    existing = db.scalar(select(Escalation).where(Escalation.ticket_id == ticket.id,
                         Escalation.cycle_number == cycle.cycle_number, Escalation.level == level))
    if existing:
        return existing
    escalation = Escalation(ticket_id=ticket.id, cycle_number=cycle.cycle_number, level=level, reason=reason)
    db.add(escalation)
    db.flush()
    notify_managers(db, ticket, escalation)
    manager_id = db.scalar(select(User.id).where(User.role == 'manager').limit(1))
    db.add(TicketEvent(ticket_id=ticket.id, actor_id=manager_id or ticket.owner_id or ticket.student_id,
                       message=f'Automatic escalation: {reason}'))
    return escalation


def process_sla(db):
    moment = now()
    for ticket in db.scalars(select(Ticket).where(Ticket.status != 'resolved')):
        cycle = current_cycle(db, ticket.id)
        if not cycle or cycle.paused_at:
            continue
        if not ticket.owner_id and moment >= ticket.created_at + timedelta(hours=2):
            create_escalation(db, ticket, cycle, 'unclaimed', 'Unclaimed for more than 2 hours')
        if moment >= cycle.due_at:
            create_escalation(db, ticket, cycle, 'overdue', 'Resolution SLA breached')
    db.commit()


async def sla_worker():
    while True:
        await asyncio.sleep(60)
        try:
            with Session(engine) as db:
                process_sla(db)
        except Exception:
            # A failed periodic pass must not take down the API; the next pass retries.
            continue


def validate_intake(category_id, supplied):
    schema = INTAKE_FIELDS.get(category_id)
    if not schema:
        raise HTTPException(422, 'This category is not configured for request intake')
    answers = {}
    supplied = supplied or {}
    for key, (label, required) in schema.items():
        value = str(supplied.get(key, '')).strip()
        if required and not value:
            raise HTTPException(422, f'{label} is required for this request')
        if len(value) > 500:
            raise HTTPException(422, f'{label} must be 500 characters or fewer')
        if value:
            answers[key] = {'label': label, 'value': value}
    if category_id == 2 and supplied.get('issue_type') in {'Payment not reflected', 'Refund or reversal'}:
        for key in ('payment_date', 'amount', 'transaction_reference'):
            if not str(supplied.get(key, '')).strip():
                raise HTTPException(422, f'{schema[key][0]} is required for this payment issue')
    if category_id == 2 and supplied.get('issue_type') == 'Incorrect amount' and not str(supplied.get('amount', '')).strip():
        raise HTTPException(422, 'Amount paid is required for this payment issue')
    if category_id == 3 and supplied.get('issue_type') == 'Incorrect details' and not str(supplied.get('correction_details', '')).strip():
        raise HTTPException(422, 'Details to correct is required for an incorrect ID card')
    return answers


def hash_password(password):
    salt = secrets.token_hex(16)
    digest = hashlib.scrypt(password.encode(), salt=salt.encode(), n=16384, r=8, p=1).hex()
    return salt + ':' + digest


def verify_password(password, stored):
    salt, digest = stored.split(':')
    actual = hashlib.scrypt(password.encode(), salt=salt.encode(), n=16384, r=8, p=1).hex()
    return hmac.compare_digest(digest, actual)


def seed_demo():
    with Session(engine) as db:
        if db.scalar(select(User.id).limit(1)):
            return
        db.add_all([Department(id=1, name='Academics'), Department(id=2, name='Accounts'), Department(id=3, name='Administration')])
        db.flush()
        for id, name, role, department, email in [
            (1, 'Aarav Sharma', 'student', None, 'student@demo.edu'),
            (2, 'Meera Nair', 'student', None, 'meera@demo.edu'),
            (3, 'Priya Rao', 'staff', 1, 'staff@demo.edu'),
            (4, 'Arjun Menon', 'staff', 1, 'arjun@demo.edu'),
            (5, 'Neha Shah', 'staff', 2, 'accounts@demo.edu'),
            (6, 'Rohan Das', 'staff', 3, 'admin@demo.edu'),
            (7, 'Kavya Iyer', 'manager', None, 'manager@demo.edu'),
        ]:
            db.add(User(id=id, name=name, role=role, department_id=department, email=email, password_hash=hash_password('Demo@12345')))
        db.add_all([Category(id=1, name='Attendance correction', department_id=1), Category(id=2, name='Fee enquiry', department_id=2), Category(id=3, name='ID card', department_id=3), Category(id=4, name='Certificate request', department_id=3)])
        db.flush()
        samples = [
            (1, 1, 'Attendance missing for Monday', 'I attended the morning mathematics lecture, but the portal marks me absent. Please help check the record.', None, 5),
            (1, 4, 'Bonafide certificate for internship', 'I need a bonafide certificate for my internship application. Please let me know the required documents.', 6, 22),
            (2, 1, 'Lab attendance correction', 'My attendance for the physics lab has not been updated. I was present for the full session.', None, 3),
            (1, 2, 'Clarification on library fee', 'Could you explain the library fee listed on my semester statement?', None, 2),
        ]
        for student, category, subject, description, owner, hours in samples:
            cat = db.get(Category, category)
            ticket = Ticket(student_id=student, category_id=category, department_id=cat.department_id, subject=subject, description=description, owner_id=owner, status='in_progress' if owner else 'open', created_at=now()-timedelta(hours=hours))
            db.add(ticket)
            db.flush()
            db.add(TicketEvent(ticket_id=ticket.id, actor_id=student, message='Request submitted', created_at=ticket.created_at))
            if owner:
                db.add(TicketEvent(ticket_id=ticket.id, actor_id=owner, message='Took ownership of this request', created_at=ticket.created_at+timedelta(minutes=30)))
        db.commit()


@asynccontextmanager
async def lifespan(app):
    Base.metadata.create_all(engine)
    if os.getenv('SEED_DEMO', '1') == '1':
        seed_demo()
    with Session(engine) as db:
        ensure_support_data(db)
        process_sla(db)
    worker = asyncio.create_task(sla_worker())
    try:
        yield
    finally:
        worker.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await worker


app = FastAPI(title='Edumerge Support', lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv('APP_ORIGIN', 'http://localhost:5173,http://127.0.0.1:5173').split(','),
    allow_credentials=True,
    allow_methods=['GET', 'POST', 'OPTIONS'],
    allow_headers=['Content-Type'],
)


@app.middleware('http')
async def check_origin(request: Request, call_next):
    if request.method in {'POST', 'PUT', 'PATCH', 'DELETE'}:
        allowed = [item.strip() for item in os.getenv(
            'APP_ORIGIN', 'http://localhost:5173,http://127.0.0.1:5173'
        ).split(',')]
        origin = request.headers.get('origin')
        if origin and origin not in allowed:
            from fastapi.responses import JSONResponse
            return JSONResponse(status_code=403, content={'detail': 'Request origin is not allowed'})
    return await call_next(request)


def database():
    with Session(engine) as db:
        yield db


def current_user(request: Request, db: Session = Depends(database)):
    token = request.cookies.get('edumerge_session', '')
    session = db.get(LoginSession, hashlib.sha256(token.encode()).hexdigest()) if token else None
    if not session or session.expires_at <= now():
        raise HTTPException(401, 'Please sign in to continue')
    user = db.get(User, session.user_id)
    if not user:
        raise HTTPException(401, 'Please sign in to continue')
    return user


def user_data(user, db):
    department = db.get(Department, user.department_id) if user.department_id else None
    return {'id': user.id, 'name': user.name, 'email': user.email, 'role': user.role, 'department': department.name if department else None}


class LoginBody(BaseModel):
    email: str = Field(min_length=3, max_length=200)
    password: str = Field(min_length=1, max_length=200)


class SignupBody(BaseModel):
    name: str = Field(min_length=2, max_length=100)
    email: str = Field(min_length=3, max_length=200)
    password: str = Field(min_length=8, max_length=200)


class GoogleCredentialBody(BaseModel):
    credential: str = Field(min_length=20, max_length=10000)


def create_login_session(user, request, response, db):
    old = request.cookies.get('edumerge_session')
    if old:
        previous = db.get(LoginSession, hashlib.sha256(old.encode()).hexdigest())
        if previous:
            db.delete(previous)
    token = secrets.token_urlsafe(32)
    db.add(LoginSession(token_hash=hashlib.sha256(token.encode()).hexdigest(), user_id=user.id,
                        expires_at=now()+timedelta(hours=12)))
    db.commit()
    secure_cookie = os.getenv('COOKIE_SECURE', '0') == '1'
    response.set_cookie('edumerge_session', token, httponly=True,
                        samesite='none' if secure_cookie else 'lax',
                        secure=secure_cookie, max_age=43200)


@app.post('/api/auth/signup', status_code=201)
def signup(body: SignupBody, db: Session = Depends(database)):
    email = body.email.strip().lower()
    if len(body.name.strip()) < 2 or not re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+', email):
        raise HTTPException(422, 'Enter a valid name and email address')
    user = User(name=body.name.strip(), email=email, password_hash=hash_password(body.password), role='student', department_id=None)
    db.add(user)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, 'An account with this email already exists. Please sign in.')
    return {'message': 'Account created. Sign in with your new credentials.'}


@app.post('/api/auth/login')
def login(body: LoginBody, request: Request, response: Response, db: Session = Depends(database)):
    user = db.scalar(select(User).where(User.email == body.email.strip().lower()))
    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(401, 'Email or password is incorrect')
    create_login_session(user, request, response, db)
    return user_data(user, db)


@app.get('/api/auth/google/config')
def google_config():
    return {'client_id': GOOGLE_CLIENT_ID}


@app.post('/api/auth/google')
def google_login(body: GoogleCredentialBody, request: Request, response: Response, db: Session = Depends(database)):
    try:
        identity = id_token.verify_oauth2_token(body.credential, google_requests.Request(), GOOGLE_CLIENT_ID)
    except Exception:
        raise HTTPException(401, 'Google could not verify this sign-in. Please try again.')
    if identity.get('iss') not in {'accounts.google.com', 'https://accounts.google.com'}:
        raise HTTPException(401, 'Google could not verify this sign-in. Please try again.')
    email = str(identity.get('email', '')).strip().lower()
    if not email or identity.get('email_verified') is not True:
        raise HTTPException(401, 'Use a Google account with a verified email address.')
    user = db.scalar(select(User).where(User.email == email))
    if user and user.role != 'student':
        raise HTTPException(403, 'Staff and manager accounts must use institution-provided sign-in.')
    if not user:
        name = str(identity.get('name') or email.split('@')[0]).strip()[:100]
        user = User(name=name or 'Student', email=email, password_hash=hash_password(secrets.token_urlsafe(32)),
                    role='student', department_id=None)
        db.add(user)
        db.flush()
    create_login_session(user, request, response, db)
    return user_data(user, db)


@app.post('/api/auth/logout')
def logout(request: Request, response: Response, db: Session = Depends(database)):
    token = request.cookies.get('edumerge_session', '')
    session = db.get(LoginSession, hashlib.sha256(token.encode()).hexdigest())
    if session:
        db.delete(session)
        db.commit()
    response.delete_cookie('edumerge_session')
    return {'ok': True}


@app.get('/api/auth/me')
def me(user: User = Depends(current_user), db: Session = Depends(database)):
    return user_data(user, db)


@app.get('/api/students/{id}')
def student_profile(id: int, user: User = Depends(current_user), db: Session = Depends(database)):
    student = db.get(User, id)
    if not student or student.role != 'student':
        raise HTTPException(404, 'Student not found')
    if user.role == 'student' and user.id != id:
        raise HTTPException(404, 'Student not found')
    if user.role == 'staff' and not db.scalar(select(Ticket.id).where(Ticket.student_id == id, Ticket.department_id == user.department_id).limit(1)):
        raise HTTPException(404, 'Student not found')
    return user_data(student, db)


@app.get('/api/categories')
def categories(user: User = Depends(current_user), db: Session = Depends(database)):
    return [{'id': c.id, 'name': c.name, 'department': db.get(Department, c.department_id).name} for c in db.scalars(select(Category))]


def visible(query, user):
    if user.role == 'student':
        return query.where(Ticket.student_id == user.id)
    if user.role == 'staff':
        return query.where(Ticket.department_id == user.department_id)
    return query


def ticket_data(ticket, db):
    owner = db.get(User, ticket.owner_id) if ticket.owner_id else None
    intake = db.get(TicketIntake, ticket.id)
    details = list(json.loads(intake.answers_json).values()) if intake else []
    meta = db.get(TicketMeta, ticket.id)
    cycle = current_cycle(db, ticket.id)
    moment = now()
    sla_state, sla_percent, due_at = 'not_started', 0, None
    if cycle:
        due_at = cycle.due_at.isoformat() + 'Z'
        total = max((cycle.due_at - cycle.started_at).total_seconds(), 1)
        consumed = max(((cycle.paused_at or moment) - cycle.started_at).total_seconds() - cycle.paused_minutes * 60, 0)
        sla_percent = round(consumed / total * 100)
        if ticket.status == 'resolved':
            sla_state = 'met' if cycle.resolved_at and cycle.resolved_at <= cycle.due_at else 'breached'
        elif cycle.paused_at:
            sla_state = 'paused'
        elif moment >= cycle.due_at:
            sla_state = 'overdue'
        elif sla_percent >= 70:
            sla_state = 'at_risk'
        else:
            sla_state = 'on_track'
    return {'id': ticket.id, 'reference': f'EM-{ticket.id:04d}', 'subject': ticket.subject,
            'description': ticket.description, 'status': ticket.status,
            'category': db.get(Category, ticket.category_id).name,
            'department': db.get(Department, ticket.department_id).name,
            'student': db.get(User, ticket.student_id).name, 'student_id': ticket.student_id,
            'owner': owner.name if owner else None, 'owner_id': ticket.owner_id,
            'created_at': ticket.created_at.isoformat()+'Z', 'intake_details': details,
            'priority': meta.priority if meta else 'normal', 'reopen_count': meta.reopen_count if meta else 0,
            'sla_state': sla_state, 'sla_percent': sla_percent, 'sla_due_at': due_at,
            'cycle_number': cycle.cycle_number if cycle else 1}


@app.get('/api/tickets')
def list_tickets(user: User = Depends(current_user), db: Session = Depends(database)):
    process_sla(db)
    return [ticket_data(t, db) for t in db.scalars(visible(select(Ticket), user).order_by(Ticket.created_at.desc()))]


class TicketBody(BaseModel):
    subject: str = Field(min_length=5, max_length=160)
    description: str = Field(min_length=20, max_length=5000)
    category_id: int
    intake: dict[str, str] = Field(default_factory=dict)


@app.post('/api/tickets', status_code=201)
def create_ticket(body: TicketBody, user: User = Depends(current_user), db: Session = Depends(database)):
    if user.role != 'student':
        raise HTTPException(403, 'Only students can submit requests')
    category = db.get(Category, body.category_id)
    if not category:
        raise HTTPException(422, 'Choose a valid category')
    if len(body.subject.strip()) < 5 or len(body.description.strip()) < 20:
        raise HTTPException(422, 'Please provide a descriptive subject and at least 20 characters of detail')
    answers = validate_intake(category.id, body.intake)
    ticket = Ticket(student_id=user.id, category_id=category.id, department_id=category.department_id, subject=body.subject.strip(), description=body.description.strip())
    db.add(ticket)
    db.flush()
    db.add(TicketIntake(ticket_id=ticket.id, answers_json=json.dumps(answers)))
    db.add(TicketMeta(ticket_id=ticket.id, priority='normal', reopen_count=0))
    add_cycle(db, ticket)
    db.add(TicketEvent(ticket_id=ticket.id, actor_id=user.id, message='Request submitted'))
    db.commit()
    return ticket_data(ticket, db)


def accessible_ticket(id, user, db):
    ticket = db.scalar(visible(select(Ticket).where(Ticket.id == id), user))
    if not ticket:
        raise HTTPException(404, 'Request not found')
    return ticket


@app.get('/api/tickets/{id}')
def detail(id: int, user: User = Depends(current_user), db: Session = Depends(database)):
    ticket = accessible_ticket(id, user, db)
    result = ticket_data(ticket, db)
    result['events'] = [{'id': e.id, 'actor': db.get(User, e.actor_id).name, 'message': e.message, 'created_at': e.created_at.isoformat()+'Z'} for e in db.scalars(select(TicketEvent).where(TicketEvent.ticket_id == id).order_by(TicketEvent.created_at, TicketEvent.id))]
    comments = select(TicketComment).where(TicketComment.ticket_id == id)
    if user.role == 'student':
        comments = comments.where(TicketComment.is_internal.is_(False))
    result['comments'] = [{'id': c.id, 'author': db.get(User, c.author_id).name,
                           'author_role': db.get(User, c.author_id).role, 'body': c.body,
                           'is_internal': c.is_internal, 'created_at': c.created_at.isoformat()+'Z'}
                          for c in db.scalars(comments.order_by(TicketComment.created_at, TicketComment.id))]
    result['escalations'] = [{'id': e.id, 'level': e.level, 'reason': e.reason,
                              'created_at': e.created_at.isoformat()+'Z',
                              'acknowledged': bool(e.acknowledged_at)}
                             for e in db.scalars(select(Escalation).where(Escalation.ticket_id == id).order_by(Escalation.created_at))] if user.role != 'student' else []
    return result


@app.post('/api/tickets/{id}/claim')
def claim(id: int, user: User = Depends(current_user), db: Session = Depends(database)):
    if user.role != 'staff':
        raise HTTPException(403, 'Only department staff can claim requests')
    accessible_ticket(id, user, db)
    result = db.execute(update(Ticket).where(Ticket.id == id, Ticket.department_id == user.department_id, Ticket.owner_id.is_(None), Ticket.status == 'open').values(owner_id=user.id, status='in_progress'))
    if result.rowcount != 1:
        db.rollback()
        raise HTTPException(409, 'This request has already been claimed. Refresh to see its owner.')
    db.add(TicketEvent(ticket_id=id, actor_id=user.id, message='Took ownership of this request'))
    meta = db.get(TicketMeta, id)
    if meta:
        meta.last_staff_action_at = now()
    db.commit()
    return ticket_data(db.get(Ticket, id), db)


class MessageBody(BaseModel):
    body: str = Field(min_length=2, max_length=5000)
    is_internal: bool = False


def require_handler(ticket, user):
    if user.role == 'manager':
        return
    if user.role != 'staff' or ticket.owner_id != user.id:
        raise HTTPException(403, 'Only the assigned staff member or a manager can perform this action')


def clean_message(body):
    value = body.strip()
    if len(value) < 2:
        raise HTTPException(422, 'Enter a meaningful message')
    return value


@app.post('/api/tickets/{id}/comments', status_code=201)
def add_comment(id: int, body: MessageBody, user: User = Depends(current_user), db: Session = Depends(database)):
    ticket = accessible_ticket(id, user, db)
    if ticket.status == 'resolved':
        raise HTTPException(409, 'Reopen this request before adding a reply')
    if body.is_internal and user.role == 'student':
        raise HTTPException(403, 'Students cannot add internal notes')
    if user.role == 'staff' and ticket.owner_id != user.id:
        raise HTTPException(403, 'Claim this request before replying')
    message = TicketComment(ticket_id=id, author_id=user.id, body=clean_message(body.body), is_internal=body.is_internal)
    db.add(message)
    meta = db.get(TicketMeta, id)
    if user.role in {'staff', 'manager'}:
        meta.last_staff_action_at = now()
        if not body.is_internal and not meta.first_response_at:
            meta.first_response_at = now()
    if user.role == 'student' and ticket.status == 'waiting_for_student':
        cycle = current_cycle(db, id)
        if cycle and cycle.paused_at:
            paused = max(round((now() - cycle.paused_at).total_seconds() / 60), 0)
            cycle.paused_minutes += paused
            cycle.due_at += timedelta(minutes=paused)
            cycle.paused_at = None
        ticket.status = 'in_progress'
        db.add(TicketEvent(ticket_id=id, actor_id=user.id, message='Student replied; SLA resumed'))
    db.commit()
    return {'ok': True}


@app.post('/api/tickets/{id}/request-info')
def request_information(id: int, body: MessageBody, user: User = Depends(current_user), db: Session = Depends(database)):
    ticket = accessible_ticket(id, user, db)
    require_handler(ticket, user)
    if ticket.status not in {'in_progress', 'open'}:
        raise HTTPException(409, 'Information can only be requested on an active ticket')
    db.add(TicketComment(ticket_id=id, author_id=user.id, body=clean_message(body.body), is_internal=False))
    ticket.status = 'waiting_for_student'
    cycle = current_cycle(db, id)
    if cycle and not cycle.paused_at:
        cycle.paused_at = now()
    meta = db.get(TicketMeta, id)
    meta.last_staff_action_at = now()
    if not meta.first_response_at:
        meta.first_response_at = now()
    db.add(TicketEvent(ticket_id=id, actor_id=user.id, message='Requested information from student; SLA paused'))
    db.commit()
    return ticket_data(ticket, db)


@app.post('/api/tickets/{id}/resolve')
def resolve_ticket(id: int, body: MessageBody, user: User = Depends(current_user), db: Session = Depends(database)):
    ticket = accessible_ticket(id, user, db)
    require_handler(ticket, user)
    if ticket.status == 'resolved':
        raise HTTPException(409, 'This request is already resolved')
    note = clean_message(body.body)
    db.add(TicketComment(ticket_id=id, author_id=user.id, body=note, is_internal=False))
    ticket.status = 'resolved'
    moment = now()
    meta = db.get(TicketMeta, id)
    meta.resolved_at = moment
    meta.last_staff_action_at = moment
    cycle = current_cycle(db, id)
    cycle.resolved_at = moment
    cycle.paused_at = None
    db.add(TicketEvent(ticket_id=id, actor_id=user.id, message='Marked request as resolved'))
    db.commit()
    return ticket_data(ticket, db)


@app.post('/api/tickets/{id}/reopen')
def reopen_ticket(id: int, body: MessageBody, user: User = Depends(current_user), db: Session = Depends(database)):
    ticket = accessible_ticket(id, user, db)
    if user.role != 'student' or ticket.student_id != user.id:
        raise HTTPException(403, 'Only the student who created this request can reopen it')
    if ticket.status != 'resolved':
        raise HTTPException(409, 'Only a resolved request can be reopened')
    reason = clean_message(body.body)
    old_cycle = current_cycle(db, id)
    db.add(TicketComment(ticket_id=id, author_id=user.id, body=reason, is_internal=False))
    ticket.status = 'in_progress'
    meta = db.get(TicketMeta, id)
    meta.reopen_count += 1
    meta.resolved_at = None
    add_cycle(db, ticket, (old_cycle.cycle_number + 1) if old_cycle else 2)
    db.add(TicketEvent(ticket_id=id, actor_id=user.id, message='Reopened request; a new SLA cycle started'))
    db.commit()
    return ticket_data(ticket, db)


class ReassignBody(BaseModel):
    owner_id: int


@app.get('/api/staff')
def staff_list(user: User = Depends(current_user), db: Session = Depends(database)):
    if user.role != 'manager':
        raise HTTPException(403, 'Manager access required')
    return [{'id': member.id, 'name': member.name, 'department_id': member.department_id,
             'department': db.get(Department, member.department_id).name}
            for member in db.scalars(select(User).where(User.role == 'staff').order_by(User.name))]


@app.post('/api/tickets/{id}/reassign')
def reassign_ticket(id: int, body: ReassignBody, user: User = Depends(current_user), db: Session = Depends(database)):
    if user.role != 'manager':
        raise HTTPException(403, 'Manager access required')
    ticket = accessible_ticket(id, user, db)
    owner = db.get(User, body.owner_id)
    if not owner or owner.role != 'staff' or owner.department_id != ticket.department_id:
        raise HTTPException(422, 'Choose an eligible staff member from this department')
    previous = db.get(User, ticket.owner_id).name if ticket.owner_id else 'Unassigned'
    ticket.owner_id = owner.id
    if ticket.status == 'open':
        ticket.status = 'in_progress'
    db.add(TicketEvent(ticket_id=id, actor_id=user.id, message=f'Reassigned from {previous} to {owner.name}'))
    db.commit()
    return ticket_data(ticket, db)


class PriorityBody(BaseModel):
    priority: str


@app.post('/api/tickets/{id}/priority')
def change_priority(id: int, body: PriorityBody, user: User = Depends(current_user), db: Session = Depends(database)):
    if user.role != 'manager':
        raise HTTPException(403, 'Manager access required')
    ticket = accessible_ticket(id, user, db)
    if body.priority not in {'low', 'normal', 'high', 'urgent'}:
        raise HTTPException(422, 'Choose a valid priority')
    meta = db.get(TicketMeta, id)
    old = meta.priority
    meta.priority = body.priority
    db.add(TicketEvent(ticket_id=id, actor_id=user.id, message=f'Priority changed from {old} to {body.priority}'))
    db.commit()
    return ticket_data(ticket, db)


@app.post('/api/escalations/{id}/acknowledge')
def acknowledge_escalation(id: int, user: User = Depends(current_user), db: Session = Depends(database)):
    if user.role != 'manager':
        raise HTTPException(403, 'Manager access required')
    escalation = db.get(Escalation, id)
    if not escalation:
        raise HTTPException(404, 'Escalation not found')
    if not escalation.acknowledged_at:
        escalation.acknowledged_at = now()
        escalation.acknowledged_by = user.id
        db.add(TicketEvent(ticket_id=escalation.ticket_id, actor_id=user.id, message='Manager acknowledged escalation'))
        db.commit()
    return {'ok': True}


@app.get('/api/notifications')
def notifications(user: User = Depends(current_user), db: Session = Depends(database)):
    return [{'id': n.id, 'ticket_id': n.ticket_id, 'message': n.message,
             'created_at': n.created_at.isoformat()+'Z', 'read': bool(n.read_at)}
            for n in db.scalars(select(Notification).where(Notification.recipient_id == user.id).order_by(Notification.created_at.desc()).limit(30))]


@app.post('/api/notifications/{id}/read')
def read_notification(id: int, user: User = Depends(current_user), db: Session = Depends(database)):
    notification = db.scalar(select(Notification).where(Notification.id == id, Notification.recipient_id == user.id))
    if not notification:
        raise HTTPException(404, 'Notification not found')
    notification.read_at = notification.read_at or now()
    db.commit()
    return {'ok': True}


@app.get('/api/reports/overview')
def report_overview(user: User = Depends(current_user), db: Session = Depends(database)):
    if user.role != 'manager':
        raise HTTPException(403, 'Manager access required')
    process_sla(db)
    tickets = list(db.scalars(select(Ticket).order_by(Ticket.created_at.desc())))
    data = [ticket_data(t, db) for t in tickets]
    by_department = []
    for department in db.scalars(select(Department).order_by(Department.name)):
        items = [t for t in data if t['department'] == department.name and t['status'] != 'resolved']
        by_department.append({'department': department.name, 'open': len(items),
                              'at_risk': sum(t['sla_state'] == 'at_risk' for t in items),
                              'overdue': sum(t['sla_state'] == 'overdue' for t in items)})
    by_staff = []
    for member in db.scalars(select(User).where(User.role == 'staff').order_by(User.name)):
        items = [t for t in data if t['owner_id'] == member.id and t['status'] != 'resolved']
        by_staff.append({'staff': member.name, 'department': db.get(Department, member.department_id).name,
                         'open': len(items), 'waiting': sum(t['status'] == 'waiting_for_student' for t in items),
                         'at_risk': sum(t['sla_state'] in {'at_risk', 'overdue'} for t in items)})
    return {'unassigned': sum(not t['owner_id'] and t['status'] != 'resolved' for t in data),
            'at_risk': sum(t['sla_state'] == 'at_risk' for t in data),
            'overdue': sum(t['sla_state'] == 'overdue' for t in data),
            'open_escalations': len(list(db.scalars(select(Escalation).where(Escalation.acknowledged_at.is_(None))))),
            'reopened': sum(t['reopen_count'] > 0 for t in data), 'departments': by_department,
            'staff_workload': by_staff}


class TriageBody(BaseModel):
    subject: str = Field(default='', max_length=160)
    description: str = Field(default='', max_length=5000)


@app.post('/api/triage')
def triage_ticket(body: TriageBody, user: User = Depends(current_user), db: Session = Depends(database)):
    if user.role != 'student':
        raise HTTPException(403, 'Only students can use request triage')
    text = f'{body.subject} {body.description}'.lower()
    rules = [(1, {'attendance', 'absent', 'present', 'class', 'lecture'}),
             (2, {'fee', 'payment', 'paid', 'refund', 'amount'}),
             (3, {'id card', 'identity card', 'lost card', 'damaged card'}),
             (4, {'certificate', 'bonafide', 'transcript', 'document'})]
    scores = {category: sum(keyword in text for keyword in words) for category, words in rules}
    suggested_id = max(scores, key=scores.get) if any(scores.values()) else None
    words = {word for word in re.findall(r'[a-z0-9]+', text) if len(word) > 3}
    similar = []
    for ticket in db.scalars(select(Ticket).where(Ticket.student_id == user.id, Ticket.status != 'resolved')):
        existing = set(re.findall(r'[a-z0-9]+', f'{ticket.subject} {ticket.description}'.lower()))
        overlap = len(words & existing) / max(len(words), 1)
        if overlap >= .3:
            similar.append(ticket_data(ticket, db))
    category = db.get(Category, suggested_id) if suggested_id else None
    return {'suggested_category_id': suggested_id, 'suggested_category': category.name if category else None,
            'reason': 'Matched common request terms' if category else 'No confident category match',
            'similar_tickets': similar[:3]}
