# CourseFlow: System State Ledger

## 1. Project Health & Active Milestone
- **Active Sprint:** Sprint 1: Curriculum DAG Canvas, Interactive Planner & Infrastructure (3 Weeks)
- **Sprint Window:** October 12, 2026 – November 01, 2026
- **Active Branch:** `dev`
- **Sprint Goal:** Ship a working, zero-login Student Web App for 2 engineering degree programs (Computer Engineering & Electrical Engineering) rendering an 8-semester swimlane DAG canvas, interactive elective selection, >= 18 semester credit checks, 150 total credit validation, multi-semester split credits, and client-side PDF plan export. Complete Docker setup, database schema foundation, and CI/CD quality gates.
- **Total Backlog Story Points:** 58 SP (14 User Stories) | **Engineering Execution:** 98 SP (22 Jira Tasks)

---

## 2. Invariants & Settled Architecture (DO NOT OVERRIDE)
- **Zero Student Auth:** Guest mode only. User state is persisted locally via `localStorage`. Plans can be exported/imported as portable JSON.
- **Database Boundary:** Single PostgreSQL instance with `pgvector` (schema and container initialized in Sprint 1, API connection in Sprint 1/2). Academic tables separate from community/ratings tables. No dual databases.
- **Multi-Semester Spanning Modules:** Modeled using `creditDistribution` arrays with `semesterIndex`. Never duplicate course codes or halve credits manually.
- **Deterministic Layout:** Semesters strictly mapped to X-coordinates ($X = (\text{semesterIndex} - 1) \times 280\text{px}$ for 1-indexed semesters). Dagre handles Y-axis vertical ordering only.
- **Propositional Logic AST:** Prerequisites stored natively in `JSONB` as recursive boolean trees (`AND`, `OR`, `COURSE`, `CREDIT_THRESHOLD`).
- **Git Airlock:** Strict feature branching (`feature/<ticket>-<description>`) merged into `dev` via PR approval with green GitHub Actions CI gates.

---

## 3. Epics Framework (Sprint 1 & Sprint 2)

| Epic Key | Epic Name | Target System Application | Target Sprint | Epic Lead |
| :--- | :--- | :--- | :--- | :--- |
| **CF-EPIC-1** | Curriculum DAG Canvas & Dependency Visualizer | Student Web App | Sprint 1 | Malsha & Didula |
| **CF-EPIC-2** | Interactive Degree Planner & Constraint Engine | Student Web App | Sprint 1 | Didula & Malsha |
| **CF-EPIC-3** | Study Plan Export & Local Persistence | Student Web App | Sprint 1 | Malsha |
| **CF-EPIC-4** | Infrastructure, DevOps & Automated Quality Gates | Core Infrastructure | Sprint 1 & 2 | Ishani |
| **CF-EPIC-5** | Database Architecture & Curriculum Data Modeling | Core Data Layer | Sprint 1 | Anuththara |
| **CF-EPIC-6** | Faculty Admin Authentication & In-App Course Editor | Faculty Admin Portal | Sprint 2 | Didula & Malsha |
| **CF-EPIC-7** | MIS Document Ingestion & Text Parsing Pipeline | MIS Extraction Engine | Sprint 2 | Anuththara & Ishani |
| **CF-EPIC-8** | Automated Course Feature & Prerequisite AST Extraction | MIS Extraction Engine | Sprint 2 | Anuththara & Didula |
| **CF-EPIC-9** | Extraction Review Dashboard & Database Ingestion | MIS Extraction Engine | Sprint 2 | Malsha, Didula & Anuththara |

---

## 4. Sprint 1 Product Backlog (User Stories)

