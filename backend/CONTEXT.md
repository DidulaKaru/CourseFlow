# Backend Architecture & Service Slices

## 1. Domain Scope & Invariants
- **FastAPI Core (`app/`):** Async Python REST API delivering curriculum graph datasets, constraint validation, and document parsing endpoints.
- **Contract-First Synchronization:** Backend Pydantic models in `app/schemas/` must mirror `src/types/curriculum.ts` 1:1 using camelCase aliases (`to_camel`).
- **OpenAPI Type Generation:** TypeScript definitions are synchronized via `npm run generate-types`, which invokes `openapi-typescript http://localhost:8000/openapi.json -o src/types/api.ts`.
- **Database Boundary:** Single PostgreSQL instance with `pgvector` extension for semantic syllabus search. No dual databases.
- **Authentication Boundary (ADR-002):** Only the faculty admin routes (`/auth`, `/courses`, later `/extraction`) are authenticated. `/programs` and `/plans` are public. Student-facing reads still use the bundled JSON catalogs, not PostgreSQL.

## 2. Directory Structure & Key Modules
```text
backend/
├── app/
│   ├── main.py                    # FastAPI application initialization & router mounting
│   ├── core/                      # Application settings & algorithmic engines
│   │   ├── config.py              # Pydantic BaseSettings (CORS, paths, constraints)
│   │   ├── ast_evaluator.py       # Recursive boolean AST prerequisite evaluator
│   │   └── security.py            # bcrypt hashing, staff account registry, JWT issue/verify (CF-201)
│   ├── schemas/                   # Pydantic DTOs & data contracts
│   │   ├── curriculum.py          # Course, PrerequisiteRule AST, DegreeProgram
│   │   ├── plans.py               # PlanValidationRequest, PlanValidationResponse
│   │   └── auth.py                # LoginRequest, TokenResponse, AuthenticatedUser, UserRole (CF-201)
│   ├── api/
│   │   ├── deps.py                # Auth guards: CurrentUser / AdminUser / StaffUser (CF-201)
│   │   └── v1/                    # API v1 endpoint routers
│   │       ├── api.py             # Router aggregator mounting /auth, /programs and /plans
│   │       └── endpoints/
│   │           ├── auth.py        # POST /auth/login, POST /auth/refresh, GET /auth/me
│   │           ├── courses.py     # POST /courses, PUT/PATCH /courses/{id} (ADMIN only, CF-202)
│   │           ├── programs.py    # GET /api/programs, GET /api/programs/{id}
│   │           └── plans.py       # POST /api/plans/validate
│   ├── services/
│   │   └── course_service.py      # Course create/replace/patch rules + transactions (CF-202)
│   └── models/                    # SQLAlchemy database ORM models
├── alembic/versions/              # 0001_initial_curriculum_tables, 0002_course_updated_at (single chain)
├── tests/                         # Pytest test suite (151 tests)
│   ├── conftest.py                # Shared fixtures: client, db_client (in-memory SQLite), admin_headers, reviewer_headers
│   ├── test_schemas.py            # Contract fidelity & Pydantic model serialization
│   ├── test_ast.py                # Python AST prerequisite evaluator unit tests
│   ├── test_programs.py           # Endpoint integration tests (programs & validation)
│   ├── test_main.py               # App startup, health, CORS, OpenAPI
│   ├── test_database.py           # ORM models and seeder idempotency
│   ├── test_layout.py             # Layout contract tests
│   ├── test_auth.py               # Faculty authentication, RBAC, token hardening (CF-201)
│   ├── test_courses.py            # Admin course CRUD and validation (CF-202)
│   └── test_migrations.py         # Alembic upgrade/downgrade and single-head check
├── scripts/                       # Database seed scripts & schema exporters
│   ├── export_openapi.py          # Standalone OpenAPI schema exporter
│   ├── seed_db.py                 # Idempotent catalog seeder
│   └── hash_password.py           # Generates bcrypt hashes for ADMIN/REVIEWER_PASSWORD_HASH
└── requirements.txt               # Python dependencies
```

## 3. Endpoints & Core Engines Implemented
- **CF-101 (Schemas & Invariants):** Canonical Pydantic schemas in `schemas/curriculum.py` (`DegreeProgram`, `Course`, `PrerequisiteRule`, `CreditDistribution`).
- **CF-103 (AST Prerequisite Engine):** Recursive boolean evaluator in `core/ast_evaluator.py` evaluating compound rules with diagnostics.
- **CF-105 (Degree Metadata & Plan Validation Endpoints):**
  - `GET /api/programs` & `GET /api/v1/programs`: Returns high-level summaries (`DegreeProgramSummary`) for all active degree programs (`computer-eng`, `electrical-eng`).
  - `GET /api/programs/{id}` & `GET /api/v1/programs/{id}`: Returns complete 8-semester curriculum DAG (`DegreeProgram`) with courses, multi-semester capstone splits, and prerequisite ASTs. Returns 404 for unknown IDs.
  - `POST /api/plans/validate` & `POST /api/v1/plans/validate`: Backend validation service for semester credit totals ($\ge 18$ credits warning), term caps ($\le 24$ credits), 150-credit graduation requirement, and prerequisite AST satisfiability.

