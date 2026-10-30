# CourseFlow: Master Architecture & Technical Specification
### Curriculum Dependency Graph Visualizer, Degree Progress Advisor & Intelligent Career Roadmap Engine

---

## 1. Executive Summary & Core Abstraction

### 1.1 Project Vision & Problem Statement
Engineering degree structures are dense, tightly coupled systems constrained by multi-tiered prerequisites, mandatory co-requisites, semester availability windows, and strict credit bounds (minimum 18 credits per semester, 150 total credits to graduate). Currently, academic handbooks and syllabus sheets are distributed as static tables or disconnected PDFs. When a student drops, fails, or defers a single foundational module, calculating the cascading ripple effects across future semesters is an error-prone, manual task. Students face unexpected graduation delays, while academic committees lack automated visibility into systemic course bottlenecks that delay entire cohorts.

CourseFlow solves this by modeling an engineering curriculum as an interactive Directed Acyclic Graph (DAG) paired with an automated constraint engine, a syllabus feature extraction pipeline, and a graph-constrained career recommendation system.

### 1.2 The Core Mental Model: Academic Degree as a Software Build System
CourseFlow abstracts academic degree progression directly to a modern modular software build system (such as Make, Cargo, or Webpack):

* **Courses are Build Targets / Compilation Artifacts:** Intermediate deliverables that must be completed.
* **Prerequisites are Build Dependencies:** Strict directed edges that must be successfully compiled before downstream targets can begin.
* **Semesters are Discrete Execution Windows:** Sequential time-slices (Semesters 1 through 8) with strict capacity bounds (18 to 24 credits per window).
* **Failing / Dropping a Module is a Failed Build Artifact:** Halts compilation of all downstream dependents in the transitive closure, introducing cascade delays to the terminal build target.
* **Graduation is the Root Target:** Successfully resolving and compiling the full dependency graph without cycles, prerequisite failures, or credit boundary violations.

---

## 2. Definitive Technology Stack & Comprehensive Justifications

CourseFlow avoids generic PERN/MERN stack templates in favor of a domain-optimized architecture balancing graph theory, machine learning, and rapid client interactivity.

### 2.1 Technology Stack Matrix

| Layer | Selected Technology | Functional Role & Purpose |
| :--- | :--- | :--- |
| **Frontend Framework** | React 18+, TypeScript | Strict mode (`"verbatimModuleSyntax": true`), Vite bundling engine. |
| **Styling Engine** | Tailwind CSS v4 | `@tailwindcss/vite` plugin, zero-config CSS-first styling runtime. |
| **Canvas Engine** | `@xyflow/react` | React Flow v12 for high-performance node-link graph rendering. |
| **Client State** | Zustand | Local-first state management with persist middleware for `localStorage`. |
| **Backend API** | Python (FastAPI) | High-performance async server running under Uvicorn/Starlette. |
| **Type Synchronization** | `openapi-typescript` | Auto-generates client TypeScript interfaces directly from Pydantic models. |
| **Primary Database** | PostgreSQL | Handles `JSONB` for AST trees and `pgvector` for semantic embeddings. |
| **Graph Mathematics Engine** | NetworkX | Backend in-memory graph analysis; pure TypeScript engine on client. |
| **Document Ingestion** | pdfplumber, DocTR / Tesseract | Deterministic PDF tabular parsing with OCR fallback for scans. |
| **Small Language Model** | Qwen 2.5 7B / Phi-3.5-mini | Local SLM inference engine served via Ollama or vLLM. |
| **Structured LLM Extraction** | Instructor (Python) | Grammar-guided decoding enforcing schema validation. |
| **Document Generation** | `@react-pdf/renderer` | Client-side reactive PDF generation for student study plans. |

### 2.2 Deep Dive: PostgreSQL vs. Neo4j (Graph Database)

While academic curricula represent Directed Acyclic Graphs, using a dedicated graph database (e.g., Neo4j) introduces major architectural drawbacks compared to PostgreSQL + in-memory graph libraries:

1. **The Scale Reality:** Across 5 engineering degree programs, the entire faculty catalog consists of approximately $\sim 200$ courses (nodes) and $\sim 500$ prerequisite relationships (edges). The total dataset is $\sim 350\text{ KB}$ in memory. Neo4j is engineered for graphs with hundreds of millions of nodes; deploying a dedicated Neo4j cluster for 200 nodes introduces unnecessary operational overhead.
2. **The Boolean AST Propositional Logic Mismatch:** University prerequisites are not simple binary relationships (`CourseA -> CourseB`). They are propositional boolean formulas: 
   $$\text{(EC101 AND EC102) OR (EC105 AND Credits } \ge 30\text{)}$$
   In a property graph like Neo4j, modeling this requires decomposing logic into artificial operator proxy nodes (`(:AndGate)`, `(:OrGate)`), making Cypher traversals deeply convoluted. In PostgreSQL, this recursive tree is natively stored in a single `JSONB` column and evaluated in $<0.1\text{ ms}$ in memory.
3. **Sub-Millisecond Client Interactivity vs. Network Latency:** Students interacting with the canvas require instantaneous visual feedback on hover and click. Traversing a 200-node graph directly in the browser's JavaScript runtime or backend memory takes $< 2\text{ ms}$. Querying Neo4j over the Bolt protocol introduces $50\text{--}150\text{ ms}$ of network latency per interaction.
4. **Unified ACID & Vector Storage:** PostgreSQL provides unified storage for relational entities (courses, terms), document trees (ASTs in JSONB), and semantic vector embeddings (via pgvector) in one single database engine, avoiding distributed synchronization bugs.
5. **Academic Viva Justification:** If questioned by academic examiners, the team defends this decision rigorously:
   > *"We analyzed Neo4j, but determined that university prerequisites are recursive propositional boolean trees (Abstract Syntax Trees) rather than simple binary edges. Decomposing ASTs into property graph nodes creates excessive query overhead. Because our entire faculty dataset is ~200 nodes, executing in-memory graph traversals via NetworkX and client-side TypeScript achieves sub-millisecond real-time interactivity, while PostgreSQL with pgvector unifies vector embeddings and relational entities without dual-database synchronization overhead."*

---

## 3. Algorithmic Specifications & Mathematical Mechanics

### 3.1 Recursive Boolean Prerequisite Abstract Syntax Tree (AST)
Prerequisites are represented as an Abstract Syntax Tree with recursive node evaluation:
* **Node Types:** `AND`, `OR`, `COURSE`, `CREDIT_THRESHOLD`.
* **Evaluation Signature:** 
  ```typescript
  evaluate(rule: PrerequisiteRule, completedCourses: Set<string>, earnedCredits: number) => boolean
  ```
* Evaluates dynamically against the student's passed modules and total earned credits.

### 3.2 Cycle Detection via Depth-First Search (DFS 3-Coloring)
To guarantee that the curriculum graph remains a valid DAG, all edge creation and editing operations in the administrative portal run a 3-color DFS cycle check $O(V+E)$:
* **White (0):** Unvisited vertex.
* **Gray (1):** Currently active in the DFS recursion stack.
* **Black (2):** Vertex and all descendant subtrees fully explored.

If an edge targets a Gray vertex, a back-edge is detected, confirming a circular dependency. The system immediately rejects the transaction.

### 3.3 Topological Sorting (Kahn's Algorithm)
Kahn's indegree reduction algorithm $O(V+E)$ resolves valid term sequences:
1. Compute the indegree for all vertices in the active degree sub-graph.
2. Maintain a queue of vertices with $\text{indegree} = 0$.
3. Dequeue vertex $u$, allocate it to the earliest valid available semester column matching offering windows.
4. Decrement indegree for all adjacent descendant vertices $(u, v) \in E$.
5. If a descendant reaches $\text{indegree} = 0$, enqueue it.

