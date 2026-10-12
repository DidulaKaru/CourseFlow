# Core Graph & State Engine
- Manages global Zustand store with persist middleware (localStorage).
- Computes deterministic swimlane layout (X = semester * 280px).
- Contains algorithmic graph traversals (cycle detection, AST evaluator).
- Sub-agents must not alter state signatures without updating @/types/.
