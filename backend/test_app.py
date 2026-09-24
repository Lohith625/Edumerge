from concurrent.futures import ThreadPoolExecutor

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session
from backend import app as module


@pytest.fixture
def app(tmp_path, monkeypatch):
    test_engine = create_engine(f'sqlite:///{tmp_path}/test.db', connect_args={'check_same_thread': False})
    monkeypatch.setattr(module, 'engine', test_engine)
    with TestClient(module.app) as client:
        yield client
    test_engine.dispose()


def login(client, email='student@demo.edu'):
    response = client.post('/api/auth/login', json={'email': email, 'password': 'Demo@12345'})
    assert response.status_code == 200
    return response


def create(client):
    response = client.post('/api/tickets', json={
        'subject': 'Missing attendance record',
        'description': 'I was present for the Monday mathematics class. Please review.',
        'category_id': 1,
        'intake': {
            'roll_number': '23CS104', 'class_section': 'CSE 3B',
            'subject_name': 'Mathematics', 'attendance_date': '2026-09-22',
            'session': 'Period 2', 'expected_correction': 'Mark present',
        },
    })
    assert response.status_code == 201
    return response.json()['id']


def test_submission_claim_and_student_visibility(app):
    login(app)
    id = create(app)
    login(app, 'staff@demo.edu')
    assert app.post(f'/api/tickets/{id}/claim').status_code == 200
    login(app)
    ticket = app.get(f'/api/tickets/{id}').json()
    assert ticket['owner'] == 'Priya Rao'
    assert ticket['status'] == 'in_progress'
    assert len(ticket['events']) == 2
    assert {'label': 'Roll number', 'value': '23CS104'} in ticket['intake_details']


def test_permissions_and_session_revocation(app):
    assert app.get('/api/tickets').status_code == 401
    response = login(app)
    assert 'HttpOnly' in response.headers['set-cookie']
    assert 'SameSite=lax' in response.headers['set-cookie']
    id = create(app)
    assert app.post(f'/api/tickets/{id}/claim').status_code == 403
    login(app, 'meera@demo.edu')
    assert app.get(f'/api/tickets/{id}').status_code == 404
    assert id not in [t['id'] for t in app.get('/api/tickets').json()]
    login(app, 'accounts@demo.edu')
    assert app.get(f'/api/tickets/{id}').status_code == 404
    assert app.post(f'/api/tickets/{id}/claim').status_code == 404
    assert app.post('/api/tickets', json={'subject': 'Invalid staff request', 'description': 'A sufficiently long description here.', 'category_id': 1}).status_code == 403
    token = app.cookies.get('edumerge_session')
    app.post('/api/auth/logout')
    app.cookies.set('edumerge_session', token)
    assert app.get('/api/tickets').status_code == 401


def test_concurrent_claim_has_one_winner_and_one_event(app):
    login(app)
    id = create(app)
    clients = [TestClient(module.app), TestClient(module.app)]
    login(clients[0], 'staff@demo.edu')
    login(clients[1], 'arjun@demo.edu')
    with ThreadPoolExecutor(max_workers=2) as executor:
        codes = list(executor.map(lambda c: c.post(f'/api/tickets/{id}/claim').status_code, clients))
    assert sorted(codes) == [200, 409]
    with Session(module.engine) as db:
        events = list(db.scalars(select(module.TicketEvent).where(module.TicketEvent.ticket_id == id)))
        assert len(events) == 2
    for client in clients:
        client.close()


def test_validation_origin_and_manager_visibility(app):
    assert app.post('/api/auth/login', json={'email': 'student@demo.edu', 'password': 'wrong'}).status_code == 401
    login(app)
    assert app.post('/api/tickets', json={'subject': '     ', 'description': ' ' * 30, 'category_id': 1}).status_code == 422
    assert app.post('/api/tickets', json={'subject': 'Valid subject', 'description': 'A sufficiently long description here.', 'category_id': 999}).status_code == 422
    incomplete = app.post('/api/tickets', json={'subject': 'Attendance issue', 'description': 'A sufficiently long description here.', 'category_id': 1, 'intake': {'roll_number': '23CS104'}})
    assert incomplete.status_code == 422
    assert incomplete.json()['detail'] == 'Class / section is required for this request'
    assert app.post('/api/auth/logout', headers={'Origin': 'https://untrusted.example'}).status_code == 403
    login(app, 'manager@demo.edu')
    assert len(app.get('/api/tickets').json()) == 4
    assert app.post('/api/tickets/1/claim').status_code == 403


def test_registration_and_profile_permissions(app):
    payload = {'name': 'New Student', 'email': 'NEW@example.edu', 'password': 'NewPassword123', 'role': 'manager'}
    assert app.post('/api/auth/signup', json=payload).status_code == 201
    assert app.post('/api/auth/signup', json=payload).status_code == 409
    response = app.post('/api/auth/login', json={'email': 'new@example.edu', 'password': 'NewPassword123'})
    assert response.status_code == 200
    assert response.json()['role'] == 'student'
    assert app.get(f"/api/students/{response.json()['id']}").status_code == 200
    assert app.get('/api/students/1').status_code == 404
    login(app, 'staff@demo.edu')
    assert app.get('/api/students/1').status_code == 200
    assert app.get(f"/api/students/{response.json()['id']}").status_code == 404
    assert app.get('/api/students/3').status_code == 404
    assert app.post('/api/auth/signup', json={**payload, 'email': 'invalid'}).status_code == 422
    assert app.post('/api/auth/signup', json={**payload, 'password': 'short'}).status_code == 422


