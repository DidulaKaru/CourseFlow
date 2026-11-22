# CourseFlow: Autonomous Agent Operational Manual & Engineering Guardrails

> **Target Audience:** All AI coding assistants, autonomous agents, and pair-programming agents operating within the CourseFlow repository.  
> **Mandatory Rule:** Read and adhere strictly to these invariants before inspecting, editing, or committing code.

---

## 1. The Cardinal Directive: Zero Regressions (Never Break Past Fixes)

### Why Agents Break Past Fixes
In multi-agent collaborative workflows, regressions occur due to three avoidable behaviors:
1. **Blind Overwriting:** Overwriting entire files without examining line-by-line diffs or understanding recently merged architectural changes.
2. **Ignoring Existing Test Contracts:** Modifying implementation logic without running the existing test suite first, then attempting to alter test assertions instead of honoring original requirements.
3. **Omitting Regression Test Locks:** Fixing a bug without introducing a dedicated, deterministic regression test that permanently fails if the bug is reintroduced.

### The Invariant Preservation Protocol
- **Every prior fix is a non-negotiable contract.** When addressing a task, your changes must compose on top of past remediation, never revert them.
- **Run the full test suite before touching anything:**
  ```powershell
  npm test
  pytest backend/tests
  ```
  If any tests are failing before you begin, report or resolve them immediately. Do not proceed until you understand the baseline.
- **Every bug fix MUST ship with an automated test.** Whenever you remediate an issue (e.g. scroll clipping, recursion limit, schema mismatch), write a test in `__tests__/` that explicitly validates the fix.

---

## 2. Canvas Viewport & Scrolling Invariants (`CF-Canvas-Boundaries`)

The React Flow interactive graph canvas represents an academic curriculum constellation. It must remain intuitive, responsive, and geometrically clamped.

### The Infinite Scrolling Void Anti-Pattern
In unconstrained graph viewports, scrolling up with a mouse wheel or trackpad pans the camera infinitely down, sending Semester 1 off the bottom of the screen into outer darkness. Similarly, scrolling down pans the camera infinitely up past Semester 8. **This is completely forbidden in CourseFlow.**

### Strict Camera Bounding Rules
1. **`translateExtent` Must Always Be Defined:**
   - `<ReactFlow />` in `CurriculumCanvas.tsx` MUST always receive a finite, dynamically computed `translateExtent`:
     ```tsx
     const translateExtent = useMemo(() => {
         return calculateCanvasTranslateExtent(layout);
     }, [layout]);

     <ReactFlow
         ...
         translateExtent={translateExtent}
     />
     ```
   - Never remove or set `translateExtent` to `[[-Infinity, -Infinity], [Infinity, Infinity]]`.

2. **Top Boundary Clamping (`minY`):**
   - `minY` is strictly bounded right above Semester 1:
     $$\text{minY} = \lfloor \text{firstSemester.y} - \text{topPadding} \rfloor$$
   - Users can scroll up to view Semester 1 with comfortable breathing room below the Top HUD, but scrolling **stops immediately** at the top padding boundary. The camera can never scroll past Semester 1.

3. **Bottom Boundary Clamping (`maxY`):**
   - `maxY` is strictly bounded right below Semester 8 (or the final curriculum term):
     $$\text{maxY} = \lceil (\text{lastSemester.y} + \text{lastSemester.height}) + \text{bottomPadding} \rceil$$
   - Users can scroll smoothly through all 8 semesters, but scrolling **stops immediately** below the capstone project row. The camera can never scroll into an empty void below the graph.

4. **Horizontal Boundary Clamping (`minX`, `maxX`):**
   - The horizontal bounds encompass the 5-column curriculum content width ($1360\text{px}$) with standard breathing margins ($100\text{px} - 120\text{px}$), preventing horizontal drift into outer space.

5. **Scroll & Pan Navigation Modes:**
   - Vertical pan on scroll is mandatory:
     ```tsx
     panOnScroll={true}
     panOnScrollMode={PanOnScrollMode.Vertical}
     zoomOnScroll={false}
     zoomOnPinch={true}
     panOnDrag={true}
     ```
   - `zoomOnScroll` must remain `false` so vertical trackpad/wheel gestures scroll through semesters naturally rather than triggering chaotic zoom jumps.

