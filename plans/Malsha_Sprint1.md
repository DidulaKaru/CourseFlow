# Sprint 1 Implementation Plan: Malsha (Frontend & Documentation)

**Role:** Frontend Developer & Technical Documentation Lead  
**Sprint Focus:** Canvas Component Engineering, 8-Semester Swimlanes, Slide-Over Drawer, PDF Exporter, and Project Governance  
**Target Milestone:** Sprint 1 Delivery (Zero-Login Student Web App for 2 Degree Programs)

---

## 1. Responsibilities & Domain Ownership
Malsha leads user-facing frontend component design and technical project governance. In Sprint 1, responsibilities encompass:
- Crafting custom React Flow canvas nodes (`CourseNode`) with Tailwind CSS styling and dynamic status badges.
- Constructing the 8-semester swimlane headers with live per-semester credit gauges.
- Implementing the interactive Degree Switcher dropdown (Computer Engineering vs. Electrical Engineering).
- Developing the slide-over `ModuleDetails` Drawer for in-depth course information and elective selection.
- Building the formatted 8-semester study plan PDF export using `@react-pdf/renderer`.
- Establishing Jira sprint backlogs, user stories, and maintaining living documentation in `guide.md`, `README.md`, and `CONTEXT.md` files.

---

## 2. Phase-by-Phase Execution Roadmap

```
┌────────────────────────────────────────────────────────────────────────┐
│ Phase 1: Design System, Tokens & Mock Component Prototyping            │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
┌───────────────────────────────────▼────────────────────────────────────┐
│ Phase 2: Custom CourseNode Component Engineering                       │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
┌───────────────────────────────────▼────────────────────────────────────┐
│ Phase 3: 8-Semester Swimlane Canvas & Credit Meters                    │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
┌───────────────────────────────────▼────────────────────────────────────┐
│ Phase 4: Slide-Over ModuleDetails Drawer                               │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
┌───────────────────────────────────▼────────────────────────────────────┐
│ Phase 5: Client-Side Study Plan PDF Exporter                           │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
┌───────────────────────────────────▼────────────────────────────────────┐
│ Phase 6: Project Governance, Jira Setup & Sprint Demo Assets           │
└────────────────────────────────────────────────────────────────────────┘
```

---

### Phase 1: Design System, Tokens & Mock Component Prototyping
* **Goal:** Verify Tailwind CSS styling tokens, color palettes, and typography for interactive nodes.
* **Target Files:**
  - `src/index.css`
  - `src/features/canvas/CONTEXT.md`
* **Tasks:**
  1. Define design tokens for course types:
     - Core: Slate / Indigo accent borders and badges.
     - Elective: Emerald / Teal accent borders and selectable state highlights.
     - Capstone / Multi-Semester: Purple / Violet dual-semester span badges.
     - Warning / Prerequisite Unmet: Amber / Crimson warning alerts.
  2. Implement mock-first workflow using `src/data/mock_course.json` to style components independently of backend APIs.
* **Verification:** Component preview renders cleanly without visual glitches or unstyled classes.

---

### Phase 2: Custom `CourseNode` Component Engineering
* **Goal:** Build a highly polished, interactive custom node for React Flow v12.
* **Target Files:**
  - `src/features/canvas/components/CourseNode.tsx`
  - `src/features/canvas/components/CourseNode.css` (or pure Tailwind utility classes)
* **Tasks:**
  1. Support React Flow node data props conforming to `Course`.
  2. Render:
     - Header: Course Code (e.g., `CO544`), Credit Badge (e.g., `3 Credits`), Course Type badge (`CORE`, `ELECTIVE`, `CAPSTONE`).
     - Body: Course Title (truncated with tooltip), duration indicator (e.g., `2-Sem Spanning`).
     - Footer: Prerequisite status badge (Satisfied, Pending, Missing Prerequisite).
  3. Interactive features:
     - Hover highlight: Highlight incoming prerequisite edges and outgoing unlocked courses.
     - Click handler: Dispatches `openCourseDrawer(course)` to Zustand store.
     - Elective checkbox/toggle: Fast toggle directly on the card for elective modules.
* **Verification:** Node responds dynamically to clicks and renders all course types with proper styling.

---

### Phase 3: 8-Semester Swimlane Canvas & Credit Meters
* **Goal:** Create the main interactive canvas viewport with fixed swimlanes and live credit feedback.
* **Target Files:**
  - `src/features/canvas/CurriculumCanvas.tsx`
  - `src/features/canvas/components/SwimlaneHeader.tsx`
  - `src/features/canvas/components/DegreeSelector.tsx`