### 3.4 Longest Path / Critical Path Analysis (Zero-Slack Bottlenecks)
On a topologically sorted DAG, the longest path between foundational 100-level courses and graduation defines the minimum required semesters to graduate. Dynamic programming relaxation calculates path length $L(u)$:

$$L(u) = \text{duration}(u) + \max_{(u,v) \in E} L(v)$$

Courses on the critical path have a slack of 0: dropping or failing a critical-path course guarantees an immediate cascading graduation delay of at least one semester.

### 3.5 Deterministic Banded Swimlane Layout
Rather than relying on unconstrained force-directed algorithms:
* **X-Axis (Deterministic Horizontal Positioning):** Fixed strictly by semester index ($X = (\text{semesterIndex} - 1) \times 280\text{px}$ for 1-indexed semesters).
* **Y-Axis (Vertical Ordering):** Dynamic vertical ordering using Dagre / barycentric heuristics applied strictly within each individual semester column to minimize edge crossings.

---

## 4. Specialized Subsystem Architectures

### 4.1 Module Information Sheet (MIS) Ingestion & SLM Extraction (Sprint 2)
1. **Document Ingestion:** Faculty data officers upload syllabus PDFs/DOCXs.
2. **Text Parsing:** `pdfplumber` extracts native text, contact hour grids, and tabular layouts deterministically. Scanned documents fall back to `pytesseract` / `DocTR`.
3. **Structured Grammar-Guided Extraction:**
   * **Local Small Language Model (SLM):** Qwen 2.5 7B-Instruct (or Phi-3.5-mini-instruct) hosted via Ollama or vLLM.
   * **Pydantic Schema Enforcement via Instructor:** Restricts token sampling logits strictly to the Pydantic data model, guaranteeing 100% syntactically valid JSON.
   * Automatically parses natural-language prerequisite text (e.g., *"Must have passed Signals I and either Math I or Math II with 30 credits"*) into recursive AST JSON.
   * **Multi-Semester Module Detection:** Automatically splits year-long courses into `creditDistribution` arrays.
4. **Human-in-the-Loop Review Dashboard:** Side-by-side split screen showing original PDF preview on the left and parsed editable form fields with confidence scores on the right. One-click commit writes data to PostgreSQL.

### 4.2 Frictionless Alumni Intelligence & Bayesian Rating Aggregator (Sprint 3)
1. **Zero-Login Public Submission:**
   * Alumni contribute career insights without registration friction.
   * **Fields:** Current Job Title, Engineering Discipline, Graduation Year, 1–5 Course Relevance Ratings, Qualitative Reviews, and Recommended Learning Resources (Books, Certifications, GitHub Repositories).
   * **Spam Guard:** University email domain verification or public LinkedIn $\text{URL} + \text{IP}$ rate limiting.
2. **Bayesian Weighted Average Rating:**
   To prevent courses with only 1 or 2 reviews from skewing ratings:

   $$S = \frac{C \cdot m + \sum_{i=1}^{n} r_i}{C + n}$$

   Where $C = 5$ (confidence threshold), $m = 3.0$ (prior faculty mean rating), and $n = \text{number of alumni reviews}$. Powers the Industry Heatmap canvas overlay.

### 4.3 Graph-Constrained RAG Career Advisor (Sprint 4)
Standard RAG fails in academic advising because vector similarity does not understand prerequisite topology. CourseFlow implements Graph-Constrained RAG:
1. **Semantic Candidate Retrieval:** `pgvector` retrieves the top 15 modules with highest cosine similarity to the student's target career (e.g., "Autonomous Robotics Engineer").
2. **Topological Graph Pruning (NetworkX):**
   * Evaluates reachability against the student's completed courses.
   * Verifies prerequisite feasibility and semester offering terms (Fall vs. Spring).
   * Validates that elective recommendations do not violate semester credit caps (18 to 24 credits).
   * Prunes unreachable electives or automatically inserts mandatory upstream prerequisite chains.
