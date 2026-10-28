# Sprint 1 Implementation Plan: Malsha (Frontend & Documentation Specialist)

**Official Project Role:** Frontend & Documentation Specialist  
**Sprint Window:** October 12, 2026 – November 01, 2026 (3 Weeks)  
**Sprint Goal:** Ship a working, zero-login Student Web App for 2 engineering degree programs (Computer Engineering & Electrical Engineering) rendering an 8-semester swimlane DAG canvas, interactive elective selection, >= 18 semester credit checks, 150 total credit validation, multi-semester split credits, and client-side PDF plan export. Complete Docker setup, database schema foundation, and CI/CD quality gates.  
**Primary Tech Stack:** React 18, TypeScript, Tailwind CSS v4, @xyflow/react, Zustand, @react-pdf/renderer  
**Total Allocated Story Points:** 31 SP  

---

## 1. Core Ownership Domains & Responsibilities

Malsha leads user-facing frontend component development, visual layout engineering, and agile project documentation. In Sprint 1, core responsibilities encompass:
- **Interactive React Flow Canvas:** Mounting and configuring `@xyflow/react` v12 with zoom, pan, minimap, controls, and smooth 60 FPS viewport rendering.
- **Custom CourseNode Component:** Building responsive node cards with Tailwind CSS v4 displaying course codes, titles, credit badges, course type badges (Core, Elective, Capstone), and source/target connection handles.
- **8-Semester Swimlane Headers & Credit Gauges:** Constructing sticky semester headers (Semesters 1-8) featuring real-time credit summation and red visual warnings when load < 18 credits.
- **Slide-Over Module Details Drawer:** Developing the slide-over inspection drawer for syllabus summaries, credit breakdowns, and prerequisite AST visualizations.
- **Degree Switcher Navigation Bar:** Top navigation bar enabling instantaneous switching between Computer Engineering and Electrical Engineering curricula.
- **Client-Side PDF Exporter:** Generating clean, formatted 2-page academic study plans via `@react-pdf/renderer`.
- **Jira Board & Confluence Governance:** Managing Jira backlogs, sprint boards, user stories, acceptance criteria, and project documentation (`guide.md`, `README.md`, subfolder `CONTEXT.md` files).

---

## 2. Epics & User Stories Mapping

### Target Epics
- **CF-EPIC-1: Curriculum DAG Canvas & Dependency Visualizer** (Epic Lead with Didula | Student Web App)
- **CF-EPIC-2: Interactive Degree Planner & Constraint Engine** (Epic Co-Lead with Didula | Student Web App)
- **CF-EPIC-3: Study Plan Export & Local Persistence** (Epic Lead | Student Web App)

### User Stories Addressed
| User Story ID | Narrative | Priority | Story Points | Target Epic |
| :--- | :--- | :--- | :--- | :--- |
| **US001** | As a student, I want instant, zero-friction access to the curriculum graph visualizer without needing to create an account or log in. | Must Have | 3 | CF-EPIC-1 |
| **US002** | As a student, I want to switch seamlessly between the 2 initial engineering degree programs via a top navigation selector. | Must Have | 3 | CF-EPIC-1 |
| **US003** | As a student, I want to view my degree curriculum as an interactive DAG rendered across 8 semester swimlanes. | Must Have | 8 | CF-EPIC-1 |
| **US004** | As a student, I want to zoom, pan, and navigate smoothly across the 8-semester curriculum canvas. | Must Have | 3 | CF-EPIC-1 |
| **US005** | As a student, I want to click any course node to highlight its upstream prerequisites and downstream unlocked courses while dimming unrelated nodes. | Must Have | 5 | CF-EPIC-1 |
| **US006** | As a student, I want to open a slide-over drawer to read comprehensive module descriptions, syllabus objectives, and prerequisite breakdowns. | Must Have | 5 | CF-EPIC-1 |
| **US007** | As a student, I want to select and deselect elective modules to customize my personalized study path. | Must Have | 5 | CF-EPIC-2 |
| **US008** | As a student, I want to receive immediate visual warnings (red/amber badges) if I choose an elective whose prerequisites are unmet. | Must Have | 5 | CF-EPIC-2 |
| **US009** | As a student, I want to view a real-time semester credit counter that warns me if my planned semester falls below the 18-credit minimum. | Must Have | 5 | CF-EPIC-2 |
| **US010** | As a student, I want to track my cumulative planned credits against the 150-credit graduation requirement. | Must Have | 3 | CF-EPIC-2 |
| **US011** | As a student, I want multi-semester spanning modules (e.g., capstones) to automatically split credits across their consecutive semesters. | Must Have | 5 | CF-EPIC-2 |
| **US012** | As a student, I want my elective choices, completed courses, and custom plan to auto-save in browser localStorage so my work is preserved on return. | Must Have | 3 | CF-EPIC-3 |
| **US013** | As a student, I want to export and download my validated 8-semester study plan as a clean, formatted PDF document. | Must Have | 5 | CF-EPIC-3 |
| **US014** | As a student, I want to export and import my planner configuration as a portable JSON file to back up or transfer between devices without an account. | Should Have | 3 | CF-EPIC-3 |

