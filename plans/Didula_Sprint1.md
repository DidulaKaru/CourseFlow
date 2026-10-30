# Sprint 1 Implementation Plan: Didula (Lead Architect & Backend Developer)

**Official Project Role:** Lead Architect & Backend Developer  
**Sprint Window:** October 12, 2026 – November 01, 2026 (3 Weeks)  
**Sprint Goal:** Ship a working, zero-login Student Web App for 2 engineering degree programs (Computer Engineering & Electrical Engineering) rendering an 8-semester swimlane DAG canvas, interactive elective selection, >= 18 semester credit checks, 150 total credit validation, multi-semester split credits, and client-side PDF plan export. Complete Docker setup, database schema foundation, and CI/CD quality gates.  
**Primary Tech Stack:** Python (FastAPI), NetworkX, Pydantic, TypeScript, Git  
**Total Allocated Story Points:** 23 SP  

---

## 1. Core Ownership Domains & Responsibilities

Didula serves as Lead Architect and Backend Developer for CourseFlow. In Sprint 1, core responsibilities encompass:
- **System Architecture & Contract Sync:** Defining and maintaining the Single Source of Truth (SSOT) across Pydantic DTOs and auto-generated TypeScript definitions (`openapi-typescript`).
- **Graph Algorithms & Mathematics Engine:**
  - Deterministic 8-semester swimlane coordinate mathematics ($X = (\text{semesterIndex} - 1) \times 280\text{px}$ for 1-indexed semesters).
  - Dagre vertical ordering ($Y$) within semester columns to eliminate edge crossings.
- **Recursive AST Rule Engine:** Recursive evaluation of Abstract Syntax Tree rules (`AND`, `OR`, `COURSE`, `CREDIT_THRESHOLD`) against completed courses and earned credits.
- **Local-First State Architecture:** Client-side Zustand store with `localStorage` guest-mode persistence.
- **FastAPI Core Server & Endpoints:** Scaffolding the backend service, CORS policies, degree metadata endpoints, and plan validation.
- **PR Code Review & Merge Governance:** Reviewing all team pull requests, enforcing type safety, and maintaining the dev branch airlock.

---

## 2. Epics & User Stories Mapping

### Target Epics
- **CF-EPIC-1: Curriculum DAG Canvas & Dependency Visualizer** (Epic Co-Lead with Malsha | Student Web App)
- **CF-EPIC-2: Interactive Degree Planner & Constraint Engine** (Epic Lead with Malsha | Student Web App)

### User Stories Addressed
| User Story ID | Narrative | Priority | Story Points | Target Epic |
| :--- | :--- | :--- | :--- | :--- |
| **US001** | As a student, I want instant, zero-friction access to the curriculum graph visualizer without needing to create an account or log in. | Must Have | 3 | CF-EPIC-1 |
| **US002** | As a student, I want to switch seamlessly between the 2 initial engineering degree programs via a top navigation selector. | Must Have | 3 | CF-EPIC-1 |
| **US003** | As a student, I want to view my degree curriculum as an interactive DAG rendered across 8 semester swimlanes. | Must Have | 8 | CF-EPIC-1 |
| **US004** | As a student, I want to zoom, pan, and navigate smoothly across the 8-semester curriculum canvas. | Must Have | 3 | CF-EPIC-1 |
| **US005** | As a student, I want to click any course node to highlight its upstream prerequisites and downstream unlocked courses while dimming unrelated nodes. | Must Have | 5 | CF-EPIC-1 |
| **US007** | As a student, I want to select and deselect elective modules to customize my personalized study path. | Must Have | 5 | CF-EPIC-2 |
| **US008** | As a student, I want to receive immediate visual warnings (red/amber badges) if I choose an elective whose prerequisites are unmet. | Must Have | 5 | CF-EPIC-2 |
| **US009** | As a student, I want to view a real-time semester credit counter that warns me if my planned semester falls below the 18-credit minimum. | Must Have | 5 | CF-EPIC-2 |
| **US010** | As a student, I want to track my cumulative planned credits against the 150-credit graduation requirement. | Must Have | 3 | CF-EPIC-2 |
| **US011** | As a student, I want multi-semester spanning modules (e.g., capstones) to automatically split credits across their consecutive semesters. | Must Have | 5 | CF-EPIC-2 |

