# CourseFlow: System State Ledger

## 1. Project Health & Active Milestone
- **Current Milestone:** Sprint 1 Complete (100% Verified) ──► Sprint 2 Active Planning & Execution
- **Sprint 1 Window:** October 12, 2026 – November 01, 2026 (Completed)
- **Sprint 2 Window:** November 02, 2026 – November 22, 2026 (Active)
- **Active Branch:** `dev`
- **Sprint 2 Goal:** Deliver an automated Module Information Sheet (MIS) Ingestion & Feature Extraction Engine capable of parsing syllabus PDFs/DOCXs, extracting metadata and prerequisite ASTs using a local Small Language Model (Qwen 2.5 7B via Ollama + Instructor), surfaced via a side-by-side human review screen with 1-click database commit. Deploy authenticated admin in-app module content editor.
- **Sprint 2 Backlog Story Points:** 49 SP (11 User Stories) | **Engineering Execution:** 108 SP (20 Jira Tasks)

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
| [x] **CF-104** | Local-First Zustand State Engine with Persistence | 3 | CF-EPIC-2 / CF-EPIC-3 | Browser refresh preserves active plan without data loss. |
| [x] **CF-105** | FastAPI Core Server & Degree Metadata Endpoints | 5 | CF-EPIC-1 / CF-EPIC-2 | Endpoints return validated JSON adhering to OpenAPI schema. |

### Malsha (Frontend & Documentation Specialist) — 31 SP
| Ticket Key | Task Summary | SP | Target Epic | Acceptance Criteria Highlights |
| :--- | :--- | :--- | :--- | :--- |
| [x] **CF-111** | Interactive React Flow Canvas Setup | 5 | CF-EPIC-1 | Canvas renders smoothly at 60 FPS on 1080p and 4K displays. |
| [x] **CF-112** | Custom CourseNode Component with Tailwind CSS v4 | 5 | CF-EPIC-1 | Left handle = target, Right handle = source; styles dynamically reflect default, warning, and completed states. |
| [x] **CF-113** | Semester Swimlane Column Headers & Credit Meters | 5 | CF-EPIC-1 / CF-EPIC-2 | Header shows current semester credit sum and updates in real time on elective toggle. |
| [x] **CF-114** | Slide-Over Module Details Drawer | 5 | CF-EPIC-1 | Drawer transitions smoothly from right; closes on backdrop click or Escape key. |
| [x] **CF-115** | Degree Switcher Navigation Bar | 3 | CF-EPIC-1 | Switching programs updates canvas graph instantly with zero full-page reload. |
| [x] **CF-116** | Client-Side PDF Study Plan Exporter | 5 | CF-EPIC-3 | Clicking "Download Plan PDF" downloads a formatted PDF within 2 seconds. |
| **CF-117** | Project Documentation & Jira Board Initialization | 3 | Governance | Jira backlog organized with epics, points, and assignments matching this plan. |

### Ishani (QA & DevOps Engineer) — 23 SP
| Ticket Key | Task Summary | SP | Target Epic | Acceptance Criteria Highlights |
| :--- | :--- | :--- | :--- | :--- |
| [x] **CF-121** | Docker Compose Local Environment Stack | 5 | CF-EPIC-4 | `docker compose up` starts all services with zero manual configuration. |
| [x] **CF-122** | GitHub Actions CI/CD Pipeline & Branch Airlocks | 5 | CF-EPIC-4 | Pull requests are blocked on GitHub if any check fails. |
| [x] **CF-123** | Pre-Commit Quality Hooks (Husky & Lint-Staged) | 3 | CF-EPIC-4 | Commits containing TypeScript errors or formatting defects are rejected locally. |
| [x] **CF-124** | Automated Backend Test Suite (Pytest) | 5 | CF-EPIC-4 | Test suite achieves >= 85% code coverage across core algorithmic modules. |
| [x] **CF-125** | Automated Frontend Test Suite (Vitest) | 5 | CF-EPIC-4 | All frontend tests pass in under 5 seconds in CI pipeline. |

