# Type System & Canonical Data Contracts

## 1. Core Principles & Invariants
- **Single Source of Truth (SSOT):** All canonical domain contracts for the frontend application are defined in `src/types/curriculum.ts`.
- **Backend Model Synchronization:** Backend Pydantic models in `backend/app/schemas/curriculum.py` mirror these TypeScript definitions 1:1, using camelCase aliases (`to_camel`).
- **OpenAPI Type Generation:** `src/types/api.ts` contains types auto-generated from the FastAPI OpenAPI schema via `npm run generate-types`.
- **Recursive AST Architecture:** Prerequisite rules are modeled as Abstract Syntax Trees with boolean operator nodes (`AND`, `OR`) and leaf constraint nodes (`COURSE`, `CREDIT_THRESHOLD`).
- **Multi-Semester Spanning Modules:** Modeled using `CreditDistribution` arrays with `semesterIndex` (1 to 8) and `creditsAllocated`. Never duplicate course codes or halve credits manually.
- **Strict TypeScript Compliance:**
  - `"verbatimModuleSyntax": true` is enforced in `tsconfig.app.json`.
  - Always import types using `import type { ... }`.
  - The `any` type is strictly forbidden across the codebase.

## 2. File Organization
- `curriculum.ts`: Canonical domain models (`Course`, `DegreeProgram`, `PrerequisiteRule`, `CreditDistribution`, etc.).
- `api.ts`: Auto-generated OpenAPI schema types output by `openapi-typescript`.
- `CONTEXT.md`: This architectural context slice.

## 3. Automated Type Generation Runbook
When backend Pydantic schemas are updated:
```powershell
# 1. Start the FastAPI backend server (or ensure port 8000 is running)
uvicorn app.main:app --port 8000 --reload

# 2. In another terminal, generate the client API types
npm run generate-types
```
