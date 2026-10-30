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

- **State Store (`store.ts`):**
  - Manages global Zustand store with `persist` middleware for guest-mode `localStorage` caching (`courseflow-local-planner`).
  - Stores `activeProgramId`, `selectedElectiveIds`, `completedCourseIds`, and drawer state.
  - Implements ADR-001 export/import of study plans as portable JSON.

- **Algorithms (`algorithms/`):**
  - `ast_evaluator.ts`: Evaluates recursive boolean prerequisite ASTs (`AND`, `OR`, `COURSE`, `CREDIT_THRESHOLD`) against completed courses and total earned credits.
  - Cycle detection: DFS 3-coloring algorithm $O(V+E)$.
  - Longest / critical path analysis ($L(u)$ dynamic programming).

## 2. Architectural Rule
Sub-agents must never alter layout signatures or state contracts without synchronizing `@/types/curriculum.ts`.
