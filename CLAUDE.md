# CLAUDE.md

Guidance for Claude Code in the CourseFlow repo. **[agents.md](agents.md) is the binding operational manual** — this file condenses it, adds repo facts, and flags where older docs have drifted from the code. When they conflict, trust the code, then this file, then the older docs.

## What this is

CourseFlow renders an engineering degree curriculum (8 semesters, ~150 credits) as a friendly, mobile-first study planner (a semester list on phones, an interactive prerequisite graph on desktop). Students plan electives with no login; state lives in `localStorage`. Two programs ship today: Computer Engineering (`computer-eng`) and Electrical Engineering (`electrical-eng`).

- **Frontend** (`frontend/`, npm workspace): React 19, TypeScript 6 (`verbatimModuleSyntax`), Vite 8, Tailwind v4, `@xyflow/react` v12, Zustand 5, `@react-pdf/renderer`, Vitest + jsdom, oxlint.
- **Backend** (`backend/`): FastAPI + Pydantic v2, SQLAlchemy + Alembic, PostgreSQL 16 with pgvector, pytest, ruff.
- **Deploy**: frontend on Cloudflare Pages (`wrangler.toml` → `frontend/dist`), backend on Vercel serverless (`vercel.json` → `api/index.py`, which imports `backend/app/main.py`).

## Commands

Run these from the repo root. The shell is Windows. Root npm scripts proxy to the `frontend` workspace.

```powershell
npm start                 # backend (uvicorn :8000) + frontend (vite :5173) together
npm run dev               # frontend only; Vite proxies /api -> localhost:8000
npm run backend           # backend only (uvicorn --app-dir backend)
python backend/scripts/hash_password.py   # bcrypt hash for ADMIN_PASSWORD_HASH / REVIEWER_PASSWORD_HASH
cd backend; python -m alembic upgrade head  # apply migrations (an old seed_db-only DB needs `alembic stamp 0001_initial_curriculum_tables` first)
docker compose up db      # local Postgres+pgvector (add --profile sprint2 for Ollama)

# Quality gate — all must pass before commit (agents.md §5)
npm run typecheck         # tsc -b
npm run lint              # oxlint
npm test                  # vitest run
npm run build             # tsc -b && vite build
python -m ruff check backend/
python -m pytest backend/tests

# Single tests
npx --workspace=frontend vitest run src/core/__tests__/layout.test.ts
npx --workspace=frontend vitest run -t "translateExtent"
python -m pytest backend/tests/test_ast.py::test_name -q

# Regenerate frontend/src/types/api.ts from the OpenAPI spec (backend must be running)
npm --workspace=frontend run generate-types
```

The Husky pre-commit hook runs `lint-staged` (oxlint on staged TS, ruff on staged Python) and then `npm run typecheck`. Never use `--no-verify`. CI (`.github/workflows/ci.yml`) runs the same gate on Node 20 and Python 3.11, so don't use Python syntax newer than 3.11.

## Architecture map

