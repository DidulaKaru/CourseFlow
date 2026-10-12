# CourseFlow Team Engineering Guide & Operational Rulebook

This document defines the development standards, architectural invariants, Git workflows, and quality gates for CourseFlow. Every team member and autonomous IDE agent must comply with these rules.

---

## 1. Architectural Invariants (Non-Negotiable)

These architectural decisions are finalized. Do not refactor or deviate from them without an approved Architectural Decision Record (ADR):

- **Zero-Login Student Mode (Local-First):**
  - Students do not register or log in.
  - All state (selected electives, completed courses, custom plans) is persisted client-side in `localStorage` via Zustand middleware.
  - Plan portability is handled strictly via JSON import/export.

- **Single Database Instance:**
  - Do not create separate databases for courses and community data.
  - When PostgreSQL is deployed in Sprint 2, all models reside in a single database with foreign key integrity (e.g., `alumni_ratings.course_id REFERENCES courses.id`).

- **Multi-Semester Spanning Modules:**
  - Never duplicate course codes or manually halve credits (e.g., no `EC4001_A` and `EC4001_B`).
  - Courses spanning multiple semesters use a single course entity with a `creditDistribution` array defining `semesterIndex` and `creditsAllocated` offsets.

- **Deterministic Canvas Layout:**
  - Horizontal coordinates are calculated mathematically: $X = \text{semesterIndex} \times 280\text{px}$.
  - Nodes are never freely repositioned across semesters on the horizontal axis. Dagre or barycentric heuristics handle vertical ($Y$-axis) ordering only.

- **Contract-First & Type Safety:**
  - All shared entities must be defined in `src/types/curriculum.ts` before writing UI or API code.
  - `"verbatimModuleSyntax": true` is enforced. Always use `import type { ... }` when importing types or interfaces.
  - The `any` type is forbidden across the codebase.

---

## 2. Team Division & Task Ownership

```text
┌────────────────────────────────────────────────────────────────────────┐
│                        Lead Architect (You)                            │
│   • Graph Engine & Deterministic Layout Mathematics                    │
│   • Global Zustand Store & LocalStorage Persistence                    │
│   • Algorithmic Validation (DFS Cycle Detection & AST Rule Evaluator)  │
│   • Code Reviews, CI/CD, and Protected Branch Merges                   │
└──────────────┬───────────────────────────┬─────────────────────────────┘
               │                           │
       ┌───────▼────────┐         ┌────────▼───────┐         ┌────────▼───────┐
       │   Teammate 2   │         │   Teammate 3   │         │   Teammate 4   │
       │ Data & Backend │         │ Canvas & UI    │         │ Drawer & PDF   │
       └────────────────┘         └────────────────┘         └────────────────┘
```

| Member | Primary Ownership Domain | Sprint 1 Deliverables | Sprint 2 Deliverables |
| :--- | :--- | :--- | :--- |
| **Lead Architect** | Engine, Layout & Systems | Core setup, layout math ($X/Y$), AST boolean rule evaluator, Zustand store. | Gemini LLM extraction pipeline, PostgreSQL setup, AST parser engine. |
| **Teammate 2** | Curriculum Data & Ingestion | JSON files for Computer Eng & Electrical Eng; Zod runtime validation. | PDF upload endpoint, text extractor (`pdf-parse`), regex parsers. |
| **Teammate 3** | Canvas UI & Headers | Custom CourseNode Tailwind card, swimlane column headers, navigation bar. | Admin login screen, in-app module content editing modal. |
| **Teammate 4** | Drawer, Alerts & Export | Slide-over module details drawer, credit limit alerts, PDF export. | Extraction review split-screen, inline correction editor, database commit action. |

---

## 3. Git Workflow & Branch Protection Rules

Direct pushes to `main` and `dev` are blocked by GitHub Rulesets. All code enters the repository through audited Pull Requests.