3. **Synthesis & Interactive Path Highlighting:** The LLM synthesizes an actionable semester-by-semester path with alumni-recommended books and projects, while the frontend highlights the recommended path on the interactive canvas.

### 4.4 Degree Generalization: The Hierarchical Credit Bucket Model
To generalize CourseFlow beyond engineering to any degree program (including Major/Minor tracks and free electives), requirements are modeled as orthogonal constraint buckets:
* `RequirementBucket`: `min_credits`, `max_credits`, `is_mandatory`, `bucket_type` (Core, Major Specialization, Minor, General Elective, Technical Elective).
* Verification checks that $\text{total credits} \ge 150$, each bucket meets its minimum credit threshold, and the selected sub-graph is acyclic.

---

## 5. Canonical Data Contracts & TypeScript Schemas

```typescript
// 1. Prerequisite Abstract Syntax Tree (AST)
export type RuleType = 'AND' | 'OR' | 'COURSE' | 'CREDIT_THRESHOLD';

export interface CourseRuleNode {
  type: 'COURSE';
  courseId: string;
}

export interface CreditThresholdRuleNode {
  type: 'CREDIT_THRESHOLD';
  minCredits: number;
}

export interface LogicalRuleNode {
  type: 'AND' | 'OR';
  children: PrerequisiteRule[];
}

export type PrerequisiteRule =
  | CourseRuleNode
  | CreditThresholdRuleNode
  | LogicalRuleNode;

// 2. Course & Multi-Semester Credit Modeling
export type CourseType = 'CORE' | 'ELECTIVE' | 'LAB' | 'CAPSTONE';

export interface CreditDistribution {
  semesterIndex: number; // 1 to 8
  creditsAllocated: number; // Credits allocated to this term
}

export interface Course {
  id: string; // e.g., "CO544"
  code: string;
  title: string;
  description: string;
  totalCredits: number;
  durationSemesters: number; // 1 (standard) or 2 (capstone)
  recommendedSemester: number; // 1 through 8
  creditDistribution: CreditDistribution[];
  type: CourseType;
  prerequisiteRule: PrerequisiteRule | null;
  corequisites: string[];
  offeredSemesters: ('FALL' | 'SPRING' | 'BOTH')[];
}

// 3. Degree Program Container
export interface DegreeProgram {
  id: string;
  name: string;
  department: string;
  totalCreditsRequired: number; // 150
  minCreditsPerSemester: number; // 18
  maxCreditsPerSemester: number; // 24
  semestersCount: number; // 8
  courses: Course[];
}
```

---

## 6. Phased Agile Roadmap & Epics Framework

### 6.1 Epics Framework (Sprint 1 & Sprint 2)

| Epic Key | Epic Name | Target System Application | Target Sprint | Epic Lead |
| :--- | :--- | :--- | :--- | :--- |
| **CF-EPIC-1** | Curriculum DAG Canvas & Dependency Visualizer | Student Web App | Sprint 1 | Malsha & Didula |
| **CF-EPIC-2** | Interactive Degree Planner & Constraint Engine | Student Web App | Sprint 1 | Didula & Malsha |
| **CF-EPIC-3** | Study Plan Export & Local Persistence | Student Web App | Sprint 1 | Malsha |
| **CF-EPIC-4** | Infrastructure, DevOps & Automated Quality Gates | Core Infrastructure | Sprint 1 & 2 | Ishani |
| **CF-EPIC-5** | Database Architecture & Curriculum Data Modeling | Core Data Layer | Sprint 1 | Anuththara |
| **CF-EPIC-6** | Faculty Admin Authentication & In-App Course Editor | Faculty Admin Portal | Sprint 2 | Didula & Malsha |
| **CF-EPIC-7** | MIS Document Ingestion & Text Parsing Pipeline | MIS Extraction Engine | Sprint 2 | Anuththara & Ishani |
| **CF-EPIC-8** | Automated Course Feature & Prerequisite AST Extraction | MIS Extraction Engine | Sprint 2 | Anuththara & Didula |
| **CF-EPIC-9** | Extraction Review Dashboard & Database Ingestion | MIS Extraction Engine | Sprint 2 | Malsha, Didula & Anuththara |