```
frontend/src/
  App.tsx, main.tsx            root; wrapped in ErrorBoundary
  core/layout.ts               deterministic graph layout (calculateLayout / calculateDegreeLayout)
  core/store.ts                Zustand planner store, persisted as "courseflow-local-planner"
  core/algorithms/ast_evaluator.ts   prerequisite AST evaluator (depth guard > 20)
  core/api.ts                  backend client (VITE_API_BASE_URL, else same-origin /api)
  data/mockCourses.ts          program loader: PROGRAMS, AVAILABLE_PROGRAMS, getProgram, getProgramCourses
  data/programs/*.json         curriculum catalogs (source of truth for the UI)
  features/canvas/             CurriculumCanvas.tsx, CourseNode, SwimlaneHeader, TopNav, selectors, SemesterFeed (mobile list)
  features/canvas/utils/       viewport.ts (translateExtent, responsive viewport), graphHighlight.ts
  features/drawer/             ModuleDetailsDrawer
  features/planner/            StudyPlanPDF, ExportPdfButton
  types/curriculum.ts          canonical TS domain types; types/api.ts is generated
backend/app/
  main.py                      routers mounted at BOTH /api and /api/v1; GET / and /api/health
  api/deps.py                  auth guards: CurrentUser / AdminUser / StaffUser, DbSession
  api/v1/endpoints/            programs.py (GET /programs, /programs/{id}), plans.py (POST /plans/validate) are PUBLIC;
                               auth.py (/auth/login, /refresh, /me), courses.py (POST, PUT, PATCH; ADMIN only),
                               extraction.py (/extraction/upload, /jobs/{id}, /jobs/{id}/commit; StaffUser)
  core/ast_evaluator.py        Python mirror of the TS evaluator
  core/security.py             bcrypt hashing, env-configured staff accounts, JWT issue/verify
  services/course_service.py   admin course rules + transactions (check_distribution is shared with CF-203/CF-235)
  services/extraction_service.py  MIS job lifecycle; ExtractionPipeline seam (get_extraction_pipeline) for CF-231..234
  core/config.py               settings; DATA_PROGRAMS_DIR resolves backend/data → frontend/src/data → container path
  schemas/                     Pydantic DTOs, camelCase aliases (to_camel) mirroring types/curriculum.ts 1:1
  models/, alembic/            SQLAlchemy models and migrations (0001 initial, 0002 courses.updated_at, 0003 extraction_jobs)
backend/data/programs/*.json   copy of the frontend catalogs (used by serverless deploys)
```

Each slice has a `CONTEXT.md` with deeper detail. Several of those files describe the old left-to-right 280px-column layout, so check them against the code before relying on them.

## Invariants (condensed from agents.md — non-negotiable)

**Zero regressions.** Every past fix is a contract. Run the tests before you change anything. Every bug fix ships with a regression test in a `__tests__/` folder next to the code (backend tests go in `backend/tests/`). Don't weaken an existing assertion to make a change pass.

**Canvas camera (`CurriculumCanvas.tsx`):**
- `<ReactFlow>` always gets a finite `translateExtent = useMemo(() => calculateCanvasTranslateExtent(layout), [layout])`. Never remove it and never make it infinite. The defaults in `viewport.ts` are top 100, bottom 200 and horizontal 120 px of padding. `minY` is floored just above Semester 1 and `maxY` is ceiled just below the last semester.
- The canvas keeps `panOnScroll`, `panOnScrollMode={PanOnScrollMode.Vertical}`, `zoomOnScroll={false}`, `zoomOnPinch` and `panOnDrag`.
- Mobile (< 640px) uses `getResponsiveViewport(window.innerWidth)`: zoom of about 0.25–0.28 and 16px margins. `handleJumpToSemester` offsets for the header: 70px on desktop, 90px on mobile.

**Layout.** It is deterministic and runs top-to-bottom. Semesters stack vertically, and courses fill up to 5 column slots (`maxColumns: 5`, node 240×110). The 280px `columnWidth` and `getSemesterXCoordinate` are only kept for backward compatibility. Courses never cross semester boundaries. Declare `nodeTypes` outside render. On `CourseNode`, the left handle is the target and the right handle is the source.

**Data and domain:**
- Never import `mockCourses` (CE-only) in UI components; it is only for tests. Resolve the catalog from the active program:
  `const activeCourses = useMemo(() => getProgramCourses(activeProgramId), [activeProgramId]);`
- A multi-semester course is a single entity with a `creditDistribution: [{ semesterIndex, creditsAllocated }]`. Never create split codes like `CE4001_A`/`_B`.
- Prerequisite AST node types are `AND`, `OR`, `COURSE` and `CREDIT_THRESHOLD` (with `minCredits >= 0`). Both evaluators stop at `depth > 20`. Keep the TS and Python evaluators behaviorally identical.
- Never edit course codes, titles or credits. They are official catalog data.
- **The program JSON exists in two places**: `frontend/src/data/programs/` and `backend/data/programs/`. They are currently byte-identical. Change both together, or the deployed backend will drift from the UI.
- If you change the schema, update `types/curriculum.ts`, the Pydantic schemas and the generated `api.ts` together.

