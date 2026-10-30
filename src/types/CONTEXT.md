# Type System & Data Contracts
- Single Source of Truth: All canonical domain contracts are defined in `curriculum.ts`.
- Synchronization: Backend Pydantic models in `backend/app/schemas/` must mirror these TypeScript definitions 1:1.
- Rule AST: Prerequisite formulas use recursive AST nodes (`AND`, `OR`, `COURSE`, `CREDIT_THRESHOLD`).
- Strict Mode: `"verbatimModuleSyntax": true` is enforced. Always import types via `import type { ... }`.
- Forbidden: `any` types are strictly prohibited across the entire codebase.