### 6.2 Phased Sprint Execution

* **Sprint 1 (Active): Zero-Login Student Web App for 2 Degree Programs**
  * **Window:** October 12, 2026 – November 01, 2026 (3 Weeks)
  * **Goal:** Ship a working, zero-login Student Web App for 2 engineering degree programs (Computer Engineering & Electrical Engineering) rendering an 8-semester swimlane DAG canvas, interactive elective selection, >= 18 semester credit checks, 150 total credit validation, multi-semester split credits, and client-side PDF plan export. Complete Docker setup, database schema foundation, and CI/CD quality gates.
  * **Backlog:** 14 User Stories (58 SP) mapped to 22 granular engineering tasks (98 SP).
  * 8-semester swimlane DAG canvas (`@xyflow/react`).
  * Degree switcher between Computer Engineering and Electrical Engineering.
  * Interactive elective selection with `localStorage` persistence.
  * Real-time credit constraint validation ($\ge 18\text{ credits/sem}$, $150\text{ total credits}$).
  * Multi-semester split credit calculations and client-side PDF export (`@react-pdf/renderer`).

* **Sprint 2: MIS Document Extraction Engine & Admin In-App Course Editor**
  * **Window:** November 02, 2026 – November 22, 2026 (3 Weeks)
  * **Goal:** Deliver an automated Module Information Sheet (MIS) Ingestion & Feature Extraction Engine capable of parsing syllabus PDFs/DOCXs, extracting metadata and prerequisite ASTs using a local Small Language Model (Qwen 2.5 7B via Ollama + Instructor), surfaced via a side-by-side human review screen with 1-click database commit. Deploy authenticated admin in-app module content editor.
  * Drag-and-drop syllabus PDF/DOCX uploader.
  * Text parsing (`pdfplumber` / OCR fallback) & Qwen 2.5 7B structured extraction via Instructor.
  * Automated natural-language prerequisite to boolean AST synthesis.
  * Side-by-side human review screen with confidence scores.
  * Authenticated admin in-app module editing modal.

* **Sprint 3: Frictionless Alumni Portal & Graph Integrity**
  * Zero-login public alumni feedback submission portal.
  * 1–5 module industry utility rating and resource link contributions.
  * Bayesian weighted rating aggregator and Industry Heatmap canvas toggle.
  * Visual prerequisite edge editor in admin portal with real-time DFS 3-color cycle detection.
  * Expansion of curriculum data to cover all 5 engineering streams.

* **Sprint 4: Graph-Constrained RAG Career Recommendation Engine**
  * `pgvector` indexing of course syllabi and alumni reviews.
  * Two-stage retrieval: semantic vector search + NetworkX topological & credit feasibility pruning.
  * LLM career advisor generating actionable study paths with recommended external resources.
  * Programmatic path highlighting on the interactive canvas.

* **Sprint 5: Cohort Bottleneck Analytics & Generalization**
  * Academic advisor dashboard visualizing cohort progression bottlenecks and high-fail choke points.
  * CSV report exporter for faculty curriculum meetings.
  * Implementation of Hierarchical Credit Bucket engine for Major/Minor degree tracks.

* **Sprint 6: Tool-Augmented Advising Agent, System Polish & Viva Prep**
  * Conversational advising agent with deterministic graph tools (prerequisite check, credit headroom, slack calculator).
  * End-to-end performance tuning, automated test suites, and project viva demonstration runbooks.

---

## 7. Team Task Allocation & Engineering Protocols

### 7.1 Team Roles & Sprint 1 Jira Allocations