**State.** Students never authenticate. The store persists under `courseflow-local-planner`. It is **at `version: 2`** (agents.md still says 1, which is out of date). Any change to the persisted shape needs a version bump and a `migrate()` branch that upgrades older states. Plans are partitioned by program (`plans: Record<programId, StudyPlan[]>`). Users move plans between devices with JSON export/import.

**Backend.** There is exactly one PostgreSQL instance. Keep foreign-key integrity (for example `alumni_ratings.course_id → courses.id`). Make schema changes with Alembic migrations, chained onto a single head.

**Faculty admin API (Sprint 2).** Only admin routes are authenticated (ADR-002); `/programs` and `/plans` stay public. Accounts come from env vars with bcrypt hashes and there are no default credentials. Use the `AdminUser` / `StaffUser` guards; the role comes from configuration, not the token. Course codes are immutable and catalog-unique; credits are 1 to 12; a credit distribution sums to `totalCredits`. Extraction job states are `PENDING`, `PROCESSING`, `EXTRACTED`, `COMMITTED`, `FAILED`. Backend DB tests use in-memory SQLite through the `db_client`, `admin_headers` and `reviewer_headers` fixtures in `backend/tests/conftest.py`. Student-facing reads still come from the bundled JSON catalogs, not PostgreSQL.

**Resilience.** Both the app root and the canvas are wrapped in `<ErrorBoundary>`. Keep them that way.

## UI design (friendly, light, mobile-first)

[design-philosophy.md](design-philosophy.md) is the design system, and `/courseflow-ui` is the working summary. The earlier Skyrim / constellation / dark-glass theme is **retired**: it was judged too hostile. Where `plans/`, `docs/` or older tickets ask for Skyrim styling (obsidian glass, Cinzel, glowing beams, diamond pips), follow design-philosophy.md instead and mention the conflict.

- **Phone first.** Design at 375px (minimum 320px), then enhance for desktop. Most students use phones. Below 768px the semester list (`SemesterFeed`) is the default, and details open in a bottom sheet.
- **Mobile rules.** Touch targets are at least 44px, body text 16px, nothing below 12px, no horizontal scroll and no hover-only affordances. Primary actions sit in the thumb zone, with safe-area insets. Use `min-h-dvh`, not `h-screen`. Never disable pinch zoom.
- **Look.** Warm light surfaces (`bg-canvas`, `bg-surface`, `border-line`, `text-ink*`), `rounded-2xl` cards, `rounded-xl` buttons, `rounded-full` chips and gentle `shadow-sm`. Use Plus Jakarta Sans for headings and Inter for body text, in sentence case. Don't use dark backgrounds, glows, gradients or emoji (use Lucide icons).
- **Tokens only.** Never put raw hex in classes. The department accent (`bg-accent`, `text-accent-strong`, `bg-accent-soft`) switches on `document.documentElement.dataset.department`: `ce` is teal `#0F766E` and `ee` is orange `#C2410C`.
- **States** pair color, an icon and a label (*Completed*, *Planned*, *Needs CO2210*). Copy is friendly and specific, and catalog strings stay verbatim.
- **Migration.** The code is still Skyrim-styled. The `ui-migration` check holds **new or changed lines** to the new system (no legacy tokens, raw hex or sub-12px text), so a component migrates when you touch it.
- Keep existing a11y attributes (`role="article"`, `tabIndex={0}`, `aria-label`) and keyboard parity. Contrast must meet WCAG AA.

## Code conventions

- Use the `@/…` path alias for frontend imports, and `import type { … }` for type-only imports (required by `verbatimModuleSyntax`).
- The TS config enables `noUnusedLocals`, `noUnusedParameters` and `erasableSyntaxOnly`, so don't use enums, namespaces or parameter properties.
- oxlint enforces `react/rules-of-hooks` and `react/only-export-components`.
- Python must pass ruff and type-annotate public functions. Pydantic models use camelCase aliases.

## Engineering taste

This project is built mostly by agents with little human review. Write code a careful senior engineer would approve without comments.

