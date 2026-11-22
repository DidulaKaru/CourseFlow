# Backend Architecture & Service Slices

## 1. Domain Scope & Invariants
- **FastAPI Core (`app/`):** Async Python REST API delivering curriculum graph datasets, constraint validation, and document parsing endpoints.
- **Contract-First Synchronization:** Backend Pydantic models in `app/schemas/` must mirror `src/types/curriculum.ts` 1:1 using camelCase aliases (`to_camel`).
- **OpenAPI Type Generation:** TypeScript definitions are synchronized via `npm run generate-types`, which invokes `openapi-typescript http://localhost:8000/openapi.json -o src/types/api.ts`.
- **Database Boundary:** Single PostgreSQL instance with `pgvector` extension for semantic syllabus search. No dual databases.

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
│   │           ├── programs.py    # GET /api/programs, GET /api/programs/{id}
│   │           └── plans.py       # POST /api/plans/validate
│   └── models/                    # SQLAlchemy database ORM models
├── tests/                         # Pytest test suite
│   ├── test_schemas.py            # Contract fidelity & Pydantic model serialization
│   ├── test_ast.py                # Python AST prerequisite evaluator unit tests
│   └── test_programs.py           # Endpoint integration tests (programs & validation)
├── scripts/                       # Database seed scripts & schema exporters
│   └── export_openapi.py          # Standalone OpenAPI schema exporter
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

## 4. Operational Commands
- Start dev server: `uvicorn app.main:app --reload --port 8000` (run from `backend/`)
- Run tests: `pytest backend/tests`
- Run linter: `ruff check backend/`
- Export OpenAPI schema: `python scripts/export_openapi.py`
