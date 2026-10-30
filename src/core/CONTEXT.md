# Core Graph & State Engine

## 1. Domain Scope & Invariants
- **Deterministic Swimlane Layout (`layout.ts`):**
  - **Horizontal Coordinates ($X$):** Strictly fixed by mathematical formula:
    $$X = (\text{semesterIndex} - 1) \times 280\text{px} + \text{COLUMN\_OFFSET}$$
    Nodes are never freely moved horizontally across semester boundaries.
  - **Vertical Coordinates ($Y$):** Dynamically computed per column slot:
    $$Y = \text{slotIndex} \times (\text{NODE\_HEIGHT} + \text{VERTICAL\_GAP}) + \text{TOP\_PADDING}$$
  - **Barycentric Ordering:** Employs a layered barycenter heuristic to order courses within each column, minimizing prerequisite edge crossings.
  - **Multi-Semester Spanning Modules:** Anchored to their start term with `isMultiSemester: true` and horizontal span width offset.
  - **Edge Generation:** Creates directed prerequisite edges (`source` = prerequisite $\rightarrow$ `target` = dependent) using `smoothstep` routing.

- **Recursive Boolean AST Prerequisite Evaluator (`algorithms/ast_evaluator.ts`):**
  - Evaluates recursive boolean trees against student progress:
    - `null`: Unconditional pass (`true`).
    - `COURSE`: Completed set contains `courseId`.
    - `CREDIT_THRESHOLD`: Total earned credits $\ge \text{minCredits}$.
    - `AND`: Every child sub-rule evaluates to `true`.
    - `OR`: At least one child sub-rule evaluates to `true`.
  - Diagnostics: `evaluatePrerequisiteWithDiagnostics` returns satisfaction state, missing course IDs, credit deficits, and human summaries.
  - Formatting: `formatPrerequisiteRule` converts recursive AST into mathematical boolean logic strings (e.g. `(EC101 AND EC102) OR (EC105 AND ≥ 30 Credits)`).
  - Progression helpers: `isCourseUnlocked` and `calculateEarnedCredits`.

- **State Store (`store.ts`):**
  - Manages global Zustand store with `persist` middleware for guest-mode `localStorage` caching (`courseflow-local-planner`).
  - Stores `activeProgramId`, `selectedElectiveIds`, `completedCourseIds`, and drawer state.
  - Implements ADR-001 export/import of study plans as portable JSON.

- **Algorithms Roadmap (`algorithms/`):**
  - `ast_evaluator.ts`: Recursive boolean prerequisite AST engine (CF-103).
  - Cycle detection: DFS 3-coloring algorithm $O(V+E)$.
  - Longest / critical path analysis ($L(u)$ dynamic programming).

## 2. Architectural Rule
Sub-agents must never alter layout signatures or state contracts without synchronizing `@/types/curriculum.ts`.
