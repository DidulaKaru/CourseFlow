# CourseFlow: System State Ledger

## 1. Project Health & Active Milestone
- **Active Sprint:** Sprint 1 (Visual DAG Canvas & Interactive Planner - 2 Degree Programs)
- **Active Branch:** `dev`
- **Target Deliverable:** Zero-login student canvas with 8 semester swimlanes, interactive elective selection, >= 18 semester credit checks, and PDF export.

## 2. Invariants & Settled Architecture (DO NOT OVERRIDE)
- **Zero Student Auth:** Guest mode only. User state is persisted locally via `localStorage`.
- **Database Boundary:** Single PostgreSQL instance (when deployed in Sprint 2). Academic tables separate from community/ratings tables. No dual databases.
- **Multi-Semester Spanning Modules:** Modeled using `creditDistribution` arrays with `semesterOffset`. Never duplicate course codes or halve credits manually.
- **Deterministic Layout:** Semesters strictly mapped to X-coordinates ($X = \text{semester} \times 280\text{px}$). Dagre handles Y-axis ordering only.

## 3. Sprint 1 Task Allocation
- **Didula (Lead, Architect & Backend):** Deterministic layout math ($X = \text{semester} \times 280\text{px}$), Zustand store setup, AST boolean rule evaluation engine, FastAPI backend skeleton.
- **Malsha (Frontend & Docs):** React Flow `@xyflow/react` canvas, custom `CourseNode` Tailwind card, 8-semester swimlane headers, degree switcher, slide-over `ModuleDetailsDrawer`, `@react-pdf/renderer` export, Jira/docs.
- **Ishani (QA & DevOps):** Docker Compose local environment (PostgreSQL + pgvector, FastAPI, Ollama), Vitest and Pytest test runners, GitHub Actions CI pipeline, Husky pre-commit gates.
- **Anuththara (Database & AI):** PostgreSQL models with SQLAlchemy/Alembic, `computer_engineering.json` and `electrical_engineering.json` curriculum datasets, database seeding script (`seed_db.py`).

## 4. Current Blockers / Next Step
- Complete component integration in frontend, launch local database via Docker Compose, and run initial test suites.