| User Story ID | User Story Narrative | Priority | Story Points | Target Epic |
| :--- | :--- | :--- | :--- | :--- |
| **US001** | As a student, I want instant, zero-friction access to the curriculum graph visualizer without needing to create an account or log in. | Must Have | 3 | CF-EPIC-1 |
| **US002** | As a student, I want to switch seamlessly between the 2 initial engineering degree programs via a top navigation selector. | Must Have | 3 | CF-EPIC-1 |
| **US003** | As a student, I want to view my degree curriculum as an interactive DAG rendered across 8 semester swimlanes. | Must Have | 8 | CF-EPIC-1 |
| **US004** | As a student, I want to zoom, pan, and navigate smoothly across the 8-semester curriculum canvas. | Must Have | 3 | CF-EPIC-1 |
| **US005** | As a student, I want to click any course node to highlight its upstream prerequisites and downstream unlocked courses while dimming unrelated nodes. | Must Have | 5 | CF-EPIC-1 |
| **US006** | As a student, I want to open a slide-over drawer to read comprehensive module descriptions, syllabus objectives, and prerequisite breakdowns. | Must Have | 5 | CF-EPIC-1 |
| **US007** | As a student, I want to select and deselect elective modules to customize my personalized study path. | Must Have | 5 | CF-EPIC-2 |
| **US008** | As a student, I want to receive immediate visual warnings (red/amber badges) if I choose an elective whose prerequisites are unmet. | Must Have | 5 | CF-EPIC-2 |
| **US009** | As a student, I want to view a real-time semester credit counter that warns me if my planned semester falls below the 18-credit minimum. | Must Have | 5 | CF-EPIC-2 |
| **US010** | As a student, I want to track my cumulative planned credits against the 150-credit graduation requirement. | Must Have | 3 | CF-EPIC-2 |
| **US011** | As a student, I want multi-semester spanning modules (e.g., capstones) to automatically split credits across their consecutive semesters. | Must Have | 5 | CF-EPIC-2 |
| **US012** | As a student, I want my elective choices, completed courses, and custom plan to auto-save in browser localStorage so my work is preserved on return. | Must Have | 3 | CF-EPIC-3 |
| **US013** | As a student, I want to export and download my validated 8-semester study plan as a clean, formatted PDF document. | Must Have | 5 | CF-EPIC-3 |
| **US014** | As a student, I want to export and import my planner configuration as a portable JSON file to back up or transfer between devices without an account. | Should Have | 3 | CF-EPIC-3 |

---

## 5. Sprint 1 Granular Jira Tasks by Team Member (98 SP Total)

### Didula (Lead Architect & Backend Developer) — 23 SP
| Ticket Key | Task Summary | SP | Target Epic | Acceptance Criteria Highlights |
| :--- | :--- | :--- | :--- | :--- |
| [x] **CF-101** | System Architecture Invariants & Contract Setup | 5 | CF-EPIC-1 / CF-EPIC-2 | `npm run generate-types` generates identical TypeScript interfaces matching FastAPI models. |
| [x] **CF-102** | Deterministic Swimlane Layout Mathematical Engine | 5 | CF-EPIC-1 | Nodes render in strict columns ($X = (\text{semesterIndex}-1)\times 280\text{px}$) with zero horizontal overlap across terms. |
| [x] **CF-103** | Recursive Boolean AST Prerequisite Evaluator | 5 | CF-EPIC-2 | Unit tests pass for compound prerequisite expressions with 100% logic accuracy. |
| [ ] **CF-104** | Local-First Zustand State Engine with Persistence | 3 | CF-EPIC-2 / CF-EPIC-3 | Browser refresh preserves active plan without data loss. |
| [ ] **CF-105** | FastAPI Core Server & Degree Metadata Endpoints | 5 | CF-EPIC-1 / CF-EPIC-2 | Endpoints return validated JSON adhering to OpenAPI schema. |

### Malsha (Frontend & Documentation Specialist) — 31 SP
| Ticket Key | Task Summary | SP | Target Epic | Acceptance Criteria Highlights |
| :--- | :--- | :--- | :--- | :--- |
| **CF-111** | Interactive React Flow Canvas Setup | 5 | CF-EPIC-1 | Canvas renders smoothly at 60 FPS on 1080p and 4K displays. |
| **CF-112** | Custom CourseNode Component with Tailwind CSS v4 | 5 | CF-EPIC-1 | Left handle = target, Right handle = source; styles dynamically reflect default, warning, and completed states. |
| **CF-113** | Semester Swimlane Column Headers & Credit Meters | 5 | CF-EPIC-1 / CF-EPIC-2 | Header shows current semester credit sum and updates in real time on elective toggle. |
| **CF-114** | Slide-Over Module Details Drawer | 5 | CF-EPIC-1 | Drawer transitions smoothly from right; closes on backdrop click or Escape key. |
| **CF-115** | Degree Switcher Navigation Bar | 3 | CF-EPIC-1 | Switching programs updates canvas graph instantly with zero full-page reload. |
| **CF-116** | Client-Side PDF Study Plan Exporter | 5 | CF-EPIC-3 | Clicking "Download Plan PDF" downloads a formatted PDF within 2 seconds. |
| **CF-117** | Project Documentation & Jira Board Initialization | 3 | Governance | Jira backlog organized with epics, points, and assignments matching this plan. |

