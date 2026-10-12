# CourseFlow

### Interactive Curriculum Dependency Graph Visualizer & Degree Progress Advisor

> Translating dense academic handbooks into a computable Directed Acyclic Graph (DAG) for engineering undergraduates and academic administrators.

---

## 1. The Big Picture: Academic Curricula as Build Systems

### The Core Problem

Engineering degree structures are heavily constrained, interdependent systems. A typical 4-year engineering curriculum contains:
- Strict multi-tiered prerequisites (e.g., `(EC101 AND EC102) OR EC105`).
- Mandatory co-requisites and credit thresholds (e.g., "Must have completed $\ge 30$ credits").
- Term credit caps and graduation minimums (e.g., minimum 18 credits/semester, 150 total credits).
- Two-semester spanning capstones that split credits across terms.

Traditionally, universities publish these requirements as static tables or multi-page PDF handbooks. When students drop or fail a course, they cannot calculate the transitive ripple effects on their future semesters. This results in unexpected graduation delays, overloaded semesters, and administrative bottlenecks.

### The CourseFlow Solution

CourseFlow formalizes curriculum planning by treating an academic degree program as a software build system (analogous to Make, Cargo, or Webpack) operating over a Directed Acyclic Graph (DAG):

```text
[Circuits I] ──────────► [Signals & Systems] ───► [DSP] ───► (Graduation)
                               ▲
[Calculus II] ─────────────────┘
```

- **Courses are Build Targets:** Each course is an intermediate compilation artifact.
- **Prerequisites are Build Dependencies:** Strict directed edges ($u \rightarrow v$) that must resolve before downstream targets can compile.
- **Semesters are Execution Windows:** Discrete time-slices ($S_1, S_2, \dots, S_8$) bounded by minimum and maximum credit thresholds.
- **Graduation is the Root Target:** Resolving the entire transitive dependency graph without cycles or constraint violations completes the degree.

---

## 2. Key Capabilities

### 🎓 Zero-Login Student Degree Planner (Local-First)
- **Zero Friction:** Immediate access to interactive degree roadmaps without registration, passwords, or login barriers.
- **8-Semester Banded Swimlanes:** Courses snap into deterministic semester columns ($X = \text{semesterIndex} \times 280\text{px}$) with optimized vertical ordering ($Y$) to minimize edge crossings.
- **Interactive Dependency Tracing:** Clicking or hovering a module isolates its entire upstream prerequisite chain and downstream unlocked electives while dimming unrelated graph elements.
- **Client-Side Persistence:** Planned electives, completed courses, and semester allocations persist automatically in the browser via `localStorage`. Plans can be exported and imported as portable JSON files.
- **Official PDF Export:** Exports the validated 8-semester schedule into a formatted academic planning sheet via `@react-pdf/renderer`.

### ⚙️ Rule & Constraint Validation Engine
- **Prerequisite Abstract Syntax Trees (AST):** Evaluates recursive boolean logic (`AND`, `OR`, `CREDIT_THRESHOLD`) dynamically against completed courses and total earned credits.
- **Credit Boundary Watchdogs:** Live calculation of per-semester credit sums, providing visual warnings if a student's workload drops below 18 credits or exceeds semester caps.
- **Spanning Capstone Support:** Supports multi-semester courses (e.g., 6-credit Final Year Projects) by splitting credit loads evenly across consecutive semesters without breaking node identity or primary keys.
- **Critical Path / Longest Path Highlighting:** Evaluates zero-slack dependency bottlenecks from 100-level prerequisites to graduation, visually flagging high-risk courses.

### 📄 Module Information Sheet (MIS) Ingestion & Feature Extraction
- **Automated Document Ingestion:** Drag-and-drop upload for raw syllabus PDFs and DOCXs.
- **Syllabus Parsing & Extraction:** OCR and language processing extract course codes, titles, credits, contact hours, and semester offerings.
- **Automated AST Rule Synthesis:** Converts natural-language prerequisite clauses into structured JSON boolean formulas.
- **Human-in-the-Loop Review:** Side-by-side interface for faculty data officers to review extracted metadata, adjust confidence-flagged items, and commit verified courses directly to the curriculum database.

### 🛡️ Faculty Admin Portal & Graph Integrity
- **Web-Based Content Editor:** Authenticated portal for academic committees to modify syllabus descriptions, credit distributions, and offerings directly on the canvas.
- **Algorithmic Cycle Detection ($O(V + E)$):** Employs Depth-First Search (DFS) with 3-color marking (White, Gray, Black) to intercept and reject circular prerequisite loops before administrative updates commit.
- **Topological Sort Scheduling:** Kahn’s algorithm computes and verifies valid linear semester sequences across all degree tracks.

### 🌐 Industry Roadmaps & AI Career Advisor (Phases 4 & 5)
- **Crowdsourced Alumni Insights:** Frictionless public submission for graduates to map industry roles, rate course relevance on a 1–5 scale, and share supplemental learning resources (certifications, textbooks, GitHub repositories).
- **Industry Relevance Heatmap:** Visual canvas overlay shading course nodes based on aggregated industry relevance scores.
- **AI Career Advisor (Gemini RAG):** Natural language career pathing that ingests syllabus vectors and alumni data to recommend optimal elective trajectories and portfolio projects for specific career specializations.

