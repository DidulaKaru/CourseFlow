# Sprint 1 Implementation Plan: Didula (Lead, Architect & Backend Developer)

**Role:** Lead Architect & Backend Developer  
**Sprint Focus:** Core Graph & Layout Math, AST Rule Engine, Zustand Store, and FastAPI Backend Architecture  
**Target Milestone:** Sprint 1 Delivery (Zero-Login Student Web App for 2 Degree Programs)

---

## 1. Responsibilities & Domain Ownership
Didula acts as the architectural anchor and backend lead for CourseFlow. In Sprint 1, responsibilities encompass:
- Defining and maintaining the Single Source of Truth (SSOT) across TypeScript interfaces and backend Pydantic schemas.
- Implementing the deterministic swimlane coordinate layout mathematics ($X = (\text{semesterIndex} - 1) \times 280\text{px}$ for 1-indexed semesters).
- Developing the recursive Abstract Syntax Tree (AST) prerequisite boolean evaluator.
- Architecting the client-side Zustand store with `localStorage` guest-mode persistence.
- Scaffolding the FastAPI backend application structure and initial API contracts.
- Code review, CI/CD oversight, and repository quality gate enforcement.

---

## 2. Phase-by-Phase Execution Roadmap

```
┌────────────────────────────────────────────────────────────────────────┐
│ Phase 1: Canonical Type Contracts & Schema Governance                  │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
┌───────────────────────────────────▼────────────────────────────────────┐
│ Phase 2: Deterministic 8-Semester Swimlane Layout Mathematics          │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
┌───────────────────────────────────▼────────────────────────────────────┐
│ Phase 3: Recursive AST Boolean Rule Evaluator                          │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
┌───────────────────────────────────▼────────────────────────────────────┐
│ Phase 4: Zustand Store & LocalStorage Persistence                      │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
┌───────────────────────────────────▼────────────────────────────────────┐
│ Phase 5: FastAPI Core Skeleton & Endpoint Contracts                    │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
┌───────────────────────────────────▼────────────────────────────────────┐
│ Phase 6: Code Review & Quality Gate Governance                         │
└────────────────────────────────────────────────────────────────────────┘
```

---

### Phase 1: Canonical Type Contracts & Schema Governance
* **Goal:** Finalize TypeScript definitions matching the canonical data contracts in `architecture.md` Section 5.
* **Target Files:**
  - `src/types/curriculum.ts`
  - `src/types/CONTEXT.md`
* **Tasks:**
  1. Confirm `RuleType`: `'AND' | 'OR' | 'COURSE' | 'CREDIT_THRESHOLD'`.
  2. Implement `CourseRuleNode`, `CreditThresholdRuleNode`, `LogicalRuleNode`, and `PrerequisiteRule` union.
  3. Implement `CreditDistribution` interface (`semesterIndex: number`, `creditsAllocated: number`).
  4. Ensure `Course` interface matches:
     ```typescript
     export interface Course {
       id: string;
       code: string;
       title: string;
       description: string;
       totalCredits: number;
       durationSemesters: number; // 1 (standard) or 2 (capstone)
       recommendedSemester: number; // 1 through 8
       creditDistribution: CreditDistribution[];
       type: 'CORE' | 'ELECTIVE' | 'LAB' | 'CAPSTONE';
       prerequisiteRule: PrerequisiteRule | null;
       corequisites: string[];
       offeredSemesters: ('FALL' | 'SPRING' | 'BOTH')[];
     }
     ```
  5. Ensure `DegreeProgram` container matches requirements (`totalCreditsRequired: 150`, `minCreditsPerSemester: 18`, `maxCreditsPerSemester: 24`, `semestersCount: 8`).
* **Verification:** `npx tsc --noEmit` runs with 0 errors.

---

### Phase 2: Deterministic 8-Semester Swimlane Layout Mathematics
* **Goal:** Prevent unpredictable force-directed node movement by providing exact coordinate calculation for canvas nodes.
* **Target Files:**
  - `src/core/layout.ts`
  - `src/core/CONTEXT.md`
* **Algorithmic Rules:**
  - Horizontal $X$-coordinate is strictly fixed:
    $$X = (\text{semesterIndex} - 1) \times 280\text{px} + \text{COLUMN\_OFFSET}$$
  - Vertical $Y$-coordinate is computed dynamically based on the course's vertical order within its semester column:
    $$Y = \text{slotIndex} \times (\text{NODE\_HEIGHT} + \text{VERTICAL\_GAP}) + \text{TOP\_PADDING}$$
  - Multi-semester courses: Card spans across or anchors in the starting semester with explicit multi-semester visual indicators.
