---
name: contract-change
description: Procedure for changing any cross-stack contract in CourseFlow, such as domain types, Pydantic schemas, API endpoints, the prerequisite AST, the TS and Python evaluators, the persisted planner store or DB models and migrations. Use whenever a change on one side of the frontend/backend boundary must be mirrored on the other.
---

# Cross-stack contract change

CourseFlow mirrors its contracts across the stack, so a change that lands on only one side ships a silent mismatch that is hard to debug. Find every mirror first, then change them all in one branch.

## Mirror map

| Contract | Every place it lives |
| --- | --- |
| Domain types | `frontend/src/types/curriculum.ts`, `backend/app/schemas/*.py` (camelCase via `to_camel`), generated `frontend/src/types/api.ts` |
| Prerequisite AST | `curriculum.ts` types, `frontend/src/core/algorithms/ast_evaluator.ts`, `backend/app/core/ast_evaluator.py`, `scripts/check_invariants.py` (`AST_TYPES`), both catalogs |
| API routes | `backend/app/api/v1/endpoints/`, mounted at `/api` **and** `/api/v1` in `main.py`, `frontend/src/core/api.ts`, `api.ts` types |
| Planner persistence | `frontend/src/core/store.ts` (`name: 'courseflow-local-planner'`, `version`, `migrate`), JSON plan export/import |
| Database | `backend/app/models/`, a new Alembic revision in `backend/alembic/versions/` (single head), `backend/tests/test_migrations.py` |

## Rules

- **Evaluator parity.** The TS and Python evaluators must give the same result for every input. When you change one, change the other in the same commit, and add a shared case table that both test suites exercise with identical expectations (`frontend/src/core/__tests__/`, `backend/tests/test_ast.py`). Keep both `depth > 20` guards.
- **Generated types.** Never hand-edit `api.ts`. Start the backend (`npm run backend`) and run `npm --workspace=frontend run generate-types`, then commit the result with the schema change.
- **Store migrations.** Any change to the persisted shape needs a `version` bump and a `migrate()` branch that upgrades *every* older version. Add a test that feeds the old persisted JSON through `migrate` and asserts the new shape. Never rename the persist key, because that wipes every student's plans.
- **Migrations.** Only add migrations. Never edit an applied revision. Chain onto the current single head (`python -m alembic heads` shows exactly one), keep FK integrity, and make `downgrade()` real.
- **Auth boundary (ADR-002).** `/programs` and `/plans` stay public. New admin routes use the `AdminUser` / `StaffUser` guards, and the role comes from configuration. Student code paths never send a token.
- **Python 3.11.** CI runs 3.11, so avoid newer syntax (`type X = ...`, PEP 695 generics, `except*` is fine). `ruff.toml` pins `target-version = "py311"`.

## Verify

```
npm run typecheck; npm test
python -m ruff check backend/; python -m pytest backend/tests -q
python scripts/check_invariants.py      # warns if only one evaluator, or schemas without api.ts, changed
```
In the final report, list each mirror from the table and either "updated" or "not affected because …".