### Ishani (QA & DevOps Engineer) — 23 SP
| Ticket Key | Task Summary | SP | Target Epic | Acceptance Criteria Highlights |
| :--- | :--- | :--- | :--- | :--- |
| **CF-121** | Docker Compose Local Environment Stack | 5 | CF-EPIC-4 | `docker compose up` starts all services with zero manual configuration. |
| **CF-122** | GitHub Actions CI/CD Pipeline & Branch Airlocks | 5 | CF-EPIC-4 | Pull requests are blocked on GitHub if any check fails. |
| **CF-123** | Pre-Commit Quality Hooks (Husky & Lint-Staged) | 3 | CF-EPIC-4 | Commits containing TypeScript errors or formatting defects are rejected locally. |
| **CF-124** | Automated Backend Test Suite (Pytest) | 5 | CF-EPIC-4 | Test suite achieves >= 85% code coverage across core algorithmic modules. |
| **CF-125** | Automated Frontend Test Suite (Vitest) | 5 | CF-EPIC-4 | All frontend tests pass in under 5 seconds in CI pipeline. |

### Anuththara (Database & AI Engineer) — 21 SP
| Ticket Key | Task Summary | SP | Target Epic | Acceptance Criteria Highlights |
| :--- | :--- | :--- | :--- | :--- |
| **CF-131** | PostgreSQL Database Initialization & SQLAlchemy Models | 5 | CF-EPIC-5 | Tables created with foreign keys, unique course code constraints, and JSONB columns for AST trees. |
| **CF-132** | Database Migration Framework (Alembic) | 3 | CF-EPIC-5 | `alembic upgrade head` runs cleanly from a fresh database container. |
| **CF-133** | Curriculum Dataset Collection & Validation: Computer Engineering | 5 | CF-EPIC-5 | All core and elective modules, prerequisites, and credit distributions validated with zero syntax errors. |
| **CF-134** | Curriculum Dataset Collection & Validation: Electrical Engineering | 5 | CF-EPIC-5 | Complete curriculum accurately represented; all cross-departmental prerequisites resolve. |
| **CF-135** | Automated Database Seeder Script | 3 | CF-EPIC-5 | Script runs idempotently (safe to re-run without creating duplicate records). |

---

## 6. Agile Ceremonies & Quality Gates (Definition of Done)

### Agile Ceremonies
1. **Sprint Planning:** First Monday of the sprint (1 hour). Review backlog items, confirm story points, and commit to sprint scope.
2. **Daily Standup (Asynchronous on Discord/Slack):** Every morning by 09:30 AM:
   - What did you accomplish yesterday?
   - What are you working on today?
   - Are there any technical blockers?
3. **Sprint Review & Live Demo:** Final Friday of the sprint (1 hour). Demonstrate working software on the `dev` branch.
4. **Sprint Retrospective:** Immediately following review (30 minutes). Discuss: What went well? What slowed us down? Action items for the next sprint.

### Definition of Done (DoD)
A story is only marked **Done** in Jira when:
- Code is implemented on an isolated `feature/<ticket>-<description>` branch.
- Unit & integration tests pass with zero regressions.
- Static typecheck passes (`npx tsc --noEmit` and Python `ruff` / typecheck).
- PR is opened targeting `dev`, passing GitHub Actions CI checks (CourseFlow Quality Gate).
- PR is reviewed and approved by Didula (Lead Architect).
- PR is Squash Merged into `dev` and local branches are synchronized.
- Feature is validated against acceptance criteria on the live development build.

---

## 7. Current Execution Status
- [x] **CF-101:** System Architecture Invariants & Contract Setup completed.
- [x] **CF-102:** Deterministic Swimlane Layout Mathematical Engine completed (barycentric ordering, deterministic X/Y coordinates, multi-semester spanning modules).
- [x] **CF-103:** Recursive Boolean AST Prerequisite Evaluator completed (recursive AND/OR/COURSE/CREDIT_THRESHOLD engine with granular diagnostics, human-readable formatting, and 100% logic coverage).
- Frontend canvas foundation mounted with custom nodes and mock dataset.
- Layout coordinate calculator and AST evaluator implemented in TypeScript.
- PostgreSQL schema models, seed datasets, and Docker Compose configurations under active integration.