### Anuththara (Database & AI Engineer) — 21 SP
| Ticket Key | Task Summary | SP | Target Epic | Acceptance Criteria Highlights |
| :--- | :--- | :--- | :--- | :--- |
| [x] **CF-131** | PostgreSQL Database Initialization & SQLAlchemy Models | 5 | CF-EPIC-5 | Tables created with foreign keys, unique course code constraints, and JSONB columns for AST trees. |
| [x] **CF-132** | Database Migration Framework (Alembic) | 3 | CF-EPIC-5 | `alembic upgrade head` runs cleanly from a fresh database container. |
| [x] **CF-133** | Curriculum Dataset Collection & Validation: Computer Engineering | 5 | CF-EPIC-5 | All core and elective modules, prerequisites, and credit distributions validated with zero syntax errors. |
| [x] **CF-134** | Curriculum Dataset Collection & Validation: Electrical Engineering | 5 | CF-EPIC-5 | Complete curriculum accurately represented; all cross-departmental prerequisites resolve. |
| [x] **CF-135** | Automated Database Seeder Script | 3 | CF-EPIC-5 | Script runs idempotently (safe to re-run without creating duplicate records). |

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
- [x] **CF-135:** Automated Database Seeder Script completed (`seed_db.py` idempotently upserts programs, courses, credit distributions, and AST rules).
- [x] **CF-134:** Curriculum Dataset: Electrical Engineering completed and validated (`electrical_engineering.json` with 95 courses, 0 dangling references).
- [x] **CF-133:** Curriculum Dataset: Computer Engineering completed and validated (`computer_engineering.json` with 80 courses, 0 dangling references).
- [x] **CF-132:** Database Migration Framework (Alembic) completed (`0001_initial_curriculum_tables.py` verified with upgrade/downgrade).
- [x] **CF-131:** PostgreSQL Database Initialization & SQLAlchemy Models completed (`app/models/curriculum.py` with `DegreeProgram`, `Course`, `CreditDistribution`, `PrerequisiteRule`, `program_courses`).
- [x] **CF-116:** Client-Side PDF Study Plan Exporter completed (StudyPlanPDF official 2-page academic layout with @react-pdf/renderer, 8-semester tabular credit breakdown, multi-semester capstone split credit accounting, official compliance verification stamp, dynamic filename CourseFlow_Plan_<Degree>_<Timestamp>.pdf, and ExportPdfButton embedded in TopNav).
- [x] **CF-115:** Degree Switcher Navigation Bar completed (TopNav with CourseFlow brand identity, DegreeSelector dropdown for Computer Engineering and Electrical and Information Engineering, global graduation credit meter tracking N / 150 Credits with eligibility status, and instant zero-reload canvas graph recomputation via Zustand activeProgramId).
- [x] **CF-114:** Slide-Over Module Details Drawer completed (smooth right slide-in, Escape/backdrop dismissal, syllabus objectives, contact hours breakdown, AST prerequisite logic chips, multi-semester timeline, and interactive study plan toggles).
- [x] **CF-113:** Semester Swimlane Column Headers & Credit Meters completed (sticky 8-semester column banners, real-time credit summation, multi-semester capstone credit slices, and underload/overload visual badges).
- [x] **CF-111:** Interactive React Flow Canvas Setup completed (smoothstep routing, controls, minimap, hover and selection dependency illumination).
- [x] **CF-112:** Custom CourseNode Component with Tailwind CSS v4 completed (Left target handle, Right source handle, dynamic status badges, direct elective toggle, AST prerequisite warning alert, and completed states).
- [x] **CF-101:** System Architecture Invariants & Contract Setup completed.
- [x] **CF-102:** Deterministic Swimlane Layout Mathematical Engine completed (barycentric ordering, deterministic X/Y coordinates, multi-semester spanning modules).
- [x] **CF-103:** Recursive Boolean AST Prerequisite Evaluator completed (recursive AND/OR/COURSE/CREDIT_THRESHOLD engine with granular diagnostics, human-readable formatting, and 100% logic coverage).
- [x] **CF-104:** Local-First Zustand State Engine with Persistence completed (localStorage caching, multi-semester credit split calculation, 150-credit progress tracker, and ADR-001 portable JSON export/import).
- [x] **CF-105:** FastAPI Core Server & Degree Metadata Endpoints completed (REST endpoints for program summaries, complete curriculum graphs, plan validation engine, and synchronized OpenAPI schemas).
- [x] **Didula's Sprint 1 Tasks:** 100% Completed (All 5 tickets / 23 SP merged to `dev`).
- [x] **Anuththara's Sprint 1 Tasks:** 100% Completed (All 5 tickets / 21 SP verified and seeded into PostgreSQL).
- Frontend canvas foundation mounted with custom nodes and mock dataset.
- Layout coordinate calculator and AST evaluator implemented in TypeScript and Python with 100% test coverage.
- PostgreSQL schema models, seed datasets, and database migrations fully operational and validated.

