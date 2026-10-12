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
- **Lead:** React Flow canvas setup, AST validation engine, layout math.
- **Teammate 2:** Structured JSON generation for Computer Engineering & Electrical Engineering.
- **Teammate 3:** `CourseNode` Tailwind component & Swimlane column headers.
- **Teammate 4:** Slide-over `ModuleDetailsDrawer` & `@react-pdf/renderer` export.

## 4. Current Blockers / Next Step
- Complete initial React Flow canvas mount and verify custom node rendering with mock data.