6. **Responsive Scaling & Jump Offsets:**
   - On mobile viewports ($< 640\text{px}$), camera zoom scales dynamically ($\sim 0.25 - 0.28$) with tight horizontal margins ($16\text{px}$) via `getResponsiveViewport(window.innerWidth)`.
   - `handleJumpToSemester` must include the responsive header offset ($70\text{px}$ desktop, $90\text{px}$ mobile) so jumped semester headers are never hidden behind floating navigation bars.

---

## 3. UI Design Invariants (Friendly, Light, Mobile-First)

The Skyrim perk-constellation theme is **retired**: users found it too hostile. CourseFlow is now a friendly, inviting study planner, and most students use it on a phone. The full system is in [`design-philosophy.md`](design-philosophy.md), and Claude Code agents also get the `/courseflow-ui` skill. Where any sprint plan or older doc asks for Skyrim styling (obsidian glass, Cinzel, glowing beams, diamond pips), `design-philosophy.md` wins.

### Non-negotiables
- **Phone first:** design at 375px (minimum 320px), then enhance for desktop. Below 768px the semester list is the default view, and course details open in a bottom sheet.
- **Mobile ergonomics:** touch targets of at least 44px, body text 16px, nothing below 12px, no horizontal scroll, no hover-only affordances, primary actions in the thumb zone with safe-area insets, `min-h-dvh` instead of `h-screen`, and pinch zoom never disabled.
- **Light and warm:** use the tokens (`bg-canvas`, `bg-surface`, `border-line`, `text-ink*`, `accent*`, status colors). Never put raw hex in classes. Don't use dark backgrounds, glows, neon or gradients.
- **Soft shapes:** `rounded-2xl` cards, `rounded-xl` buttons and inputs, `rounded-full` chips, gentle `shadow-sm`.
- **States never rely on color alone:** pair color with a Lucide icon and a label. No emoji.
- **Friendly, specific copy:** a blocked course explains how to unlock it, and errors reassure and offer a way forward.
- **Preserve Academic Strings Verbatim:** course codes (`CO544`), official module titles and credit numbers are formal university catalog data. Never edit, rephrase or translate them.
- **Accessibility:** WCAG AA contrast, keyboard parity, visible focus, and `prefers-reduced-motion` respected.

### Department themes
The accent switches on `document.documentElement.dataset.department`: **CE** is teal (`#0F766E`) and **EE** is warm orange (`#C2410C`). Components use only the `accent` / `accent-strong` / `accent-soft` utilities.

### Migration
Existing components still carry the legacy theme. `scripts/check_invariants.py` (`ui-migration`) holds **new or changed lines** to the new system, so components migrate as they are touched (see the mapping table in design-philosophy.md section 10).

---

## 4. Architectural Invariants (Non-Negotiable)

1. **Zero-Login Student Mode (Local-First):**
   - Students do not authenticate.
   - All planner state (`selectedElectiveIds`, `completedCourseIds`, `failedCourseIds`) persists in `localStorage` via Zustand middleware.
   - All store updates must support versioned migrations (`version: 1`, `migrate()`).
   - Plan portability is handled via JSON import/export.
   - The faculty admin API is the only authenticated surface (ADR-002). Never add an auth dependency to `/programs` or `/plans`, and never send the admin token from student code paths.

2. **Single Database Instance & Clean Migrations:**
   - Single PostgreSQL instance across all services.
   - No separate databases for courses vs ratings.
   - Foreign key integrity is required (`alumni_ratings.course_id REFERENCES courses.id`).

3. **Multi-Semester Spanning Modules:**
   - Never duplicate course codes or halve credits manually (no `CE4001_A` / `CE4001_B`).
   - Spanning courses use a single course entity with a `creditDistribution` array specifying `semesterIndex` and `creditsAllocated`.

4. **Deterministic Graph Layout Mathematics:**
   - Horizontal coordinates: $X = (\text{semesterIndex} - 1) \times 280\text{px}$ (legacy) or 5-column slot geometry in top-to-bottom layout.
   - Vertical coordinates: Semesters are stacked monotonically from top to bottom. Courses never cross semester boundaries.

5. **Prerequisite AST Rule Evaluator:**
   - Recursive propositional logic: `AND`, `OR`, `COURSE`, `CREDIT_THRESHOLD`.
   - Depth guard: Recursion MUST terminate if `depth > 20` to prevent call stack exhaustion on malformed/cyclic graphs.
   - Credit thresholds: Enforce `minCredits >= 0`.