---

## 3. Granular Jira Tasks & Engineering Roadmap

| Ticket Key | Task Summary | Story Points | Target Epic | Assigned |
| :--- | :--- | :--- | :--- | :--- |
| **CF-111** | Interactive React Flow Canvas Setup | 5 SP | CF-EPIC-1 | Malsha |
| **CF-112** | Custom CourseNode Component with Tailwind CSS v4 | 5 SP | CF-EPIC-1 | Malsha |
| **CF-113** | Semester Swimlane Column Headers & Credit Meters | 5 SP | CF-EPIC-1 / CF-EPIC-2 | Malsha |
| **CF-114** | Slide-Over Module Details Drawer | 5 SP | CF-EPIC-1 | Malsha |
| **CF-115** | Degree Switcher Navigation Bar | 3 SP | CF-EPIC-1 | Malsha |
| **CF-116** | Client-Side PDF Study Plan Exporter | 5 SP | CF-EPIC-3 | Malsha |
| **CF-117** | Project Documentation & Jira Board Initialization | 3 SP | Governance | Malsha |

```
┌────────────────────────────────────────────────────────────────────────┐
│ CF-111: Interactive React Flow Canvas Setup (5 SP)                     │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
┌───────────────────────────────────▼────────────────────────────────────┐
│ CF-112: Custom CourseNode Component with Tailwind CSS v4 (5 SP)        │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
┌───────────────────────────────────▼────────────────────────────────────┐
│ CF-113: Semester Swimlane Column Headers & Credit Meters (5 SP)        │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
┌───────────────────────────────────▼────────────────────────────────────┐
│ CF-114: Slide-Over Module Details Drawer (5 SP)                        │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
┌───────────────────────────────────▼────────────────────────────────────┐
│ CF-115: Degree Switcher Navigation Bar (3 SP)                          │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
┌───────────────────────────────────▼────────────────────────────────────┐
│ CF-116: Client-Side PDF Study Plan Exporter (5 SP)                     │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
┌───────────────────────────────────▼────────────────────────────────────┐
│ CF-117: Project Documentation & Jira Board Initialization (3 SP)       │
└────────────────────────────────────────────────────────────────────────┘
```

---

### CF-111: Interactive React Flow Canvas Setup (5 SP)
* **Description:** Mount `@xyflow/react` in `src/features/canvas/GraphCanvas.tsx` (or `CurriculumCanvas.tsx`) with zoom, pan, mini-map, and controls.
* **Target Files:**
  - `src/features/canvas/CurriculumCanvas.tsx`
  - `src/features/canvas/CONTEXT.md`
  - `src/App.tsx`
