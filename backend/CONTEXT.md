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
│   │   └── ast_evaluator.py       # Recursive boolean AST prerequisite evaluator
│   ├── schemas/                   # Pydantic DTOs & data contracts
│   │   ├── curriculum.py          # Course, PrerequisiteRule AST, DegreeProgram
│   │   └── plans.py               # PlanValidationRequest, PlanValidationResponse
│   ├── api/v1/                    # API v1 endpoint routers
│   │   ├── api.py                 # Router aggregator mounting /programs and /plans
│   │   └── endpoints/
│   │       ├── programs.py        # GET /api/programs, GET /api/programs/{id}
│   │       └── plans.py           # POST /api/plans/validate
│   └── models/                    # SQLAlchemy database ORM models
├── tests/                         # Pytest test suite
│   ├── test_schemas.py            # Contract fidelity & Pydantic model serialization
│   ├── test_ast.py                # Python AST prerequisite evaluator unit tests
│   └── test_programs.py           # Endpoint integration tests (programs & validation)
├── scripts/                       # Database seed scripts & schema exporters
│   └── export_openapi.py          # Standalone OpenAPI schema exporter
└── requirements.txt               # Python dependencies
```

## 3. Endpoints Implemented (CF-105)
- `GET /api/programs` & `GET /api/v1/programs`: Returns high-level summaries (`DegreeProgramSummary`) for all active degree programs (`computer-eng`, `electrical-eng`).
- `GET /api/programs/{id}` & `GET /api/v1/programs/{id}`: Returns complete 8-semester curriculum DAG (`DegreeProgram`) with courses, multi-semester capstone splits, and prerequisite ASTs. Returns 404 for unknown IDs.
- `POST /api/plans/validate` & `POST /api/v1/plans/validate`: Backend validation service for semester credit totals ($\ge 18$ credits warning), term caps ($\le 24$ credits), 150-credit graduation requirement, and prerequisite AST satisfiability.

## 4. Operational Commands
- Start dev server: `uvicorn app.main:app --reload --port 8000` (run from `backend/`)
- Run tests: `pytest backend/tests`
- Run linter: `ruff check backend/`
- Export OpenAPI schema: `python scripts/export_openapi.py`
