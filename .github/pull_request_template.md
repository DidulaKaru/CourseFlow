## Ticket

CF-___ — <one-line summary>

## What and why

<!-- What changed, and the reason. Link the sprint plan entry. -->

## Acceptance criteria

<!-- One line per criterion, with the evidence: test name, command output or screenshot. -->
- [ ] ...

## Tests

<!-- New or changed tests by name. A bug fix names the regression test that fails without the fix. -->

## Quality gate

- [ ] `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`
- [ ] `python -m ruff check backend/`, `python -m pytest backend/tests`
- [ ] `python scripts/check_invariants.py`
- [ ] UI change: checked in the browser at 375px and 320px first, then desktop, in CE and EE (phone screenshots below)
- [ ] Contract change: every mirror updated (types, Pydantic, `api.ts`, both evaluators, both catalogs, store `version` + `migrate`)

## Not verified / risks

<!-- Be explicit. "None" only if that is true. -->
