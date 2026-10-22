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
- **8-Semester Banded Swimlanes:** Courses snap into deterministic semester columns ($X = (\text{semesterIndex} - 1) \times 280\text{px}$ for 1-indexed semesters) with optimized vertical ordering ($Y$) to minimize edge crossings.
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
- **Industry Relevance Heatmap:** Visual canvas overlay shading course nodes based on Bayesian-weighted industry relevance scores.
- **Graph-Constrained RAG Career Advisor:** Combines `pgvector` semantic syllabus retrieval with NetworkX topological pruning to recommend feasible elective trajectories and portfolio projects without violating prerequisite constraints.

---

## 3. Technology Stack

| Layer | Technology | Purpose |
| :--- | :--- | :--- |
| **Frontend Framework** | React 18+, TypeScript, Vite | Strict mode (`"verbatimModuleSyntax": true`), fast modular HMR. |
| **Canvas & Graph Engine** | @xyflow/react (React Flow v12) | High-performance interactive node-link viewport and edge routing. |
| **Styling** | Tailwind CSS v4 | `@tailwindcss/vite` plugin, zero-config CSS-first design system. |
| **State Management** | Zustand (persist middleware) | Reactive graph state and zero-login local-first persistence via `localStorage`. |
| **Document Generation** | @react-pdf/renderer | Client-side reactive generation of exportable study plan PDFs. |
| **Backend API** | Python (FastAPI), Uvicorn | Async high-performance REST API with Pydantic validation and type sync. |
| **Primary Database** | PostgreSQL with pgvector | Unified ACID relational storage, `JSONB` for AST trees, and vector embeddings. |
| **Graph Mathematics Engine** | NetworkX & TypeScript | In-memory cycle detection, Kahn's topological sort, and critical path analysis. |
| **Document Ingestion** | pdfplumber, DocTR / Tesseract | Deterministic PDF tabular parsing with OCR fallback for scanned syllabi. |
| **Local SLM & Extraction** | Qwen 2.5 7B / Phi-3.5-mini via Instructor | Grammar-guided structured extraction converting syllabus text to AST JSON. |

---

## 4. Repository Architecture & Context Slicing

CourseFlow uses an agent-centric, context-sliced directory structure. Every functional domain contains an authoritative `CONTEXT.md` defining its inputs, outputs, and invariants to prevent token degradation and keep development modular:

```text
courseflow/
├── .github/workflows/ci.yml       # Automated Typecheck, Lint, Test & Build gate
├── docs/                          # Durable architectural documentation
│   ├── SYSTEM_STATE.md            # Live sprint ledger and system invariants
│   ├── adr/                       # Architectural Decision Records (ADR-001)
│   └── ARCHITECTURE.md            # Master architecture & technical specification
├── plans/                         # Sprint 1 phase-by-phase implementation plans
│   ├── Didula_Sprint1.md          # Lead Architect & Backend Developer
│   ├── Malsha_Sprint1.md          # Frontend & Documentation Lead
│   ├── Ishani_Sprint1.md          # QA & DevOps Lead
│   └── Anuththara_Sprint1.md      # Database & AI Engineering Lead
├── backend/                       # Python FastAPI Backend
│   ├── CONTEXT.md
│   ├── app/                       # FastAPI application (main, config, api, models, schemas)
│   ├── tests/                     # Pytest suite
│   ├── scripts/                   # Database seed scripts
│   └── requirements.txt
├── src/
│   ├── types/                     # TypeScript contracts (Single Source of Truth)
│   │   ├── CONTEXT.md
│   │   └── curriculum.ts          # Course, PrerequisiteRule AST, DegreeProgram
│   ├── core/                      # Engine, graph math, and global state
│   │   ├── CONTEXT.md
│   │   ├── store.ts               # Zustand store (localStorage persistence)
│   │   ├── layout.ts              # 8-Semester swimlane coordinate calculator
│   │   └── algorithms/            # AST evaluator, cycle detection, critical path
│   ├── features/                  # Isolated feature slices
│   │   ├── canvas/                # React Flow canvas, CourseNode, and Swimlanes
│   │   ├── planner/               # Credit counters, constraints, and PDF export
│   │   ├── drawer/                # Slide-over course details panel
│   │   └── admin/                 # In-app course editor modal
│   └── data/                      # Verified curriculum seed files
│       ├── CONTEXT.md
│       ├── mock_course.json       # Day-1 component development mock
│       └── programs/              # Standardized JSON curricula for degrees
├── docker-compose.yml             # Local dev stack (PostgreSQL + pgvector, Backend, Ollama)
├── guide.md                       # Operational developer rulebook & Git guidelines
├── package.json
└── vite.config.ts
```

