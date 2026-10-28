# Sprint 1 Implementation Plan: Ishani (QA & DevOps Engineer)

**Official Project Role:** QA & DevOps Engineer  
**Sprint Window:** October 12, 2026 – November 01, 2026 (3 Weeks)  
**Sprint Goal:** Ship a working, zero-login Student Web App for 2 engineering degree programs (Computer Engineering & Electrical Engineering) rendering an 8-semester swimlane DAG canvas, interactive elective selection, >= 18 semester credit checks, 150 total credit validation, multi-semester split credits, and client-side PDF plan export. Complete Docker setup, database schema foundation, and CI/CD quality gates.  
**Primary Tech Stack:** Docker, GitHub Actions, Pytest, Vitest, Ruff, Husky  
**Total Allocated Story Points:** 23 SP  

---

## 1. Core Ownership Domains & Responsibilities

Ishani leads quality assurance, continuous integration, test automation, and local developer environment orchestration. In Sprint 1, core responsibilities encompass:
- **Docker Containerization & Local Dev Stack:** Building and maintaining `docker-compose.yml` orchestrating the FastAPI backend, PostgreSQL database with `pgvector`, and Vite frontend with hot-reload.
- **CI/CD Automation & Branch Airlocks:** Creating `.github/workflows/ci.yml` running TypeScript compilation (`tsc --noEmit`), Python linting (`ruff`), and build verification across all Pull Requests targeting `main` and `dev`.
- **Pre-Commit Quality Hooks:** Configuring Husky and lint-staged to intercept syntax, formatting, and typing errors locally prior to `git commit`.
- **Automated Backend Testing Suite (Pytest):** Writing comprehensive unit and integration tests for layout mathematics, AST boolean evaluation logic, and credit calculation edge cases.
- **Automated Frontend Testing Suite (Vitest):** Implementing unit tests asserting elective add/drop toggles, credit summation boundary rules, and `localStorage` persistence.
- **Code Coverage & Quality Benchmarks:** Enforcing $\ge 85\%$ test coverage across core algorithmic and validation modules.

---

## 2. Epics & User Stories Mapping

### Target Epics
- **CF-EPIC-4: Infrastructure, DevOps & Automated Quality Gates** (Epic Lead | Core Infrastructure | Target: Sprint 1 & 2)

### User Stories Supported
Ishani's testing suites and DevOps infrastructure form the underlying reliability foundation verifying and gating all Sprint 1 deliverables:
| User Story ID | Narrative | Priority | Story Points | Target Epic | Verification Mechanism |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **US001 - US006** | Student Canvas & DAG Exploration | Must Have | 27 | CF-EPIC-1 | Vitest canvas mounting, node rendering, and responsive drawer tests |
| **US007 - US011** | Interactive Degree Planner & Constraints | Must Have | 23 | CF-EPIC-2 | Vitest & Pytest credit counters ($\ge 18\text{ cr}$), capstone splits, AST logic |
| **US012 - US014** | Study Plan Export & Persistence | Must / Should Have | 11 | CF-EPIC-3 | Vitest `localStorage` serialization & mock PDF generation triggers |

---

## 3. Granular Jira Tasks & Engineering Roadmap

| Ticket Key | Task Summary | Story Points | Target Epic | Assigned |
| :--- | :--- | :--- | :--- | :--- |
| **CF-121** | Docker Compose Local Environment Stack | 5 SP | CF-EPIC-4 | Ishani |
| **CF-122** | GitHub Actions CI/CD Pipeline & Branch Airlocks | 5 SP | CF-EPIC-4 | Ishani |
| **CF-123** | Pre-Commit Quality Hooks (Husky & Lint-Staged) | 3 SP | CF-EPIC-4 | Ishani |
| **CF-124** | Automated Backend Test Suite (Pytest) | 5 SP | CF-EPIC-4 | Ishani |
| **CF-125** | Automated Frontend Test Suite (Vitest) | 5 SP | CF-EPIC-4 | Ishani |

```
┌────────────────────────────────────────────────────────────────────────┐
│ CF-121: Docker Compose Local Environment Stack (5 SP)                  │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
┌───────────────────────────────────▼────────────────────────────────────┐
│ CF-122: GitHub Actions CI/CD Pipeline & Branch Airlocks (5 SP)         │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
┌───────────────────────────────────▼────────────────────────────────────┐
│ CF-123: Pre-Commit Quality Hooks (Husky & Lint-Staged) (3 SP)          │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
┌───────────────────────────────────▼────────────────────────────────────┐
│ CF-124: Automated Backend Test Suite (Pytest) (5 SP)                   │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
┌───────────────────────────────────▼────────────────────────────────────┐
│ CF-125: Automated Frontend Test Suite (Vitest) (5 SP)                  │
└────────────────────────────────────────────────────────────────────────┘
```

---

### CF-121: Docker Compose Local Environment Stack (5 SP)
* **Description:** Build `docker-compose.yml` orchestrating FastAPI backend, PostgreSQL database, and Vite frontend with hot-reload.
* **Target Files:**
  - `docker-compose.yml`
  - `backend/Dockerfile`
  - `.env.example`
* **Implementation Details:**
  1. Service `db`: `pgvector/pgvector:pg16` on port 5432 with health check probe.
  2. Service `backend`: Python 3.11/3.12 slim container with mounted live code volume, running Uvicorn server on port 8000.
  3. Service `frontend`: Node 20 container running Vite dev server on port 5173 with HMR.
  4. Service `ollama`: Placeholder container for local SLM runtime in Sprint 2.
  5. Provide `.env.example` detailing all required database, server, and CORS flags.