def test_google_login_creates_student_and_rejects_staff(app, monkeypatch):
    monkeypatch.setattr(module.id_token, 'verify_oauth2_token', lambda *_: {
        'iss': 'https://accounts.google.com', 'email': 'google.student@example.edu',
        'email_verified': True, 'name': 'Google Student',
    })
    assert app.get('/api/auth/google/config').json()['client_id'] == module.GOOGLE_CLIENT_ID
    response = app.post('/api/auth/google', json={'credential': 'a' * 30})
    assert response.status_code == 200
    assert response.json()['email'] == 'google.student@example.edu'
    assert response.json()['role'] == 'student'
    monkeypatch.setattr(module.id_token, 'verify_oauth2_token', lambda *_: {
        'iss': 'accounts.google.com', 'email': 'staff@demo.edu',
        'email_verified': True, 'name': 'Priya Rao',
    })
    assert app.post('/api/auth/google', json={'credential': 'b' * 30}).status_code == 403


def test_category_specific_conditional_validation(app):
    login(app)
    base = {'subject': 'Payment not reflected', 'description': 'My completed fee payment is not visible in the portal.', 'category_id': 2}
    intake = {'roll_number': '23CS104', 'semester': '5', 'fee_type': 'Tuition', 'issue_type': 'Payment not reflected'}
    response = app.post('/api/tickets', json={**base, 'intake': intake})
    assert response.status_code == 422
    assert response.json()['detail'] == 'Payment date is required for this payment issue'
    complete = {**intake, 'payment_date': '2026-09-20', 'amount': '25000', 'transaction_reference': 'TXN-123'}
    assert app.post('/api/tickets', json={**base, 'intake': complete}).status_code == 201
    card = {'subject': 'Wrong name on ID card', 'description': 'The spelling of my name is incorrect on my student ID.', 'category_id': 3,
            'intake': {'roll_number': '23CS104', 'class_section': 'CSE 3B', 'issue_type': 'Incorrect details'}}
    assert app.post('/api/tickets', json=card).status_code == 422


def test_conversation_wait_resolve_and_reopen(app):
    login(app)
    ticket_id = create(app)
    login(app, 'staff@demo.edu')
    assert app.post(f'/api/tickets/{ticket_id}/claim').status_code == 200
    assert app.post(f'/api/tickets/{ticket_id}/comments', json={'body': 'Checking the attendance register.', 'is_internal': True}).status_code == 201
    response = app.post(f'/api/tickets/{ticket_id}/request-info', json={'body': 'Please confirm the faculty name.'})
    assert response.status_code == 200
    assert response.json()['status'] == 'waiting_for_student'
    login(app)
    detail = app.get(f'/api/tickets/{ticket_id}').json()
    assert all(not comment['is_internal'] for comment in detail['comments'])
    assert app.post(f'/api/tickets/{ticket_id}/comments', json={'body': 'The faculty member was Dr Rao.'}).status_code == 201
    assert app.get(f'/api/tickets/{ticket_id}').json()['status'] == 'in_progress'
    login(app, 'staff@demo.edu')
    assert app.post(f'/api/tickets/{ticket_id}/resolve', json={'body': 'Attendance corrected in the register.'}).status_code == 200
    login(app)
    reopened = app.post(f'/api/tickets/{ticket_id}/reopen', json={'body': 'The student portal still shows absent.'})
    assert reopened.status_code == 200
    assert reopened.json()['cycle_number'] == 2
    assert reopened.json()['reopen_count'] == 1
    assert reopened.json()['owner'] == 'Priya Rao'


def test_manager_controls_reports_and_triage(app):
    login(app)
    triage = app.post('/api/triage', json={'subject': 'Fee payment missing', 'description': 'My paid tuition amount is not reflected'}).json()
    assert triage['suggested_category_id'] == 2
    ticket_id = create(app)
    login(app, 'manager@demo.edu')
    report = app.get('/api/reports/overview')
    assert report.status_code == 200
    assert 'departments' in report.json()
    assert 'staff_workload' in report.json()
    notifications = app.get('/api/notifications')
    assert notifications.status_code == 200
    assert notifications.json()
    notification_id = notifications.json()[0]['id']
    assert app.post(f'/api/notifications/{notification_id}/read').status_code == 200
    assert app.get('/api/notifications').json()[0]['read'] is True
    assert app.post(f'/api/tickets/{ticket_id}/reassign', json={'owner_id': 3}).status_code == 200
    assert app.post(f'/api/tickets/{ticket_id}/reassign', json={'owner_id': 5}).status_code == 422
    changed = app.post(f'/api/tickets/{ticket_id}/priority', json={'priority': 'urgent'})
    assert changed.status_code == 200
    assert changed.json()['priority'] == 'urgent'
    assert len(app.get('/api/staff').json()) == 4