* **Tasks:**
  1. Render 8 vertical swimlane columns, spaced at $X = \text{semesterIndex} \times 280\text{px}$.
  2. Implement `SwimlaneHeader`:
     - Displays `Semester 1` through `Semester 8`.
     - Displays real-time total credit load for that semester.
     - Credit gauge pill: Green if $\ge 18$ and $\le 24$; Red/Amber with alert icon if $< 18$ credits.
  3. Implement `DegreeSelector`:
     - Dropdown switching between `Computer Engineering` and `Electrical Engineering`.
     - Switches `activeProgramId` in `usePlannerStore`.
  4. Embed `@xyflow/react` `<ReactFlow>` canvas with controls (zoom, pan, minimap, fit view).
* **Verification:** Changing active degree recalculates the graph smoothly; per-semester credit totals update immediately when electives are toggled.

---

### Phase 4: Slide-Over `ModuleDetails` Drawer
* **Goal:** Allow students to inspect comprehensive course metadata without navigating away from the canvas.
* **Target Files:**
  - `src/features/drawer/ModuleDetailsDrawer.tsx`
  - `src/features/drawer/CONTEXT.md`
* **Tasks:**
  1. Bind drawer visibility to `isDrawerOpen` and `inspectedCourse` from `usePlannerStore`.
  2. Render slide-over modal containing:
     - Full Course Code and Title.
     - Total credits and multi-semester allocation breakdown (e.g., `Semester 7: 3 cr, Semester 8: 3 cr`).
     - Prerequisite Rule breakdown in human-readable terms.
     - Co-requisites list.
     - Course description and syllabus overview.
     - Interactive action button: "Add to Plan" / "Remove from Plan" (for electives), "Mark as Completed" toggle.
* **Verification:** Clicking any canvas node opens the drawer with exact course metadata; close button or outside click closes it cleanly.

---

### Phase 5: Client-Side Study Plan PDF Exporter
* **Goal:** Enable students to generate and download an official formatted PDF study plan directly from their browser.
* **Target Files:**
  - `src/features/planner/StudyPlanPDF.tsx`
  - `src/features/planner/components/ExportPdfButton.tsx`
* **Tasks:**
  1. Build PDF document layout using `@react-pdf/renderer`:
     - Header: Degree Program Name, Graduation Summary (Total Planned Credits / 150), Generation Timestamp.
     - Body: 8 semester tables detailing Course Code, Title, Course Type, Credits, and Status.
     - Footer: Credit compliance verification stamp ($\ge 18\text{ cr/sem}$ and $150\text{ total credits}$).
  2. Integrate `PDFDownloadLink` with loading spinner and download button in the canvas top navigation bar.
* **Verification:** Generated PDF matches the student's active plan, correctly includes multi-semester credit distributions, and opens cleanly in standard PDF readers.

---

### Phase 6: Project Governance, Jira Setup & Sprint Demo Assets
* **Goal:** Maintain agile project governance, task tracking, and documentation integrity.
* **Target Files:**
  - `guide.md`
  - `README.md`
  - Directory `CONTEXT.md` files
* **Tasks:**
  1. Configure Jira project board:
     - Create Epics for Sprint 1 (Canvas UI, Degree Data, QA Infrastructure, Core Math).
     - Populate user stories and assign tickets (`CF-101` through `CF-115`).
  2. Setup Confluence space for architecture diagrams and meeting minutes.
  3. Keep `guide.md` and `README.md` updated with the latest team member allocations and setup runbooks.
  4. Prepare Sprint 1 review slide deck and live demonstration script for academic examiners.
* **Verification:** Jira sprint burndown is active, backlog is prioritized, and markdown docs are synchronized with repository code.

---

## 3. Definition of Done (DoD) for Sprint 1
- [ ] `CourseNode` handles all 4 course types (`CORE`, `ELECTIVE`, `LAB`, `CAPSTONE`) and displays prerequisite warning badges.
- [ ] 8-semester swimlane columns and live credit counters render reliably on the canvas.
- [ ] Degree switcher transitions between Computer Engineering and Electrical Engineering without layout glitches.
- [ ] Slide-over `ModuleDetailsDrawer` opens and closes smoothly, reflecting Zustand store state.
- [ ] Client-side PDF export produces a clean, readable 8-semester schedule matching student selections.
- [ ] Jira sprint board is structured and updated; `guide.md` and `README.md` accurately describe active operations.