- **CF-201 (Faculty Admin Authentication):** Stateless JWT (PyJWT, HS256) auth for faculty only; students stay unauthenticated (ADR-001).
  - `POST /api/v1/auth/login` (JSON `{username, password}` → `{accessToken, tokenType, expiresIn, user}`), `POST /api/v1/auth/refresh` (needs a still-valid token), `GET /api/v1/auth/me`. Also mounted under `/api`.
  - **Accounts come from environment** (`ADMIN_USERNAME`/`ADMIN_PASSWORD_HASH`, `REVIEWER_USERNAME`/`REVIEWER_PASSWORD_HASH`); there are no default credentials and no database table. Create hashes with `python backend/scripts/hash_password.py`.
  - **Guards** (`app/api/deps.py`): `CurrentUser` (any session), `AdminUser` (role `ADMIN`: course/prerequisite mutations), `StaffUser` (`ADMIN` or `FACULTY_REVIEWER`: extraction upload/review/commit). Missing/invalid/expired token → 401 with `WWW-Authenticate: Bearer`; wrong role → 403. Use them as `def handler(user: AdminUser)`.
  - **Invariants:** the role is always read from configuration, never from the token; removing an account revokes its live tokens; `SECRET_KEY` left at its default is refused when `ENVIRONMENT` is `production`/`staging` or on Vercel. Never attach a guard to `/programs` or `/plans`.
  - Uses `bcrypt` directly (not `passlib`, which is unmaintained and breaks on bcrypt 5).

- **CF-202 (Admin Course Editing):** `POST /api/v1/courses`, `PUT /api/v1/courses/{id}`, `PATCH /api/v1/courses/{id}`; the whole router requires `ADMIN`, so routes added later are protected by default. Responses use `{ success: true, data: AdminCourse }` (`AdminCourse` = `Course` + `updatedAt`).
  - **Rules:** credits 1 to 12; semester 1 to 8 and within every owning program's semester count; the course code is immutable (409) and unique catalog-wide (409 on create); corequisites must exist and not be self; titles are trimmed; unknown request fields are rejected (422) so prerequisite edits are never silently dropped.
  - **Credit distribution:** single-semester courses derive it from `totalCredits` and `recommendedSemester`; multi-semester courses must send a `creditDistribution` (consecutive from the start semester, summing to `totalCredits`) whenever credits, duration or start change.
  - **Persistence:** one transaction per request (rollback on any failure); `courses.updated_at` (migration `0002_course_updated_at`) is set on every mutation, including child-row-only changes. Prerequisite ASTs are untouched by these routes (see CF-203).
  - **Tests** run on in-memory SQLite via the `db_client`, `admin_headers` and `reviewer_headers` fixtures in `tests/conftest.py`.

- **CF-203 (Prerequisite & Credit-Distribution Persistence):** `PUT /api/v1/courses/{id}/prerequisites` (body is the `PrerequisiteRule` AST), `DELETE /api/v1/courses/{id}/prerequisites` (clears the rule) and `PUT /api/v1/courses/{id}/credit-distribution` (body is an array of `CreditDistribution`); same `ADMIN` router guard and `AdminCourse` envelope.
  - **Validation:** depth <= 20, empty `AND` / `OR`, unknown or self `courseId` and indirect cycles are rejected with 422; `core/ast_evaluator.py::find_rule_issues` is the shared, importable validator. Credit distribution reuses `check_distribution`.
  - **Persistence:** `courses.prerequisite_rule` and the `prerequisite_rules` table are written together and `updated_at` is bumped. `main.py` sets `separate_input_output_schemas=False` to keep single OpenAPI schema names.

## 4. Operational Commands
- Start dev server: `uvicorn app.main:app --reload --port 8000` (run from `backend/`)
- Run tests: `pytest backend/tests`
- Apply migrations: `python -m alembic upgrade head` (from `backend/`; an old `seed_db.py`-only database needs `python -m alembic stamp 0001_initial_curriculum_tables` first)
- Generate a faculty password hash: `python backend/scripts/hash_password.py`
- Regenerate frontend API types (backend running on :8000): `npm --workspace=frontend run generate-types`
- Run linter: `ruff check backend/`
- Export OpenAPI schema: `python scripts/export_openapi.py`
