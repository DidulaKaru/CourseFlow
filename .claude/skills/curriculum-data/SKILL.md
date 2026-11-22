---
name: curriculum-data
description: Rules for reading or changing CourseFlow program catalogs (frontend/src/data/programs/*.json and backend/data/programs/*.json), adding a program or degree, editing prerequisites, credit distributions, electives or course metadata. Use before touching any catalog JSON or the program loader.
---

# Curriculum catalog data

The catalogs are official university data and the source of truth for the student UI. A wrong value here becomes wrong advice to a student, so treat them as records, not as code.

## Invariants

1. **Two byte-identical copies.** `frontend/src/data/programs/<name>.json` and `backend/data/programs/<name>.json`. Edit one, then copy it over the other (`cp frontend/src/data/programs/X.json backend/data/programs/X.json`). Never hand-edit both.
2. **Immutable facts.** `code`, `title` and `totalCredits` of existing courses never change, and courses are never removed, unless the user explicitly provides the official source. A human then approves the commit with `CF_ALLOW_CATALOG_EDIT=1`, and the commit uses type `data(...)`. The edit hook asks for confirmation on these fields.
3. **Never reformat.** The files are listed in `.prettierignore`. Keep the existing key order and indentation so diffs stay reviewable.
4. **Structure** (enforced by `python scripts/check_invariants.py --only catalog`):
   - `id === code`, codes are unique, and there are no split codes (`CE4001_A`). A multi-semester course is a single entity with `creditDistribution: [{ semesterIndex, creditsAllocated }]` summing to `totalCredits`.
   - `totalCredits` is from 1 to 12, and `semesterIndex` is from 1 to `semestersCount`.
   - `prerequisiteRule` is `null` or an AST of `AND`/`OR` (`children`, non-empty), `COURSE` (`courseId`, which must exist in the same program) and `CREDIT_THRESHOLD` (`minCredits >= 0`). The depth is at most 20, with no self-references and no cycles.
   - `corequisites` reference codes in the same program.
5. **Schema shape** is defined by `frontend/src/types/curriculum.ts` and mirrored by `backend/app/schemas/`. Adding a field to the JSON is a schema change, so use `/contract-change`.

## Adding a program

1. Add the JSON to both directories.
2. Register it in `frontend/src/data/mockCourses.ts` (`PROGRAMS`, `AVAILABLE_PROGRAMS`), and add a department theme in CSS if it's a new department (`data-department`). Check the backend program listing picks it up (`backend/app/api/v1/endpoints/programs.py`).
3. Add tests: the loader test in `frontend/src/data/__tests__/` and `backend/tests/test_programs.py` for the new id. The layout must stay within `maxColumns: 5` per semester, so test that the densest semester lays out.
4. Update the planner store only if the shape changes (it's partitioned by program id already).

## Verify

```
python scripts/check_invariants.py --only catalog,catalog-immutable
npx --workspace=frontend vitest run src/data
python -m pytest backend/tests/test_programs.py -q
```
Then open the program in the app and spot-check that prerequisite beams connect the right courses.