---

## 3. Technology Stack

| Layer | Technology | Purpose |
| :--- | :--- | :--- |
| **Frontend Framework** | React 18+, TypeScript, Vite | Fast modular rendering, strict compile-time type safety. |
| **Canvas & Graph Engine** | @xyflow/react (React Flow v12) | High-performance interactive node-link viewport and edge routing. |
| **Styling** | Tailwind CSS v4 | Responsive utility classes, custom badge states, and modern design tokens. |
| **State Management** | Zustand (persist middleware) | Reactive graph state and zero-login local-first persistence via `localStorage`. |
| **Validation** | Zod | Runtime schema validation and contract integrity. |
| **Document Generation** | @react-pdf/renderer | Client-side generation of exportable study plan PDFs. |
| **Backend & Storage** | Node.js / Express, PostgreSQL | Relational academic entities, JSONB AST rule trees, and alumni feedback. |
| **AI & Ingestion Engine** | Python, pdf-parse, Google Gemini API | Unstructured document parsing, AST extraction, and RAG career guidance. |

---

## 4. Repository Architecture & Context Slicing

CourseFlow uses an agent-centric, context-sliced directory structure. Every functional domain contains an authoritative `CONTEXT.md` defining its inputs, outputs, and invariants to prevent token degradation and keep development modular:

```text
courseflow/
├── .github/workflows/ci.yml       # Automated Typecheck, Lint & Build gate
├── docs/                          # Durable architectural documentation
│   ├── SYSTEM_STATE.md            # Live sprint ledger and system invariants
│   ├── adr/                       # Architectural Decision Records (e.g. ADR-001)
│   └── ARCHITECTURE.md            # In-depth algorithmic and data models
├── src/
│   ├── types/                     # TypeScript contracts (Single Source of Truth)
│   │   ├── CONTEXT.md
│   │   └── curriculum.ts          # Course, PrerequisiteRule AST, DegreeProgram
│   ├── core/                      # Engine, graph math, and global state
│   │   ├── CONTEXT.md
│   │   ├── store.ts               # Zustand store (localStorage persistence)
│   │   └── layout.ts              # 8-Semester swimlane coordinate calculator
│   ├── features/                  # Isolated feature slices
│   │   ├── canvas/                # React Flow canvas, CourseNode, and Swimlanes
│   │   ├── planner/               # Credit counters, constraints, and PDF export
│   │   ├── drawer/                # Slide-over course details panel
│   │   ├── admin/                 # In-app course editor modal
│   │   └── extraction/            # MIS syllabus upload and review UI
│   └── data/                      # Verified curriculum seed files
│       ├── CONTEXT.md
│       ├── mock_course.json       # Day-1 component development mock
│       └── programs/              # Standardized JSON curricula for 5 degrees
├── guide.md                       # Operational developer rulebook & Git guidelines
├── package.json
└── vite.config.ts
```

---

## 5. Getting Started

### Prerequisites

- **Node.js:** v20.x or higher
- **npm:** v10.x or higher
- **Git**

### Installation

```powershell
# 1. Clone the repository
git clone https://github.com/DidulaKaru/CourseFlow.git
cd CourseFlow

# 2. Install dependencies
npm install

# 3. Start local development server
npm run dev
```

Visit `http://localhost:5173` to explore the canvas locally.

### Quality Verification

Before pushing code or opening a Pull Request, verify that all static checks pass:

```powershell
# Typecheck contracts
npx tsc --noEmit

# Run production build
npm run build
```

---

## 6. Engineering Standards & Contribution Rules

All team members must follow the protocols detailed in [guide.md](./guide.md):

- **Branch Protection:** Direct commits to `main` and `dev` are blocked. All code enters `dev` via audited Pull Requests with a passing CI check.
- **Branching Model:** Branch off `dev` using the format `feature/<ticket-id>-<description>`.
- **Commit Standards:** Use Conventional Commits (`feat:`, `fix:`, `data:`, `chore:`, `docs:`).
- **Mock-First Policy:** UI and feature developers build components against `src/data/mock_course.json` rather than waiting on backend or dataset completion.
- **No `any` Types:** Strict TypeScript rules are enforced across the codebase. Use `import type { ... }` for type-only imports.

---

## 7. Implementation Roadmap

- **Sprint 1 (Active):** Visual DAG Canvas for 2 engineering degree programs, deterministic 8-semester swimlane layout, interactive elective toggling, $\ge 18$ semester credit validation, and client-side PDF export.
- **Sprint 2:** Module Information Sheet (MIS) extraction engine, syllabus OCR/LLM parsing, AST rule generation, and web-based administrative course editor.
- **Sprint 3:** Admin visual prerequisite connection editor, DFS 3-color cycle detection blocker, and expansion to all 5 faculty engineering degree programs.
- **Sprint 4:** Frictionless public alumni submission portal, 1–5 module industry utility ratings, and crowdsourced learning resources.
- **Sprint 5:** Industry Heatmap canvas overlay, cohort prerequisite bottleneck analytics, and Gemini RAG AI Career Advisor.

---

## 8. License

This project is developed as an academic engineering software group project under the Faculty of Engineering. All rights reserved.