---

## 3. Granular Jira Tasks & Engineering Roadmap

| Ticket Key | Task Summary | Story Points | Target Epic | Assigned |
| :--- | :--- | :--- | :--- | :--- |
| [x] **CF-101** | System Architecture Invariants & Contract Setup | 5 SP | CF-EPIC-1 / CF-EPIC-2 | Didula |
| [x] **CF-102** | Deterministic Swimlane Layout Mathematical Engine | 5 SP | CF-EPIC-1 | Didula |
| [ ] **CF-103** | Recursive Boolean AST Prerequisite Evaluator | 5 SP | CF-EPIC-2 | Didula |
| [ ] **CF-104** | Local-First Zustand State Engine with Persistence | 3 SP | CF-EPIC-2 / CF-EPIC-3 | Didula |
| [ ] **CF-105** | FastAPI Core Server & Degree Metadata Endpoints | 5 SP | CF-EPIC-1 / CF-EPIC-2 | Didula |

```
┌────────────────────────────────────────────────────────────────────────┐
│ [x] CF-101: System Architecture Invariants & Contract Setup (5 SP)     │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
┌───────────────────────────────────▼────────────────────────────────────┐
│ [x] CF-102: Deterministic Swimlane Layout Mathematical Engine (5 SP)   │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
┌───────────────────────────────────▼────────────────────────────────────┐
│ CF-103: Recursive Boolean AST Prerequisite Evaluator (5 SP)             │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
┌───────────────────────────────────▼────────────────────────────────────┐
│ CF-104: Local-First Zustand State Engine with Persistence (3 SP)       │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
┌───────────────────────────────────▼────────────────────────────────────┐
│ CF-105: FastAPI Core Server & Degree Metadata Endpoints (5 SP)         │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
┌───────────────────────────────────▼────────────────────────────────────┐
│ PR Code Review & Quality Gate Governance                               │
└────────────────────────────────────────────────────────────────────────┘
```

---

### [x] CF-101: System Architecture Invariants & Contract Setup (5 SP)
* **Description:** Define shared DTOs in Pydantic and configure `openapi-typescript` to generate client contracts automatically.
* **Target Files:**
  - `src/types/curriculum.ts`
  - `src/types/CONTEXT.md`
  - `backend/app/schemas/curriculum.py`
  - `package.json` (`generate-types` script)
* **Implementation Details:**
  1. Define canonical types for `CourseRuleNode`, `CreditThresholdRuleNode`, `LogicalRuleNode`, and `PrerequisiteRule` union.
  2. Implement `CreditDistribution` interface (`semesterIndex: number`, `creditsAllocated: number`).
  3. Formulate `Course` model: `id`, `code`, `title`, `description`, `totalCredits`, `durationSemesters`, `recommendedSemester`, `creditDistribution`, `type` (`'CORE' | 'ELECTIVE' | 'LAB' | 'CAPSTONE'`), `prerequisiteRule`, `corequisites`, `offeredSemesters`.
  4. Formulate `DegreeProgram` container: `id`, `name`, `department`, `totalCreditsRequired: 150`, `minCreditsPerSemester: 18`, `maxCreditsPerSemester: 24`, `semestersCount: 8`, `courses: Course[]`.
  5. Setup script: `"generate-types": "openapi-typescript http://localhost:8000/openapi.json -o src/types/api.ts"`.
* **Acceptance Criteria:** [x] `npm run generate-types` generates identical TypeScript interfaces matching FastAPI models without manual adjustments.

---

### [x] CF-102: Deterministic Swimlane Layout Mathematical Engine (5 SP)
* **Description:** Implement mathematical coordinate calculator in `src/core/layout.ts` fixing X coordinates by semester ($X = (\text{semesterIndex} - 1) \times 280\text{px}$) and vertical Y spacing via Dagre.
* **Target Files:**
  - `src/core/layout.ts`
  - `src/core/CONTEXT.md`
  - `src/core/__tests__/layout.test.ts`