* **Tasks:**
  1. Create `calculateLayout(courses: Course[], selectedElectiveIds: string[])`:
     - Filters courses (keeps all CORE + selected ELECTIVEs).
     - Groups courses into buckets by `recommendedSemester` (1 to 8).
     - Assigns deterministic $(x, y)$ positions to each node.
     - Generates React Flow edges from prerequisites.
* **Verification:** Unit test asserting node coordinates conform to the linear semester column bounds.

---

### Phase 3: Recursive AST Boolean Rule Evaluator
* **Goal:** Build a robust, pure evaluation engine for complex university prerequisites.
* **Target Files:**
  - `src/core/algorithms/ast_evaluator.ts`
  - `src/core/__tests__/ast_evaluator.test.ts`
* **Logic:**
  ```typescript
  export function evaluatePrerequisite(
    rule: PrerequisiteRule | null,
    completedCourses: Set<string>,
    earnedCredits: number
  ): boolean
  ```
  - `null`: returns `true` (no prerequisites).
  - `COURSE`: checks `completedCourses.has(rule.courseId)`.
  - `CREDIT_THRESHOLD`: checks `earnedCredits >= rule.minCredits`.
  - `AND`: returns `rule.children.every(child => evaluatePrerequisite(child, completedCourses, earnedCredits))`.
  - `OR`: returns `rule.children.some(child => evaluatePrerequisite(child, completedCourses, earnedCredits))`.
* **Verification:** Unit tests covering single courses, nested `AND`/`OR` structures, credit thresholds, and empty rule sets.

---

### Phase 4: Zustand Store & LocalStorage Persistence
* **Goal:** Provide reactive, local-first state management without requiring student authentication.
* **Target Files:**
  - `src/core/store.ts`
* **Tasks:**
  1. Define `PlannerState` interface:
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
  3. Configure Zustand `persist` middleware with `createJSONStorage(() => localStorage)`.
  4. Ensure only necessary state fields (`activeProgramId`, `selectedElectiveIds`, `completedCourseIds`) are serialized.
* **Verification:** State changes survive page refresh in local browser storage.

---

### Phase 5: FastAPI Core Skeleton & Endpoint Contracts
* **Goal:** Initialize the high-performance Python FastAPI backend service and define API contracts.
* **Target Files:**
  - `backend/app/main.py`
  - `backend/app/core/config.py`
  - `backend/app/schemas/curriculum.py`
  - `backend/app/api/v1/endpoints/degrees.py`
  - `backend/app/api/v1/endpoints/courses.py`
* **Tasks:**
  1. Configure FastAPI app with CORS middleware allowing `http://localhost:5173`.
  2. Implement `/health` probe endpoint.
  3. Mirror canonical Pydantic models for `Course`, `DegreeProgram`, and `PrerequisiteRule`.
  4. Scaffold routes:
     - `GET /api/v1/degrees`: List available degree programs.
     - `GET /api/v1/degrees/{id}`: Retrieve detailed curriculum graph for a degree.
     - `POST /api/v1/validate-plan`: Validate credit limits and prerequisite AST logic on backend.
* **Verification:** `pytest backend/tests` passes; endpoints return 200 OK.

---

### Phase 6: Code Review & Quality Gate Governance
* **Goal:** Ensure smooth integration across Malsha, Ishani, and Anuththara.
* **Tasks:**
  1. Enforce git branch conventions (`feature/<ticket-id>-<description>` into `dev`).
  2. Review Pull Requests against Definition of Done (no `any`, strict type checking, passing tests).
  3. Verify CI workflow status before approving squash merges into `dev`.

---

## 3. Definition of Done (DoD) for Sprint 1
- [ ] Canonical TypeScript schemas strictly match `architecture.md`.
- [ ] `calculateLayout()` produces deterministic column coordinates with zero horizontal variance.
- [ ] `evaluatePrerequisite()` handles arbitrary nested `AND`/`OR`/`CREDIT_THRESHOLD` ASTs.
- [ ] Zustand store correctly manages guest-mode selections and persists to `localStorage`.
- [ ] FastAPI backend service boots up cleanly with CORS enabled and health check passing.
- [ ] 100% of unit tests pass under `npm test` and `pytest`.
