# Core Graph & State Engine

## 1. Domain Scope & Invariants
- **Deterministic Swimlane Layout (`layout.ts` - CF-102):**
  - **Horizontal Coordinates ($X$):** Strictly fixed by mathematical formula:
    $$X = (\text{semesterIndex} - 1) \times 280\text{px} + \text{COLUMN\_OFFSET}$$
    Nodes are never freely moved horizontally across semester boundaries.
  - **Vertical Coordinates ($Y$):** Dynamically computed per column slot:
    $$Y = \text{slotIndex} \times (\text{NODE\_HEIGHT} + \text{VERTICAL\_GAP}) + \text{TOP\_PADDING}$$
  - **Barycentric Ordering:** Employs a layered barycenter heuristic to order courses within each column, minimizing prerequisite edge crossings.
  - **Multi-Semester Spanning Modules:** Anchored to their start term with `isMultiSemester: true` and horizontal span width offset.
  - **Edge Generation:** Creates directed prerequisite edges (`source` = prerequisite $\rightarrow$ `target` = dependent) using `smoothstep` routing.

- **Recursive Boolean AST Prerequisite Evaluator (`algorithms/ast_evaluator.ts` - CF-103):**
  - Evaluates recursive boolean trees against student progress:
    - `null`: Unconditional pass (`true`).
    - `COURSE`: Completed set contains `courseId`.
    - `CREDIT_THRESHOLD`: Total earned credits $\ge \text{minCredits}$.
    - `AND`: Every child sub-rule evaluates to `true`.
    - `OR`: At least one child sub-rule evaluates to `true`.
  - **Prospective Degree Planning Evaluator (`evaluatePlannedPrerequisite`):**
    - Satisfies mandatory core/lab/capstone modules from strictly earlier semesters.
    - Satisfies elective modules if selected in planned electives in earlier semesters.
    - Evaluates `CREDIT_THRESHOLD` strictly against planned credits accumulated prior to the target semester.
    - Returns diagnostic satisfaction status, missing prerequisite course codes, credit deficit, and student-facing summaries.
  - Diagnostics: `evaluatePrerequisiteWithDiagnostics` returns satisfaction state, missing course IDs, credit deficits, and human summaries.
  - Formatting: `formatPrerequisiteRule` converts recursive AST into mathematical boolean logic strings (e.g. `(EC101 AND EC102) OR (EC105 AND ≥ 30 Credits)`).
  - Progression helpers: `isCourseUnlocked` and `calculateEarnedCredits`.

- **Local-First Multi-Plan State Store (`store.ts` - CF-104):**
  - Manages global Zustand store with `persist` middleware caching in browser `localStorage` under key `courseflow-local-planner`.
  - Multi-Plan Architecture (`StudyPlan`):
    - Stores study plans partitioned by degree program (`plans: Record<string, StudyPlan[]>`), with `activeProgramId` and `activePlanId`.
    - Actions: `createPlan`, `duplicatePlan`, `renamePlan`, `deletePlan`, `setActivePlan`.
    - Elective actions: `toggleElective`, `setSelectedElectives`, `isElectiveSelected`.
    - Program switching with plan isolation (zero data loss across departments).
  - UI View & Filter State:
    - `mobileViewMode: 'list' | 'canvas'`
    - `searchQuery: string`
    - `filterType: 'ALL' | 'CORE' | 'ELECTIVE' | 'LAB' | 'CAPSTONE'`
  - Credit Constraints Engine:
    - `calculateSemesterCredits`: Computes per-semester credit totals accounting for core, selected electives, and multi-semester capstone credit splits across terms.
    - `calculateTotalPlannedCredits`: Evaluates cumulative planned credits across the full curriculum.
    - `calculateGraduationProgress` / `getGraduationProgress`: Returns planned credits, core credits, elective credits, required threshold, eligibility, and completion percentage.
  - Study Plan Portability (ADR-001): `exportPlan` generates formatted JSON with schema version and timestamps; `importPlan` safely rehydrates state with schema migration support.

- **Algorithms Roadmap (`algorithms/`):**
  - `ast_evaluator.ts`: Recursive boolean prerequisite AST engine (CF-103 - Implemented).
  - Cycle detection: DFS 3-coloring algorithm $O(V+E)$.
  - Longest / critical path analysis ($L(u)$ dynamic programming).

## 2. Architectural Rule
Sub-agents must never alter layout signatures or state contracts without synchronizing `@/types/curriculum.ts`.