* **Mathematical Mechanics:**
  - Horizontal $X$-coordinate is strictly fixed:
    $$X = (\text{semesterIndex} - 1) \times 280\text{px} + \text{COLUMN\_OFFSET}$$
  - Vertical $Y$-coordinate is calculated by order within semester bucket:
    $$Y = \text{slotIndex} \times (\text{NODE\_HEIGHT} + \text{VERTICAL\_GAP}) + \text{TOP\_PADDING}$$
  - Dagre barycentric ordering applied strictly within column subsets to minimize edge cross-overs.
  - Multi-semester courses: Anchored to their start term with explicit multi-semester visual flags and horizontal span offsets.
* **Acceptance Criteria:** [x] Nodes render in strict columns with zero horizontal overlap across terms. Unit tests pass verifying linear coordinate assertions.

---

### CF-103: Recursive Boolean AST Prerequisite Evaluator (5 SP)
* **Description:** Write AST engine evaluating recursive `AND`, `OR`, `COURSE`, and `CREDIT_THRESHOLD` rules against completed course sets.
* **Target Files:**
  - `src/core/algorithms/ast_evaluator.ts`
  - `src/core/__tests__/ast_evaluator.test.ts`
* **Implementation Signature:**
  ```typescript
  export function evaluatePrerequisite(
    rule: PrerequisiteRule | null,
    completedCourses: Set<string>,
    earnedCredits: number
  ): boolean;
  ```
  - `null`: returns `true` (unconditional).
  - `COURSE`: returns `completedCourses.has(rule.courseId)`.
  - `CREDIT_THRESHOLD`: returns `earnedCredits >= rule.minCredits`.
  - `AND`: returns `rule.children.every(child => evaluatePrerequisite(child, completedCourses, earnedCredits))`.
  - `OR`: returns `rule.children.some(child => evaluatePrerequisite(child, completedCourses, earnedCredits))`.
* **Acceptance Criteria:** Unit tests pass for compound prerequisite expressions with 100% logic accuracy, including deeply nested and mixed operator trees.

---

### CF-104: Local-First Zustand State Engine with Persistence (3 SP)
* **Description:** Implement Zustand store with `persist` middleware caching `activeProgramId`, `selectedElectiveIds`, and `completedCourseIds` in `localStorage`.
* **Target Files:**
  - `src/core/store.ts`
  - `src/core/__tests__/store.test.ts`
* **Implementation Details:**
  1. Define `PlannerState`:
     - `activeProgramId: string`
     - `selectedElectiveIds: string[]`
     - `completedCourseIds: string[]`
     - `inspectedCourse: Course | null`
     - `isDrawerOpen: boolean`
  2. Implement actions:
     - `setActiveProgram(programId: string)`
     - `toggleElective(courseId: string)`
     - `toggleCompletedCourse(courseId: string)`
     - `openCourseDrawer(course: Course)`
     - `closeCourseDrawer()`
     - `resetPlanner()`
  3. Caching via `createJSONStorage(() => localStorage)` targeting only persistent selection keys.
* **Acceptance Criteria:** Browser refresh preserves active plan without data loss.

---

### CF-105: FastAPI Core Server & Degree Metadata Endpoints (5 SP)
* **Description:** Scaffold FastAPI project with endpoints: `GET /api/programs`, `GET /api/programs/{id}`, and `POST /api/plans/validate`.
* **Target Files:**
  - `backend/app/main.py`
  - `backend/app/core/config.py`
  - `backend/app/api/v1/endpoints/programs.py`
  - `backend/app/api/v1/endpoints/plans.py`
  - `backend/tests/test_programs.py`
* **Endpoints:**
  - `GET /api/programs`: List all degree program summaries (`id`, `name`, `department`).
  - `GET /api/programs/{id}`: Return complete 8-semester curriculum graph JSON.
  - `POST /api/plans/validate`: Backend validation service for semester credit totals ($\ge 18$) and prerequisite AST satisfiability.
* **Acceptance Criteria:** Endpoints return validated JSON adhering to OpenAPI schema with status 200 OK; invalid bodies return 422 Unprocessable Entity.

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