* **Implementation Details:**
  1. Initialize React Flow instance wrapping node and edge collections derived from `calculateLayout()`.
  2. Implement viewport controls: `<Controls />`, `<MiniMap />`, and `<Background variant={BackgroundVariant.Dots} />`.
  3. Configure edge options: smoothstep routing with animated active highlight strokes.
  4. Implement hover and selection handlers: Dim non-connected nodes when a course is hovered/clicked; illuminate upstream prerequisite dependencies and downstream unlocked electives.
* **Acceptance Criteria:** Canvas renders smoothly at 60 FPS on 1080p and 4K displays with responsive pan/zoom capabilities.

---

### CF-112: Custom CourseNode Component with Tailwind CSS v4 (5 SP)
* **Description:** Build responsive node cards displaying course code, title, credits, type badge (Core, Elective, Capstone), and connection handles.
* **Target Files:**
  - `src/features/canvas/components/CourseNode.tsx`
  - `src/index.css`
* **Implementation Details:**
  1. Define node structure:
     - Target Handle (`type="target"`, `position={Position.Left}`).
     - Header: Course Code (e.g., `CO544`), Credit Pill (`3 Credits`), Type Badge (`CORE`, `ELECTIVE`, `CAPSTONE`).
     - Body: Course Title (with full tooltip on hover), Multi-semester banner (`2-Sem Spanning`) if applicable.
     - Footer: Dynamic status badge (Prerequisites Satisfied, Warning / Unmet, Completed).
     - Source Handle (`type="source"`, `position={Position.Right}`).
  2. Direct toggle on card: Fast checkbox/button to select/deselect elective courses without opening drawer.
  3. Dynamic styling: Amber/Red border alert when prerequisite AST rules are unmet; Indigo border for Core; Emerald for Selected Electives.
* **Acceptance Criteria:** Left handle = target, Right handle = source; styles dynamically reflect default, warning, and completed states.

---

### CF-113: Semester Swimlane Column Headers & Credit Meters (5 SP)
* **Description:** Construct sticky semester headers (Semesters 1-8) featuring real-time credit summation and red visual warnings when load < 18 credits.
* **Target Files:**
  - `src/features/canvas/components/SwimlaneHeader.tsx`
* **Implementation Details:**
  1. Position 8 column header banners strictly aligned with layout coordinates ($X = (\text{semesterIndex} - 1) \times 280\text{px}$).
  2. Calculate active credits per semester:
     - Sum mandatory CORE courses allocated to that semester.
     - Add active selected ELECTIVE courses for that semester.
     - Accurately add `creditDistribution` slices for multi-semester capstones.
  3. Visual feedback:
     - Green pill indicator when $18 \le \text{credits} \le 24$.
     - Red/Amber warning badge with alert icon when $\text{credits} < 18$ or $\text{credits} > 24$.
* **Acceptance Criteria:** Header shows current semester credit sum and updates in real time on elective toggle.

---

### CF-114: Slide-Over Module Details Drawer (5 SP)
* **Description:** Implement slide-over panel displaying syllabus description, contact hours, and prerequisite trees when a node is clicked.
* **Target Files:**
  - `src/features/drawer/ModuleDetailsDrawer.tsx`
  - `src/features/drawer/CONTEXT.md`
* **Implementation Details:**
  1. Bind visibility to Zustand store `isDrawerOpen` and `inspectedCourse`.
  2. Content sections:
     - Header: Course code, full title, total credits, department.
     - Prerequisites AST breakdown: Render human-readable boolean hierarchy (e.g., "Must complete EC101 AND EC102").
     - Multi-semester credit distribution timeline.
     - Course syllabus objectives, lecture/lab/tutorial contact hours.
     - Action buttons: "Add to Study Plan" / "Remove from Plan" (electives), "Mark Completed" toggle.
  3. Smooth CSS slide-in transition from right viewport edge; dismiss on backdrop click or `Escape` keypress.
* **Acceptance Criteria:** Drawer transitions smoothly from right; closes on backdrop click or Escape key.

---