---

## 8. Sprint 2 Product Backlog & Engineering Roadmap

### Product Backlog (User Stories)
| User Story ID | User Story Narrative | Priority | Story Points | Target Epic | Lead / Assignee |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **US015** | As a faculty admin, I want to authenticate securely to access administrative course editing and document extraction tools. | Must Have | 5 | CF-EPIC-6 | Didula & Malsha |
| **US016** | As a faculty curriculum coordinator, I want to edit course attributes (title, description, credits, contact hours, type) in an in-app modal. | Must Have | 5 | CF-EPIC-6 | Malsha & Didula |
| **US017** | As an academic advisor, I want to modify course prerequisite rules and multi-semester credit distributions directly from the admin interface. | Must Have | 5 | CF-EPIC-6 | Didula & Malsha |
| **US018** | As a faculty data officer, I want to drag-and-drop syllabus PDFs/DOCXs to ingest course information automatically. | Must Have | 5 | CF-EPIC-7 | Anuththara & Ishani |
| **US019** | As a system, I want to parse structured contact hour grids, descriptions, and metadata tables from uploaded documents using `pdfplumber` with OCR fallback. | Must Have | 5 | CF-EPIC-7 | Anuththara |
| **US020** | As a system, I want to extract structured Course entities matching Pydantic contracts from raw syllabus text using a local SLM (Qwen 2.5 7B via Ollama) and Instructor. | Must Have | 5 | CF-EPIC-8 | Anuththara |
| **US021** | As a system, I want to automatically parse complex natural-language prerequisite clauses into recursive boolean AST JSON structures. | Must Have | 5 | CF-EPIC-8 | Anuththara & Didula |
| **US022** | As a faculty reviewer, I want a split-screen view showing the uploaded PDF on the left and extracted editable fields with confidence scores on the right. | Must Have | 5 | CF-EPIC-9 | Malsha |
| **US023** | As a faculty reviewer, I want to approve and commit extracted and verified course data directly to PostgreSQL with 1 click. | Must Have | 5 | CF-EPIC-9 | Didula, Malsha & Anuththara |
| **US024** | As a QA engineer, I want comprehensive test suites and malformed document fixtures validating the ingestion API and LLM extraction pipelines. | Must Have | 5 | CF-EPIC-4 | Ishani |
| **US025** | As a developer/DevOps, I want Ollama containerized in Docker Compose with pre-pulled Qwen 2.5 7B models for deterministic local inference. | Must Have | 5 | CF-EPIC-4 | Ishani |

### Granular Sprint 2 Jira Tasks by Team Member (108 SP Total)

#### Didula (Lead Architect & Backend Developer) — 23 SP
| Ticket Key | Task Summary | SP | Target Epic | Acceptance Criteria Highlights |
| :--- | :--- | :--- | :--- | :--- |
| [ ] **CF-201** | Faculty Admin Authentication & Security Session Management | 5 | CF-EPIC-6 | JWT Bearer auth, RBAC dependencies, student routes remain 100% public. |
| [ ] **CF-202** | In-App Course CRUD & Content Modification Endpoints | 5 | CF-EPIC-6 | PUT/PATCH endpoints persist course updates to PostgreSQL with credit validation. |
| [ ] **CF-203** | Administrative Prerequisite & AST Persistence Service | 5 | CF-EPIC-6 | AST JSONB mutation with depth guard ($\le 20$) and no dangling references. |
| [ ] **CF-204** | MIS Ingestion API & Extraction Review Endpoints | 5 | CF-EPIC-7 / CF-EPIC-9 | Multipart file upload, job status polling, and atomic database commit. |
| [ ] **CF-205** | System Contract Sync & PR Merge Governance | 3 | All Epics | `npm run generate-types` syncs frontend types; zero regression quality gate enforced. |

