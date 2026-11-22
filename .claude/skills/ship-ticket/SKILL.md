---
name: ship-ticket
description: End-to-end workflow for implementing any CourseFlow ticket (CF-xxx), feature or bug fix, from branch to PR. Use whenever you are asked to build, fix, implement or finish a ticket or sprint task, or before committing or opening a PR in this repo.
---

# Ship a CourseFlow ticket

The project is built mostly by agents with little human review, so this workflow is the review. Do every step, and say plainly in your final report if you skip one.

## 1. Orient (before touching code)

1. Find the ticket in `plans/*_Sprint*.md` and `docs/SYSTEM_STATE.md`. Restate its acceptance criteria as a checklist. If a criterion is ambiguous and the code doesn't settle it, ask instead of guessing.
2. Read the `CONTEXT.md` of every slice you will touch, and check its claims against the code. Several of these files describe the old 280px-column layout.
3. Run `git log --oneline -15 -- <paths you will touch>` and read the commits that fixed bugs there. Each of those fixes is a contract you must not undo.
4. Get a baseline and record it:
   ```
   npm run typecheck; npm run lint; npm test
   python -m ruff check backend/; python -m pytest backend/tests -q
   python scripts/check_invariants.py
   ```
   If the baseline is red, stop and report it. Don't build on a broken base, and don't "fix" unrelated failures silently.
5. Branch from `dev`: `feature/cf-<id>-<short-desc>` or `fix/cf-<id>-<short-desc>`.

## 2. Plan small

- Write down the smallest set of files that delivers the criteria. If it grows past about 8 files or about 400 changed lines, split it into reviewable commits or ask whether to split the ticket.
- Pick the skills you need: `/courseflow-ui` for anything visual, `/curriculum-data` for program JSON, `/contract-change` for any schema, AST or evaluator change.

## 3. Build with tests

- **Bug fix: red first.** Write the regression test, watch it fail for the right reason, then fix. Put the test in the nearest `__tests__/` folder (frontend) or in `backend/tests/` (backend), name it after the symptom, and reference the ticket ID in it. A `fix/` branch without a changed test fails `check_invariants.py`.
- **Feature:** test the behavior the acceptance criteria describe, not the implementation details. Include at least one edge case: an empty program, the max-depth AST, the mobile breakpoint (< 640px) or the EE program (not just CE).
- Never edit an existing assertion to make your change pass. If a test really is wrong, explain why in the commit body and get the user's agreement.
- Match the surrounding code's patterns before inventing new ones (see "Taste" in CLAUDE.md).

## 4. Verify like a reviewer

1. Run the full gate (step 1.4 commands plus `npm run build`). Everything must be green.
2. Re-read your own diff (`git diff dev...`) as a hostile reviewer would. Look for dead code, debug logs, commented-out code, `any`, unused exports, TODOs without a ticket ID, and copy-paste drift between the CE and EE paths.
3. For UI changes, run the app (`npm start`) and look at it at phone width first (375px, then 320px), then desktop, in both departments (CE and EE). Most students use a phone. Typecheck alone doesn't prove a UI works.
4. Use the `invariant-auditor` agent on the diff. For UI diffs, also use `design-critic`. Fix every finding marked as blocking.
5. Tick off every acceptance criterion with evidence: a test name, a command output or a screenshot.

## 5. Commit and PR (only when the user asks)

- Use conventional commits with the ticket: `feat(canvas): add semester jump (CF-142)`. Allowed types are `feat`, `fix`, `chore`, `data`, `refactor`. Keep one logical change per commit.
- Never use `--no-verify`. If the hook fails, fix the cause.
- Open the PR against `dev` and fill in `.github/pull_request_template.md` honestly, including the "Not verified" section.

## Final report to the user

Cover: what changed and why, the files touched, the tests added (by name), the gate results, anything skipped or not verified, and any follow-up you noticed but didn't do. Don't claim "fully tested" unless you actually ran the tests.
