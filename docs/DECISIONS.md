# Agreed design and scope

This records the decisions implemented in the assessment prototype.

- One institution, departments: Academics, Accounts, Administration.
- Students submit requests and see only their own history.
- Categories route requests to department queues. Staff claim requests themselves.
- Managers monitor age, unresolved work, and staff activity; they can reassign eligible staff, update priority, and acknowledge escalations.
- React/TypeScript, Python FastAPI, PostgreSQL target. SQLite is the first local review fallback.
- One backend application with a scheduled worker sharing SLA rules.
- Light interface with indigo accents and mobile student access.

## Lifecycle and SLA policy

Open → In Progress → Waiting for Student → In Progress → Resolved.
Resolved → In Progress when the student reopens with a reason.

Claiming assigns one owner atomically. Resolving requires a public resolution note. Waiting requires a public question. A student's reply resumes the paused SLA. Internal department delays do not pause the SLA. Reopening retains the owner and starts a fresh SLA cycle; previous results remain preserved in `ticket_sla_cycles`.

Total ticket age never resets. SLA targets are snapshotted at cycle creation. First response means a public staff response, not merely taking ownership. Store UTC timestamps.

Proposed configurable demo thresholds: unclaimed after 2 elapsed hours → manager notification; 70% of active SLA consumed → at-risk indicator; missed deadline → escalation. The worker checks every minute. Unique ticket/cycle/escalation-level records prevent repeat notifications. Escalations do not automatically change owners.

## Implemented feature order

1. Login, student submission, department queue, claiming, and ownership history.
2. Replies, internal notes, waiting, resolving, and reopening.
3. SLA cycles, scheduled escalation, manager notifications, ageing/workload views, reassignment, and priority changes.
4. Rule-based category suggestions (student confirms), non-blocking same-student duplicate warnings, and reopened-ticket reporting.

Deferred: calendar-based priority scoring, historical ETAs, external messaging, AI chatbot, root-cause analytics, automatic workload assignment. FAQ is optional after the core works.

## Implementation boundary

The SLA worker runs in the FastAPI process for local demonstration. A production deployment should move scheduled escalation work to a durable worker, introduce database migrations, and add operational controls such as rate limiting and pagination.