```text
[main]  ◄── Squash & Merge (Releases / Faculty Viva Milestones only)
  ▲
[dev]   ◄── Squash & Merge (Daily Integration branch; target for all PRs)
  ▲
  └── feature/<ticket-id>-<short-description> (Individual feature branch)
```

### Branch Naming Conventions

Always create branches from an updated `dev` branch using this pattern:
- `feature/cf-101-course-node-ui`
- `feature/cf-102-details-drawer`
- `fix/cf-103-layout-crossing-bug`
- `data/cf-104-computer-eng-json`

### Commit Message Standard (Conventional Commits)

All commit messages must adhere to semantic prefixes:
- `feat(canvas): add semester swimlane coordinate math`
- `feat(drawer): display syllabus objectives in slide-over`
- `fix(store): resolve localstorage serialization bug`
- `data(curriculum): add electrical engineering semester 1-4 modules`
- `chore(deps): update tailwind packages`

---

## 4. Daily Developer Terminal Runbook

Follow this sequential workflow for every task:

```powershell
# 1. Start your workday: switch to dev and pull latest changes
git checkout dev
git pull origin dev

# 2. Create your isolated feature branch
git checkout -b feature/cf-301-course-node-styling

# 3. Perform work, test locally, stage, and commit
git add .
git commit -m "feat(ui): implement course node tailwind layout"

# 4. Synchronize with dev before pushing to resolve conflicts early
git checkout dev
git pull origin dev
git checkout feature/cf-301-course-node-styling
git merge dev

# 5. Push your feature branch to GitHub
git push -u origin feature/cf-301-course-node-styling
```

Once pushed, open GitHub, create a Pull Request targeting `dev` (never `main`), and notify the Lead Architect for review.

---

## 5. Mock-First Development (No Blocker Policy)

**Rule:** No developer may pause progress waiting for another team member's deliverables.

- If Teammate 3 (CourseNode UI) or Teammate 4 (Details Drawer) needs module data while Teammate 2 is still assembling degree datasets, they must import `src/data/mock_course.json` directly into their local components.
- When the core datasets or APIs are ready, switching from `mock_course.json` to the Zustand store requires updating only the import statement.

---

## 6. Antigravity IDE & AI Agent Working Rules

When leveraging Antigravity IDE agents, maintain strict token boundaries:

- **Context Slicing:**
  - Every major directory contains a `CONTEXT.md` file.
  - Before prompting an agent to modify files in a directory, ensure it reads only that directory's `CONTEXT.md` and related types.

- **Bounded Modification Prompts:**
  - Restrict agent tasks to explicit scopes:
    > "Read src/features/canvas/CONTEXT.md. Style the custom CourseNode card using Tailwind CSS according to the properties defined in mock_course.json. Do not edit files outside src/features/canvas/."

- **Execution Verification:**
  - Every agent session must conclude by running the compiler check:
    ```powershell
    npx tsc --noEmit
    ```
  - If TypeScript reports any errors, instruct the agent to resolve them before committing.

---

## 7. Definition of Done (DoD) for Pull Requests

A task is only marked as Done on Jira and eligible for merging into `dev` when all of the following conditions are satisfied:

- [ ] **Type Safety:** `npx tsc --noEmit` runs with 0 errors.
- [ ] **Lint & Build:** `npm run lint` and `npm run build` succeed locally.
- [ ] **No Direct Mutation:** Canvas layout math and global states run through established utilities (`layout.ts`, `store.ts`), not ad-hoc component hacks.
- [ ] **No Broken Imports:** All imports use `@/...` path aliases and type imports use `import type { ... }`.
- [ ] **CI Pipeline Passes:** The GitHub Actions Typecheck, Lint & Build status check is green.
- [ ] **Lead Approval:** The PR has been reviewed and approved by the Lead Architect.
- [ ] **Squash Merged:** The PR is squash-merged into `dev` and the feature branch is deleted.