- **Smallest complete change.** Solve the ticket fully and do nothing else. No speculative options, config flags, abstractions or "while I'm here" refactors. If you spot something worth fixing, list it in your report.
- **Match before you invent.** Find the closest existing pattern (store slice, selector, component, endpoint, test) and follow it. Extract a shared helper only when the third copy appears.
- **Pure core, thin shell.** Domain logic lives in pure, tested functions (`core/`, `services/`, `selectors`). Components and routes wire state to it. Derived state is computed, not stored.
- **Types carry the domain.** Derive from `types/curriculum.ts`. No `any`, no `as unknown as`, no non-null `!` without a reason. Prefer discriminated unions to boolean flags. Validate at boundaries (zod, Pydantic) and trust types inside.
- **Names speak curriculum.** `course`, `semester`, `plan`, `prerequisiteRule`, not `item`, `data`, `obj`, `handleStuff`.
- **Comments explain why.** Write no comments that restate the code and no narrated history. Delete code rather than comment it out. A `TODO` needs a ticket ID.
- **Tests describe behavior.** Tests are deterministic, readable as a spec, and cover both programs (CE and EE). Don't snapshot large trees, sleep, or depend on test order.
- **No new dependencies** without a stated reason, and never for something a few lines of code can do.
- **Report honestly.** Say what you ran, what passed and what you didn't verify. "Should work" is not verification.

## Guardrails (what enforces all this)

| Layer | What it does | Where |
| --- | --- | --- |
| Invariant checker | Catalog sync, structure and immutable facts; emoji and pinch-zoom; new or changed UI lines follow the design system (`ui-migration`); canvas camera props; store persistence; no `mockCourses` in UI; no focused tests; evaluator/schema coupling; `fix/` branches need a test | `scripts/check_invariants.py` (`--list`, `--only`, `--for-file`) |
| Claude Code hooks | Never prompts, so sessions can run unattended. Automatically denies (with the reason) `--no-verify`, pushes to main/dev, force-push, hook bypasses, destructive git/DB commands, `.env`, edits to existing migrations or catalog facts, and edits that reduce test assertions. Re-checks each edited file. Runs the gate before the turn ends | `.claude/settings.json`, `.claude/hooks/cf_guard.py` |
| Skills | `/ship-ticket` (workflow), `/courseflow-ui` (visual design, mobile-first), `/curriculum-data`, `/contract-change` | `.claude/skills/` |
| Reviewer agents | `invariant-auditor` (correctness and invariants), `design-critic` (UI craft). Both are read-only | `.claude/agents/` |
| Pre-commit and CI | lint-staged, typecheck and invariants locally. CI adds the full test suites, coverage of at least 85% and an invariants job diffed against the PR base | `.husky/pre-commit`, `.github/workflows/ci.yml` |
| Regression locks | Tests that fail if any of the above is weakened | `backend/tests/test_guardrails.py`, `test_ci_workflow.py`, `test_precommit_config.py` |

If a guardrail blocks you, fix the cause. Never work around it (with a shell edit, a renamed file or a weakened test). If you think the guardrail itself is wrong, or the user explicitly asked for the blocked action, finish everything else and explain the block in your final report. The user may be away from the keyboard, so don't stall. Set `CF_SKIP_STOP_GATE=1` only when the user asks you to. A UI rule exception needs an inline `cf-allow: <reason>`.

## Git workflow

- Branch names: `feature/cf-<id>-<desc>` or `fix/cf-<id>-<desc>`.
- Conventional commits with the ticket ID, e.g. `fix(canvas): clamp viewport scrolling (CF-106)`. Types are `feat`, `fix`, `chore`, `data` and `refactor`.
- PRs target `dev`, never `main`. Direct pushes to `main` and `dev` are blocked. PRs are squash-merged after the Lead Architect approves.
- Only commit or push when the user asks.

## Other docs

`README.md` covers the product vision. `docs/ARCHITECTURE.md`, `docs/DEPLOYMENT.md` and `docs/SYSTEM_STATE.md` cover the sprint ledger and settled decisions. ADRs are in `docs/adr/`, and per-member sprint plans are in `plans/`.