#### Didula: Lead Architect & Backend Developer (23 SP)
* **Official Ownership Domains:** System architecture, FastAPI REST API, graph algorithms (DFS cycle detection, Kahn's sort, Critical Path), AST evaluation engine, contract sync, PR code review & merge governance.
* **Tech Stack:** Python (FastAPI), NetworkX, Pydantic, TypeScript, Git.
* **Sprint 1 Jira Tickets:**
  * `CF-101`: System Architecture Invariants & Contract Setup (5 SP)
  * `CF-102`: Deterministic Swimlane Layout Mathematical Engine (5 SP)
  * `CF-103`: Recursive Boolean AST Prerequisite Evaluator (5 SP)
  * `CF-104`: Local-First Zustand State Engine with Persistence (3 SP)
  * `CF-105`: FastAPI Core Server & Degree Metadata Endpoints (5 SP)

#### Malsha: Frontend & Documentation Specialist (31 SP)
* **Official Ownership Domains:** React Flow canvas visualizer, custom Tailwind CourseNode cards, 8-semester swimlane headers, module details drawer, client-side PDF export, Jira board management, Confluence/Markdown documentation.
* **Tech Stack:** React 18, TypeScript, Tailwind CSS v4, @xyflow/react, Zustand, @react-pdf/renderer.
* **Sprint 1 Jira Tickets:**
  * `CF-111`: Interactive React Flow Canvas Setup (5 SP)
  * `CF-112`: Custom CourseNode Component with Tailwind CSS v4 (5 SP)
  * `CF-113`: Semester Swimlane Column Headers & Credit Meters (5 SP)
  * `CF-114`: Slide-Over Module Details Drawer (5 SP)
  * `CF-115`: Degree Switcher Navigation Bar (3 SP)
  * `CF-116`: Client-Side PDF Study Plan Exporter (5 SP)
  * `CF-117`: Project Documentation & Jira Board Initialization (3 SP)

#### Ishani: QA & DevOps Engineer (23 SP)
* **Official Ownership Domains:** Docker containerization, local development stack orchestration, GitHub Actions CI/CD workflows, automated testing suites (Pytest, Vitest/Playwright), pre-commit gates, code coverage reports.
* **Tech Stack:** Docker, GitHub Actions, Pytest, Vitest, Ruff, Husky.
* **Sprint 1 Jira Tickets:**
  * `CF-121`: Docker Compose Local Environment Stack (5 SP)
  * `CF-122`: GitHub Actions CI/CD Pipeline & Branch Airlocks (5 SP)
  * `CF-123`: Pre-Commit Quality Hooks (Husky & Lint-Staged) (3 SP)
  * `CF-124`: Automated Backend Test Suite (Pytest) (5 SP)
  * `CF-125`: Automated Frontend Test Suite (Vitest) (5 SP)

#### Anuththara: Database & AI Engineer (21 SP)
* **Official Ownership Domains:** PostgreSQL schema design, Alembic migrations, initial 2-degree program seed data, pdfplumber syllabus parsing, local Ollama runtime (Qwen 2.5 7B), Instructor grammar-guided AST extraction.
* **Tech Stack:** PostgreSQL, pgvector, SQLAlchemy, Alembic, pdfplumber, Ollama, Instructor.
* **Sprint 1 Jira Tickets:**
  * `CF-131`: PostgreSQL Database Initialization & SQLAlchemy Models (5 SP)
  * `CF-132`: Database Migration Framework (Alembic) (3 SP)
  * `CF-133`: Curriculum Dataset Collection & Validation: Computer Engineering (5 SP)
  * `CF-134`: Curriculum Dataset Collection & Validation: Electrical Engineering (5 SP)
  * `CF-135`: Automated Database Seeder Script (3 SP)

### 7.2 Jira Hierarchy & Agile Ceremonies

1. **Jira Issue Hierarchy:**
   * **Epic:** High-level capability domain (e.g., `CF-EPIC-1: Canvas Visualizer`).
   * **Story:** User-centric deliverable providing tangible value (e.g., `US003: 8-Semester Swimlanes`).
   * **Subtask / Engineering Task:** Technical unit of execution assigned to an individual (e.g., `CF-102: Layout Math Engine`).
2. **Sprint Cadence & Ceremonies:**
   * **Sprint Planning:** First Monday of the sprint (1 hour). Review backlog items, confirm story points, and commit to sprint scope.
   * **Daily Standup (Asynchronous on Discord/Slack):** Every morning by 09:30 AM:
     - What did you accomplish yesterday?
     - What are you working on today?
     - Are there any technical blockers?
   * **Sprint Review & Live Demo:** Final Friday of the sprint (1 hour). Demonstrate working software on the `dev` branch.
   * **Sprint Retrospective:** Immediately following review (30 minutes). Discuss: What went well? What slowed us down? Action items for the next sprint.

### 7.3 Quality Gates & Definition of Done (DoD)

A story or engineering task is only marked **Done** in Jira when:
* Code is implemented on an isolated `feature/<ticket>-<description>` branch.
* Unit & integration tests pass with zero regressions.
* Static typecheck passes (`npx tsc --noEmit` and Python `ruff` / typecheck).
* PR is opened targeting `dev`, passing GitHub Actions CI checks (CourseFlow Quality Gate).
* PR is reviewed and approved by Didula (Lead Architect).
* PR is Squash Merged into `dev` and local branches are synchronized.
* Feature is validated against acceptance criteria on the live development build.

### 7.4 Sprint Execution Matrix

| Sprint | Didula (23 SP) | Malsha (31 SP) | Ishani (23 SP) | Anuththara (21 SP) |
| :--- | :--- | :--- | :--- | :--- |
| **Sprint 1** | Layout math, Zustand store setup, AST validator, core API skeleton (CF-101 - CF-105) | Custom CourseNode, swimlane headers, degree switcher, PDF export, Jira & Confluence setup (CF-111 - CF-117) | Docker Compose for dev environment, CI pipeline testing, initial Pytest & Vitest suites (CF-121 - CF-125) | PostgreSQL models, Alembic setup, transcribing initial 2 degree programs into seed data (CF-131 - CF-135) |
| **Sprint 2** | In-app course editor API, review screen endpoints, AST persistence logic (CF-201 - CF-204) | Extraction review split-screen UI, inline correction forms, admin editor modal (CF-211 - CF-216) | End-to-end integration tests for document upload API; Ollama container integration (CF-221 - CF-224) | `pdfplumber` text pipeline, Ollama/Qwen setup, Instructor Pydantic extraction scripts (CF-231 - CF-235) |
| **Sprint 3** | DFS cycle detection API, Kahn's topological sort validator, edge mutations | Admin drag-and-drop edge connector on canvas, cycle warning alerts, Sprint 3 docs | Load testing, cycle detection test matrices (cyclic, disconnected, acyclic graphs) | Ingestion pipeline scaling across remaining 3 degree programs; alumni feedback schema |
| **Sprint 4** | NetworkX topological reachability pruning, credit feasibility filter | Alumni public submission form, Industry Heatmap canvas toggle, resource upvoting UI | Automated RAG regression tests (verifying pruned courses never violate prerequisites) | `pgvector` indexing, syllabus chunk embeddings, alumni outcome vector stores |
| **Sprint 5** | Cohort bottleneck analytics aggregation queries, CSV export endpoints | Advisor analytics dashboard UI, major/minor bucket selector components | Security audits, API rate-limiting tests (`slowapi`), CI performance optimization | Hierarchical Requirement Bucket schema migration, vector search fine-tuning |
| **Sprint 6** | Tool-augmented advising agent backend, final code refactoring | Chatbot interface drawer, final UX polish, project presentation slide deck | Full system end-to-end testing, viva demo rehearsal runbooks, backup recovery tests | Database query performance tuning, embedding index optimizations, final data backups |