#### Malsha (Frontend & Documentation Specialist) — 31 SP
| Ticket Key | Task Summary | SP | Target Epic | Acceptance Criteria Highlights |
| :--- | :--- | :--- | :--- | :--- |
| [ ] **CF-211** | Faculty Admin Authentication Modal & Session State | 3 | CF-EPIC-6 | Skyrim obsidian glass modal, `useAuthStore` JWT token management, TopNav admin pill. |
| [ ] **CF-212** | In-App Course Editor Modal & Form Controls | 5 | CF-EPIC-6 | Course editing modal with optimistic UI graph updates on the canvas. |
| [ ] **CF-213** | Prerequisite AST Visual Rule Editor | 5 | CF-EPIC-6 | Visual boolean AST composer with nested AND/OR groups and live mathematical preview. |
| [ ] **CF-214** | MIS Document Upload Dropzone & Staging View | 5 | CF-EPIC-7 | Drag-and-drop upload zone, progress bar, and staging queue table. |
| [ ] **CF-215** | Extraction Review Split-Screen Dashboard | 8 | CF-EPIC-9 | Dual-pane PDF viewer + editable field form with color-coded confidence badges. |
| [ ] **CF-216** | Sprint 2 Documentation & Jira Governance | 5 | Governance | Jira Sprint 2 backlog, admin user guide, and updated architectural context files. |

#### Ishani (QA & DevOps Engineer) — 23 SP
| Ticket Key | Task Summary | SP | Target Epic | Acceptance Criteria Highlights |
| :--- | :--- | :--- | :--- | :--- |
| [ ] **CF-221** | Containerized Local SLM Runtime & Ollama Orchestration | 5 | CF-EPIC-4 | Ollama container running Qwen 2.5 7B in `docker-compose.yml` with health checks. |
| [ ] **CF-222** | Document Upload & Extraction E2E Integration Test Suite | 5 | CF-EPIC-4 / CF-EPIC-7 | Pytest suite testing upload, job polling, and commit with mock SLM fixtures. |
| [ ] **CF-223** | Malformed PDF & OCR Fixture Library | 5 | CF-EPIC-4 / CF-EPIC-7 | Curated PDF fixture corpus verifying clean extraction and graceful error handling. |
| [ ] **CF-224** | Automated Admin Auth & In-App Editor Vitest Suite | 5 | CF-EPIC-4 / CF-EPIC-6 | Vitest unit tests for auth store, course editor modal, and visual AST editor. |
| [ ] **CF-225** | CI/CD Pipeline Expansion & Security Audit Gates | 3 | CF-EPIC-4 | `bandit`, `pip-audit`, and secret scanning pre-commit checks in GitHub Actions. |

#### Anuththara (Database & AI Engineer) — 23 SP
| Ticket Key | Task Summary | SP | Target Epic | Acceptance Criteria Highlights |
| :--- | :--- | :--- | :--- | :--- |
| [ ] **CF-231** | Deterministic PDF Text & Tabular Extraction Pipeline | 5 | CF-EPIC-7 | `pdfplumber` parsing contact hour tables and body text with OCR fallback. |
| [ ] **CF-232** | Local SLM Integration & Ollama Client Architecture | 5 | CF-EPIC-8 | Async Ollama client with optimized system prompts and telemetry logging. |
| [ ] **CF-233** | Grammar-Guided Structured Extraction with Instructor & Pydantic | 5 | CF-EPIC-8 | Schema-constrained extraction with field-level confidence score estimation. |
| [ ] **CF-234** | Natural-Language Prerequisite to Recursive AST Synthesizer | 5 | CF-EPIC-8 | Translates natural language prerequisite clauses into canonical boolean AST JSON. |
| [ ] **CF-235** | Extraction Job Persistence & Database Ingestion Service | 3 | CF-EPIC-9 | SQLAlchemy `ExtractionJob` model, Alembic migration, and atomic database upsert. |

### Sprint 2 Implementation Plan Documents
Detailed individual engineering plans are preserved in:
- [Didula_Sprint2.md](file:///c:/Users/didul/Documents/GitHub/CourseFlow/plans/Didula_Sprint2.md) (Lead Architect & Backend Developer)
- [Malsha_Sprint2.md](file:///c:/Users/didul/Documents/GitHub/CourseFlow/plans/Malsha_Sprint2.md) (Frontend & Documentation Specialist)
- [Ishani_Sprint2.md](file:///c:/Users/didul/Documents/GitHub/CourseFlow/plans/Ishani_Sprint2.md) (QA & DevOps Engineer)
- [Anuththara_Sprint2.md](file:///c:/Users/didul/Documents/GitHub/CourseFlow/plans/Anuththara_Sprint2.md) (Database & AI Engineer)

