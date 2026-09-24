# Edumerge Support

Student support and ticket management prototype for the Edumerge product-engineering assessment.

## Run locally

Python 3.11+ and Node 22.12+ recommended. From the repository root:

```powershell
python -m venv .venv
.venv\Scripts\python -m pip install -r backend/requirements.txt
npm install
```

Start the backend and frontend in separate terminals:

```powershell
.venv\Scripts\python -m uvicorn backend.app:app --host 127.0.0.1 --port 8000
```

```powershell
npm run dev
```

Open http://localhost:5173. Vite proxies `/api` to FastAPI. Backend API documentation: http://127.0.0.1:8000/docs.

## Deploy a live preview

The frontend and API must both be deployed. Netlify can host the React interface, but it cannot run the FastAPI application or keep the ticket database alive by itself.

1. Create a **Web Service** in Render from this repository. Render detects `render.yaml`; use the root folder, then deploy. Its public API URL will look like `https://edumerge-api.onrender.com`.
2. In Render's environment variables, set:

   ```text
   APP_ORIGIN=https://your-site.netlify.app
   COOKIE_SECURE=1
   GOOGLE_CLIENT_ID=538215766505-7nnc9d9sa938hrqr2it9nqmrdeckeuh2.apps.googleusercontent.com
   ```

   For a persistent demo database, create a PostgreSQL database and set `DATABASE_URL` to its SQLAlchemy URL, beginning `postgresql+psycopg://`. Without it, Render uses temporary SQLite storage and ticket changes can disappear when the service restarts.
3. In Netlify, import the same repository. The included `netlify.toml` sets build command `npm run build` and publish directory `dist`. Add this Netlify environment variable before deploying:

   ```text
   VITE_API_BASE=https://edumerge-api.onrender.com/api
   ```

   Replace the example with your actual Render URL, then redeploy Netlify.
4. In Google Cloud Console, open the OAuth client and add the exact Netlify address under **Authorized JavaScript origins**, for example `https://your-site.netlify.app`. Keep the local origin too. Google sign-in will fail until this exact production origin is added.

The deployed frontend calls the Render API directly. HTTPS is required because the cross-site session cookie uses `SameSite=None; Secure`.

The backend defaults to a persistent SQLite file (`edumerge.db`) for local review. PostgreSQL is the agreed target; Docker was unavailable during initial setup. To switch, start Docker Desktop, run `docker compose up -d db`, install the backend requirements, and set this in the backend terminal before starting:

```powershell
$env:DATABASE_URL = 'postgresql+psycopg://edumerge:edumerge_local@localhost:5432/edumerge'
```

Schema and demonstration records are created on startup. This is an initial schema bootstrap, not a migration system. SQLite data is not automatically transferred to PostgreSQL.

## Demo accounts

All seeded accounts use `Demo@12345`.

| Email | Access |
|---|---|
| student@demo.edu | Aarav, student |
| meera@demo.edu | Another student, for isolation checks |
| staff@demo.edu | Priya, Academics staff |
| arjun@demo.edu | Another Academics staff member |
| accounts@demo.edu | Accounts staff |
| admin@demo.edu | Administration staff |
| manager@demo.edu | Manager with campus-wide read access |

Choose Student / Staff / Manager on the login screen to fill credentials, then sign in. These identities and tickets are fictional demo data.

New students can use **Create an account**, then sign in with their own email and password (at least eight characters). Registration always creates a student account; staff and manager roles are provisioned separately. Email verification is not implemented in this local prototype.

Students can also use **Continue with Google**. The browser sends Google’s ID token to FastAPI, which verifies it and creates or signs in a student account. The configured local Google OAuth client accepts `http://localhost:5173` and uses Google Identity Services; staff and manager identities cannot use this route. For a different Google project, set `GOOGLE_CLIENT_ID` before starting the backend. A client secret is not used or stored by this sign-in method.

The sidebar includes **My profile** and **Switch account / sign out**. Staff can claim unassigned tickets directly in the queue or in ticket details, and view the requesting student's profile. Student profiles expose only basic account information; the request list respects the viewing staff member's department. Back buttons return from forms, profiles, ticket details, and My Tickets.

New requests use category-specific intake fields. Attendance collects the roll number, class/section, subject, affected date, session, and expected correction. Certificate, fee, and ID-card requests collect their own relevant details. Conditional fields appear only when needed—for example, payment references for payment-related fee issues and correction details for an incorrect ID card. The backend validates these rules and stores the answers as structured ticket intake data for the staff view.

## Review the complete workflow

1. Sign in as Student and submit an attendance correction request. The request assistant can suggest a category and warn about a similar open request.
2. Sign in as Academics Staff, claim the request, add an internal note, ask a public follow-up question, then resolve it.
3. Sign in again as Student, reply to resume the paused SLA, then reopen the resolved request if needed. A fresh SLA cycle is recorded.
4. Sign in as Manager to review ageing by department and staff workload, reassign an owned request, change priority, acknowledge escalations, and open SLA notifications.

Use separate browser profiles for simultaneous roles; tabs in the same profile share a session. Refresh the queue to fetch changes; live updates are not part of this prototype.

## Validation

```powershell
python -m pytest backend/test_app.py -q
npm run build
npx playwright test
```

Playwright requires the local servers above and uses installed Microsoft Edge via its `msedge` channel. API tests use isolated temporary databases, including an actual competing claim test.

## Architecture and boundaries

React/TypeScript → FastAPI → SQLAlchemy → relational database. Opaque session tokens are stored hashed in the database and sent through HttpOnly, SameSite cookies. Sessions expire after 12 hours and are revoked on logout. Mutating browser requests validate their origin. Passwords use salted scrypt hashes. Database writes for ticket state and history commit together; conditional updates prevent double claims.

Students see their own tickets. Staff see their department and must claim a request before taking staff actions. Managers see all tickets, can reassign eligible staff, update a priority, and acknowledge escalation records, but cannot claim work. Categories determine departments on the server.

SLA targets are 24 hours for attendance and fee queries, and 48 hours for ID-card and certificate requests. The SLA clock pauses while a request waits for the student and resumes on a student reply. At 70% of the active time it is shown as at risk. An in-process worker checks every minute and creates manager alerts for unclaimed requests after two hours and for overdue requests. This is suitable for a local demo; production should use a separate durable scheduler.

For HTTPS deployment, set `COOKIE_SECURE=1` and `APP_ORIGIN` to the exact frontend origin. Production hardening (login rate limiting, migrations, deployment configuration, pagination) remains ahead. Demo seeding defaults on for local evaluation; use `SEED_DEMO=0` outside demo environments.

## Scope deliberately deferred

Calendar-aware priority rules, historical resolution estimates, external messaging, a generative chatbot, root-cause analytics, automatic staff assignment, rate limiting, migrations, pagination, and deployment configuration are intentionally outside this assessment prototype.
