# Core Graph & State Engine
- **State Store (`store.ts`):** Manages global Zustand store with `persist` middleware for guest-mode `localStorage` caching (`courseflow-local-planner`).
- **Layout Math (`layout.ts`):** Computes deterministic swimlane coordinates ($X = \text{semesterIndex} \times 280\text{px}$). Dagre handles vertical ordering within columns.
- **Algorithms (`algorithms/`):** Contains pure algorithmic graph traversals:
  - `ast_evaluator.ts`: Evaluates recursive boolean prerequisite ASTs against passed courses and credits.
  - Cycle detection: DFS 3-coloring algorithm $O(V+E)$.
  - Longest / critical path analysis ($L(u)$ dynamic programming).
- **Rule:** Sub-agents must never alter state signatures without updating `@/types/`.