---

## 5. Team Task Allocation & Roles

| Member | Primary Role | Core Sprint 1 Responsibilities |
| :--- | :--- | :--- |
| **Didula** | Lead, Architect & Backend Developer | Layout math ($X/Y$), Zustand store setup, AST boolean evaluator, FastAPI core API skeleton. |
| **Malsha** | Frontend & Documentation | Custom `CourseNode` card, swimlane headers, degree switcher, PDF export, Jira/Confluence. |
| **Ishani** | QA & DevOps | Docker Compose dev stack, CI/CD pipeline automation, Vitest & Pytest test suites. |
| **Anuththara** | Database & AI Engineering | PostgreSQL models, Alembic migrations, curriculum transcription for 2 degrees, seed script. |

---

## 6. Getting Started

### Prerequisites

- **Node.js:** v20.x or higher
- **npm:** v10.x or higher
- **Python:** v3.11 or higher
- **Docker & Docker Compose** (for PostgreSQL with pgvector)
- **Git**

### Installation & Local Development

```powershell
# 1. Clone the repository
git clone https://github.com/DidulaKaru/CourseFlow.git
cd CourseFlow

# 2. Start PostgreSQL with pgvector via Docker Compose
docker compose up -d db

# 3. Install frontend dependencies and launch dev server
npm install
npm run dev

# 4. (Optional) Run backend API locally
cd backend
python -m venv venv
venv\Scripts\activate   # On Windows
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Visit `http://localhost:5173` to explore the canvas locally.

### Quality Verification

Before pushing code or opening a Pull Request, verify that all static checks pass:

```powershell
# Frontend verification
npx tsc --noEmit
npm run lint
npm test
npm run build

# Backend verification
ruff check backend/
pytest backend/tests
```

---

## 7. Phased Agile Roadmap (6 Sprints)

- **Sprint 1 (Active): Zero-Login Student Web App for 2 Degree Programs**
  - 8-semester swimlane DAG canvas (`@xyflow/react`).
  - Degree switcher between Computer Engineering and Electrical Engineering.
  - Interactive elective selection with `localStorage` persistence.
  - Real-time credit constraint validation ($\ge 18\text{ credits/sem}$, $150\text{ total credits}$).
  - Multi-semester split credit calculations and client-side PDF export (`@react-pdf/renderer`).
- **Sprint 2: MIS Document Extraction Engine & Admin In-App Course Editor**
  - Text parsing (`pdfplumber` / OCR) & local Qwen 2.5 7B structured extraction via Instructor.
  - Automated natural-language prerequisite to boolean AST synthesis.
  - Side-by-side human review screen with confidence scores.
  - Authenticated admin in-app module editing modal.
- **Sprint 3: Frictionless Alumni Portal & Graph Integrity**
  - Zero-login public alumni feedback submission portal.
  - Bayesian weighted rating aggregator and Industry Heatmap canvas toggle.
  - Visual prerequisite edge editor in admin portal with real-time DFS 3-color cycle detection.
  - Expansion to all 5 faculty engineering degree programs.
- **Sprint 4: Graph-Constrained RAG Career Recommendation Engine**
  - `pgvector` indexing of course syllabi and alumni reviews.
  - Two-stage retrieval: semantic vector search + NetworkX topological & credit feasibility pruning.
  - LLM career advisor generating actionable study paths with recommended external resources.
  - Programmatic path highlighting on the interactive canvas.
- **Sprint 5: Cohort Bottleneck Analytics & Generalization**
  - Academic advisor dashboard visualizing cohort progression bottlenecks and high-fail choke points.
  - CSV report exporter for faculty curriculum meetings.
  - Implementation of Hierarchical Credit Bucket engine for Major/Minor degree tracks.
- **Sprint 6: Tool-Augmented Advising Agent, System Polish & Viva Prep**
  - Conversational advising agent with deterministic graph tools (prerequisite check, credit headroom, slack calculator).
  - End-to-end performance tuning, automated test suites, and project viva demonstration runbooks.

---

## 8. License

This project is developed as an academic engineering software group project under the Faculty of Engineering. All rights reserved.