6. **Dynamic Degree Catalog Resolution:**
   - Never hardcode `mockCourses` (Computer Engineering catalog only) in UI components.
   - Always resolve active courses dynamically:
     ```tsx
     const activeProgramId = usePlannerStore((state) => state.activeProgramId);
     const activeCourses = useMemo(() => getProgramCourses(activeProgramId), [activeProgramId]);
     ```

7. **Error Boundaries Everywhere:**
   - Wrap application root and viewport canvas in `<ErrorBoundary>`.
   - Never allow unhandled React render exceptions to produce a blank white screen.

8. **Faculty Admin API (Sprint 2):**
   - Mutating routes use the guards in `backend/app/api/deps.py` (`AdminUser`, `StaffUser`). Course routes are guarded at router level; keep it that way for routes added later.
   - Course codes are immutable, catalog-unique primary keys. Credits are 1 to 12 and a credit distribution must sum to `totalCredits` (`check_distribution` in `course_service.py`). Do not re-implement these rules elsewhere (ingestion, AST endpoints); call the shared service code.
   - Extraction job states are `PENDING`, `PROCESSING`, `EXTRACTED`, `COMMITTED`, `FAILED`. Do not introduce synonyms (`COMPLETED`, `READY`, ...).

9. **Schema Migrations:**
   - Every column or table change ships with an Alembic revision chained onto the latest one (`alembic heads` must print exactly one head; `backend/tests/test_migrations.py` enforces it).

---

## 5. The Agent Quality Gate (Definition of Done)

Before committing or submitting work, every agent MUST execute the full quality gate locally:

```powershell
# 1. TypeScript Static Verification (0 errors required)
npm run typecheck

# 2. Linter Quality Gate (0 warnings, 0 errors required)
npm run lint

# 3. Frontend Vitest Test Suite (100% pass required)
npm test

# 4. Production Bundle Verification (Clean build required)
npm run build

# 5. Backend Python Linter Check (0 warnings required)
python -m ruff check backend/

# 6. Backend Automated Test Suite (100% pass required)
pytest backend/tests
```

If ANY command fails:
1. Do NOT commit.
2. Do NOT bypass pre-commit hooks (`--no-verify` is strictly prohibited).
3. Investigate the failure, resolve the root cause, and re-run the full gate until all checks pass cleanly.

---

## 6. Git Workflow & Commit Rules

1. **Branch Naming Standard:**
   - Branches MUST follow: `feature/<ticket-id>-<description>` or `fix/<ticket-id>-<description>`.
   - Examples: `fix/cf-106-canvas-scroll-clamping`, `feature/cf-115-degree-selector`.
2. **Conventional Commits:**
   - Commit messages must use semantic types: `feat(...)`, `fix(...)`, `chore(...)`, `data(...)`.
   - Example: `fix(canvas): clamp viewport scrolling within translateExtent boundaries (CF-106)`.
3. **Branch Protection:**
   - Direct pushes to `main` and `dev` are blocked by GitHub Rulesets.
   - All code enters via Pull Requests targeting `dev` (never `main`).
   - PRs must be approved by the Lead Architect and squash-merged.

---

## 7. Agent Checklist Before Any Modification

- [ ] Have I run `npm test` and `pytest backend/tests` to verify the baseline?
- [ ] Am I using `@/...` path aliases and `import type { ... }` for all types (`verbatimModuleSyntax`)?
- [ ] Have I preserved all existing accessibility attributes (`role="article"`, `tabIndex={0}`, `aria-label`)?
- [ ] Have I preserved razor-sharp $2\text{px}$ geometry and dark translucent glass aesthetic?
- [ ] Is canvas scrolling clamped via `translateExtent` with no infinite void?
- [ ] Does dynamic catalog resolution adapt to the active degree program?
- [ ] Have I written an automated regression test in `__tests__/` for the fix?
- [ ] Did `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, and backend tests all pass with 0 errors?
- [ ] Backend change: does it add a migration (single head), keep `/programs` and `/plans` public, and add tests that use the shared `db_client` / `admin_headers` fixtures?
- [ ] If Pydantic schemas changed, did I regenerate `frontend/src/types/api.ts` (`npm --workspace=frontend run generate-types` with the backend running)?