* **Acceptance Criteria:** `docker compose up` starts all services with zero manual configuration.

---

### CF-122: GitHub Actions CI/CD Pipeline & Branch Airlocks (5 SP)
* **Description:** Create `.github/workflows/ci.yml` running TypeScript typecheck (`tsc --noEmit`), Python linter (`ruff`), and frontend build verification.
* **Target Files:**
  - `.github/workflows/ci.yml`
* **Implementation Details:**
  1. Trigger on all Pull Requests and pushes to `main` and `dev`.
  2. Frontend Job:
     - Node.js 20 environment with npm caching.
     - `npm ci`
     - Static typecheck: `npx tsc --noEmit`
     - Linter: `npm run lint`
     - Automated test run: `npm test`
     - Production build test: `npm run build`
  3. Backend Job:
     - Python 3.11 environment with pip caching.
     - Dependency install: `pip install -r backend/requirements.txt`
     - Linter: `ruff check backend/`
     - Pytest test execution: `pytest backend/tests`
  4. Block merge if any workflow step fails.
* **Acceptance Criteria:** Pull requests are blocked on GitHub if any check fails.

---

### CF-123: Pre-Commit Quality Hooks (Husky & Lint-Staged) (3 SP)
* **Description:** Configure Husky to run linters and static typecheck locally prior to any git commit.
* **Target Files:**
  - `.husky/pre-commit`
  - `package.json` (`lint-staged`)
* **Implementation Details:**
  1. Install Husky and configure git hooks.
  2. Setup `lint-staged` config in `package.json`:
     - Format and lint staged `.ts`, `.tsx`, `.js`, `.json` files.
     - Enforce `npx tsc --noEmit` before commit execution.
     - Run `ruff check` on staged Python files.
* **Acceptance Criteria:** Commits containing TypeScript errors or formatting defects are rejected locally.

---

### CF-124: Automated Backend Test Suite (Pytest) (5 SP)
* **Description:** Write unit and integration tests for layout mathematics, AST evaluation logic, and credit calculation edge cases.
* **Target Files:**
  - `backend/tests/conftest.py`
  - `backend/tests/test_main.py`
  - `backend/tests/test_ast.py`
  - `backend/tests/test_layout.py`
* **Implementation Details:**
  1. AST evaluator tests: Compound `AND`/`OR` trees, credit threshold hurdles, missing prerequisite edge cases.
  2. Degree program validation: Total credit checks ($\ge 150$), semester credit boundaries ($18 \le \text{credits} \le 24$).
  3. FastAPI endpoint tests: `GET /api/programs`, `GET /api/programs/{id}`, `POST /api/plans/validate`.
  4. Integrate `pytest-cov` to track code coverage.
* **Acceptance Criteria:** Test suite achieves >= 85% code coverage across core algorithmic modules.

---

### CF-125: Automated Frontend Test Suite (Vitest) (5 SP)
* **Description:** Implement Vitest unit tests verifying elective selection toggles, credit summation rules, and `localStorage` persistence.
* **Target Files:**
  - `vite.config.ts` (Vitest config)
  - `src/core/__tests__/store.test.ts`
  - `src/core/__tests__/layout.test.ts`
  - `src/core/__tests__/ast_evaluator.test.ts`
* **Implementation Details:**
  1. Zustand Store Tests:
     - Selecting and deselecting electives updates `selectedElectiveIds`.
     - Toggling completed courses updates `completedCourseIds`.
     - Browser `localStorage` serialization & rehydration.
  2. Layout Math Tests:
     - Deterministic $X$-coordinates strictly match $X = (\text{semesterIndex} - 1) \times 280\text{px}$.
     - Zero column collisions across semesters.
  3. Credit Summation Tests:
     - Correctly sums mandatory core + selected electives.
     - Correctly splits multi-semester capstone course credits across terms.
* **Acceptance Criteria:** All frontend tests pass in under 5 seconds in CI pipeline.

---

## 4. Agile Ceremonies & Team Protocols

1. **Sprint Planning:** First Monday of the sprint (1 hour). Review backlog items, confirm story points, and commit to sprint scope.
2. **Daily Standup (Asynchronous on Discord/Slack):** Every morning by 09:30 AM:
   - What did you accomplish yesterday?
   - What are you working on today?
   - Are there any technical blockers?
3. **Sprint Review & Live Demo:** Final Friday of the sprint (1 hour). Demonstrate working software on the `dev` branch.
4. **Sprint Retrospective:** Immediately following review (30 minutes). Discuss: What went well? What slowed us down? Action items for Sprint 2.

---

## 5. Definition of Done (DoD) & Quality Gates

A story or engineering task is marked **Done** in Jira only when:
- [ ] Code is implemented on an isolated `feature/<ticket>-<description>` branch.
- [ ] Unit & integration tests pass with zero regressions (`npm test` and `pytest`).
- [ ] Static typecheck passes (`npx tsc --noEmit` and Python `ruff` / typecheck).
- [ ] PR is opened targeting `dev`, passing GitHub Actions CI checks (CourseFlow Quality Gate).
- [ ] PR is reviewed and approved by Didula (Lead Architect).
- [ ] PR is Squash Merged into `dev` and local branches are synchronized.
- [ ] Feature is validated against acceptance criteria on the live development build.
