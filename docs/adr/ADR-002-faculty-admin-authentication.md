# ADR-002: Faculty-Only JWT Authentication with Environment-Configured Accounts

## Context
ADR-001 keeps students in a zero-login guest mode. Sprint 2 adds an administrative surface (in-app course editing, prerequisite editing, syllabus ingestion and review) that mutates the shared curriculum database and must not be reachable anonymously. There are only a handful of faculty users, and the deployment target is free-tier serverless (Vercel + Neon), where durable per-session state is undesirable.

## Decision
- **Faculty-only authentication.** Only administrative routes require a session. `/programs` and `/plans` remain public and must never receive an auth dependency.
- **Stateless JWT access tokens** (PyJWT, HS256, 60-minute expiry, `type: access`). The algorithm is pinned on decode and `exp` / `sub` are required. `POST /auth/refresh` exchanges a still-valid token for a new one; there is no separate refresh token or server-side session store.
- **Accounts come from environment variables**, not a database table: `ADMIN_USERNAME` / `ADMIN_PASSWORD_HASH` and `REVIEWER_USERNAME` / `REVIEWER_PASSWORD_HASH`. Passwords are stored as salted bcrypt hashes (generated with `backend/scripts/hash_password.py`). There are no default credentials; an account with no hash cannot log in.
- **Two roles.** `ADMIN` edits courses and prerequisites. `FACULTY_REVIEWER` uploads, reviews and commits extractions. Routes use the `AdminUser` / `StaffUser` dependencies in `app/api/deps.py`; a missing or invalid token returns 401 and a wrong role returns 403. The router for course administration is guarded at router level so routes added later are protected by default.
- **The configuration is authoritative.** The role is always read from the account registry, never from the token, and removing an account invalidates its live tokens.
- **Fail safe on secrets.** A `SECRET_KEY` left at its default is refused when `ENVIRONMENT` is `production` or `staging`, or when running on Vercel.
- **`bcrypt` is used directly.** `passlib` was rejected: it is unmaintained and breaks against bcrypt 5.

## Consequences
- **Positive:** Students are unaffected; no user-management tables, email flows or session storage; works unchanged on serverless; the whole mechanism is small and fully covered by tests.
- **Negative:** Adding or removing a faculty account requires changing environment variables and redeploying. Sessions cannot be revoked individually before expiry (removing the account revokes its tokens). There is no login rate limiting yet (planned with the Sprint 5 security work).
- **Revisit when** more than a few faculty accounts are needed, per-user audit trails are required, or SSO is requested: move accounts to a database table behind the same `get_staff_accounts()` interface.

## Alternatives Considered
- **Users table + registration:** rejected as overhead for a handful of accounts and contrary to the lightweight posture of ADR-001.
- **Separate refresh tokens / server-side sessions:** rejected to keep the backend stateless on serverless.
- **OAuth2 password form (`/token`):** rejected in favor of a JSON login body matching the rest of the camelCase API.