### CF-115: Degree Switcher Navigation Bar (3 SP)
* **Description:** Build top navigation bar allowing instant switching between Computer Engineering and Electrical Engineering.
* **Target Files:**
  - `src/features/canvas/components/DegreeSelector.tsx`
  - `src/features/canvas/components/TopNav.tsx`
* **Implementation Details:**
  1. Create top header bar with CourseFlow logo, degree dropdown selector, and global graduation credit counter ($N / 150\text{ Credits}$).
  2. Degree options: `Computer Engineering` and `Electrical Engineering`.
  3. Switching degrees invokes `setActiveProgram()` in Zustand store, clearing irrelevant selections and recalculating canvas graph instantly.
* **Acceptance Criteria:** Switching programs updates the canvas graph instantly with zero full-page reload.

---

### CF-116: Client-Side PDF Study Plan Exporter (5 SP)
* **Description:** Implement `@react-pdf/renderer` generating a clean, 2-page printable academic study plan grouped by semester with credit totals.
* **Target Files:**
  - `src/features/planner/StudyPlanPDF.tsx`
  - `src/features/planner/components/ExportPdfButton.tsx`
* **Implementation Details:**
  1. Design official academic layout with `@react-pdf/renderer`:
     - Document Header: Degree title, generation date, student planner status, total completed/planned credits.
     - 8-Semester tabular breakdown: Semester column, Course Code, Course Title, Course Type, Semester Credits.
     - Credit compliance verification stamp ($\ge 18\text{ cr/sem}$ and $150\text{ total credits}$).
  2. Embed `PDFDownloadLink` in top navigation bar with dynamic filename: `CourseFlow_Plan_<Degree>_<Timestamp>.pdf`.
* **Acceptance Criteria:** Clicking "Download Plan PDF" downloads a formatted PDF within 2 seconds.

---

### CF-117: Project Documentation & Jira Board Initialization (3 SP)
* **Description:** Set up Jira sprint board, user stories, and acceptance criteria; maintain Confluence architecture overview and project guides.
* **Target Files:**
  - `guide.md`
  - `README.md`
  - Subfolder `CONTEXT.md` files
* **Implementation Details:**
  1. Create Jira Sprint 1 board with Epics (CF-EPIC-1 to CF-EPIC-5), User Stories (US001 to US014), and granular tasks (CF-101 to CF-135).
  2. Establish team sprint cadence, standup channels, and meeting minutes.
  3. Keep repository `guide.md` and `README.md` aligned with team allocations and execution state.
* **Acceptance Criteria:** Jira backlog organized with epics, points, and assignments matching this plan.

---

## 4. Agile Ceremonies & Team Protocols

1. **Sprint Planning:** First Monday of the sprint (1 hour). Review backlog items, confirm story points, and commit to sprint scope.
2. **Daily Standup (Asynchronous on Discord/Slack):** Every morning by 09:30 AM:
   - What did you accomplish yesterday?
   - What are you working on today?
   - Are there any technical blockers?
3. **Sprint Review & Live Demo:** Final Friday of the sprint (1 hour). Demonstrate working software on the `dev` branch.
4. **Sprint Retrospective:** Immediately following review (30 minutes). Discuss: What went well? What slowed us down? Action items for Sprint 2.

---

## 5. Definition of Done (DoD) & Quality Gates

A story or engineering task is marked **Done** in Jira only when:
- [ ] Code is implemented on an isolated `feature/<ticket>-<description>` branch.
- [ ] Unit & integration tests pass with zero regressions (`npm test` and `pytest`).
- [ ] Static typecheck passes (`npx tsc --noEmit`).
- [ ] PR is opened targeting `dev`, passing GitHub Actions CI checks (CourseFlow Quality Gate).
- [ ] PR is reviewed and approved by Didula (Lead Architect).
- [ ] PR is Squash Merged into `dev` and local branches are synchronized.
- [ ] Feature is validated against acceptance criteria on the live development build.
