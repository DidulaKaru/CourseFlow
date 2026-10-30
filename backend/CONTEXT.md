# Backend Architecture & Service Slices

## 1. Domain Scope & Invariants
- **FastAPI Core (`app/`):** Async Python REST API delivering curriculum graph datasets, constraint validation, and document parsing endpoints.
- **Contract-First Synchronization:** Backend Pydantic models in `app/schemas/` must mirror `src/types/curriculum.ts` 1:1 using camelCase aliases (`to_camel`).
- **OpenAPI Type Generation:** TypeScript definitions are synchronized via `npm run generate-types`, which invokes `openapi-typescript http://localhost:8000/openapi.json -o src/types/api.ts`.
- **Database Boundary:** Single PostgreSQL instance with `pgvector` extension for semantic syllabus search. No dual databases.

## 2. Directory Structure
```text
backend/
├── app/
│   ├── main.py              # FastAPI application initialization & router mounting
│   ├── schemas/             # Pydantic DTOs & data contracts
│   │   └── curriculum.py    # Course, PrerequisiteRule AST, DegreeProgram
│   ├── api/                 # API endpoint routers
│   ├── core/                # Backend settings, logging, and graph math
│   └── models/              # SQLAlchemy database ORM models
├── tests/                   # Pytest test suite
├── scripts/                 # Database seed scripts & schema exporters
└── requirements.txt         # Python dependencies
```

## 3. Operational Commands
- Start dev server: `uvicorn app.main:app --reload --port 8000` (run from `backend/`)
- Run tests: `pytest backend/tests`
- Run linter: `ruff check backend/`
