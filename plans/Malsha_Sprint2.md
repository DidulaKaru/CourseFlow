# Sprint 2 Implementation Plan: Malsha (Frontend & Documentation Specialist)

**Official Project Role:** Frontend & Documentation Specialist  
**Sprint Window:** November 02, 2026 – November 22, 2026 (3 Weeks)  
**Sprint Goal:** Deliver an automated Module Information Sheet (MIS) Ingestion & Feature Extraction Engine capable of parsing syllabus PDFs/DOCXs, extracting metadata and prerequisite ASTs using a local Small Language Model (Qwen 2.5 7B via Ollama + Instructor), surfaced via a side-by-side human review screen with 1-click database commit. Deploy authenticated admin in-app module content editor.  
**Primary Tech Stack:** React 18, TypeScript, Tailwind CSS v4, Lucide Icons, Zustand, React-PDF / PDF.js  
**Total Allocated Story Points:** 31 SP  

---

## 1. Core Ownership Domains & Responsibilities

Malsha leads user-facing frontend component development, visual layout engineering, and agile project documentation. In Sprint 2, core responsibilities encompass:
- **Faculty Admin Authentication Modal & Session State:** Constructing an obsidian-glass authentication modal for faculty and administrators, integrating with the global auth store (`useAuthStore`), and surfacing admin controls on the canvas HUD.
- **In-App Course Editor Modal & Form Controls:** Building an interactive course editing modal enabling faculty to modify course codes, titles, descriptions, credit values, course types (Core, Elective, Capstone, Lab), and semester offerings directly on the canvas without raw JSON editing.
- **Prerequisite AST Visual Rule Editor:** Implementing an intuitive, tree-based visual builder for prerequisite boolean expressions (`AND`, `OR`, `COURSE`, `CREDIT_THRESHOLD`), allowing administrators to compose complex prerequisite trees with real-time mathematical logic previews.
- **MIS Document Upload Dropzone & Staging View:** Creating a high-performance drag-and-drop syllabus uploader with progress tracking, MIME validation, and document staging tables.
- **Extraction Review Split-Screen Dashboard:** Engineering a side-by-side workbench displaying the uploaded syllabus PDF on the left and parsed editable fields with confidence scores on the right, equipped with a 1-click database commit action.
- **Sprint 2 Documentation & Jira Board Governance:** Managing Jira Sprint 2 backlogs, burndown tracking, sprint demos, and writing administrative usage guides in `docs/` and `CONTEXT.md` files.

---

## 2. Epics & User Stories Mapping

### Target Epics
- **CF-EPIC-6: Faculty Admin Authentication & In-App Course Editor** (Epic Co-Lead with Didula | Faculty Admin Portal)
- **CF-EPIC-7: MIS Document Ingestion & Text Parsing Pipeline** (Epic Co-Lead with Anuththara & Ishani | MIS Extraction Engine)
- **CF-EPIC-9: Extraction Review Dashboard & Database Ingestion** (Epic Lead with Didula & Anuththara | MIS Extraction Engine)

### User Stories Addressed
| User Story ID | Narrative | Priority | Story Points | Target Epic | Frontend Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **US015** | As a faculty admin, I want to log in through a modal dialog to enter Admin Mode and access course management actions. | Must Have | 3 | CF-EPIC-6 | [ ] Target: CF-211 |
| **US016** | As a faculty curriculum coordinator, I want to edit course attributes (title, description, credits, contact hours, type) in an in-app modal and see updates reflected immediately on the canvas. | Must Have | 5 | CF-EPIC-6 | [ ] Target: CF-212 |
| **US017** | As an academic advisor, I want to visually edit prerequisite logic trees (adding AND/OR gates and course dependencies) with immediate validation. | Must Have | 5 | CF-EPIC-6 | [ ] Target: CF-213 |
| **US018** | As a faculty data officer, I want to drag-and-drop syllabus PDFs/DOCXs to upload them for automated feature extraction with clear progress feedback. | Must Have | 5 | CF-EPIC-7 | [ ] Target: CF-214 |
| **US022** | As a faculty reviewer, I want a split-screen dashboard showing the source PDF alongside parsed fields with color-coded confidence indicators. | Must Have | 8 | CF-EPIC-9 | [ ] Target: CF-215 |
| **US023** | As a faculty reviewer, I want to adjust any misclassified fields and click a single "Commit to Catalog" button to update the database. | Must Have | 5 | CF-EPIC-9 | [ ] Target: CF-215 |

---

## 3. Granular Jira Tasks & Engineering Roadmap

| Ticket Key | Task Summary | Story Points | Target Epic | Assigned |
| :--- | :--- | :--- | :--- | :--- |
| [ ] **CF-211** | Faculty Admin Authentication Modal & Session State | 3 SP | CF-EPIC-6 | Malsha |
| [ ] **CF-212** | In-App Course Editor Modal & Form Controls | 5 SP | CF-EPIC-6 | Malsha |
| [ ] **CF-213** | Prerequisite AST Visual Rule Editor | 5 SP | CF-EPIC-6 | Malsha |
| [ ] **CF-214** | MIS Document Upload Dropzone & Staging View | 5 SP | CF-EPIC-7 | Malsha |
| [ ] **CF-215** | Extraction Review Split-Screen Dashboard | 8 SP | CF-EPIC-9 | Malsha |
| [ ] **CF-216** | Sprint 2 Documentation & Jira Governance | 5 SP | Governance | Malsha |

```
┌────────────────────────────────────────────────────────────────────────┐
│ CF-211: Faculty Admin Authentication Modal & Session State (3 SP)      │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
┌───────────────────────────────────▼────────────────────────────────────┐
│ CF-212: In-App Course Editor Modal & Form Controls (5 SP)              │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
┌───────────────────────────────────▼────────────────────────────────────┐
│ CF-213: Prerequisite AST Visual Rule Editor (5 SP)                     │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
┌───────────────────────────────────▼────────────────────────────────────┐
│ CF-214: MIS Document Upload Dropzone & Staging View (5 SP)             │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
┌───────────────────────────────────▼────────────────────────────────────┐
│ CF-215: Extraction Review Split-Screen Dashboard (8 SP)                │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
┌───────────────────────────────────▼────────────────────────────────────┐
│ CF-216: Sprint 2 Documentation & Jira Governance (5 SP)                │
└────────────────────────────────────────────────────────────────────────┘
```

---

### CF-211: Faculty Admin Authentication Modal & Session State (3 SP)
* **Description:** Construct the faculty login modal dialog and Zustand authentication store (`useAuthStore`) enabling seamless switching between Student Guest Mode and Faculty Admin Mode.
* **Target Files:**
  - `src/features/admin/components/AdminLoginModal.tsx`
  - `src/features/admin/store/authStore.ts`
  - `src/features/canvas/components/TopNav.tsx`
* **Implementation Details:**
  1. Build `AdminLoginModal` adhering to Skyrim obsidian aesthetic (`bg-[#070B12]/95 border border-white/10 backdrop-blur-md rounded-sm`).
  2. Implement `useAuthStore` with token persistence:
     - `token: string | null`
     - `user: { username: string; role: 'ADMIN' | 'FACULTY_REVIEWER' } | null`
     - `login(username, password)` -> calls `/api/v1/auth/login`
     - `logout()` -> clears token and returns UI to standard Student Mode
  3. Update `TopNav`: Add subtle "Admin Access" lock icon; when logged in, display tracked `[ADMIN MODE]` badge with logout dropdown.
* **Acceptance Criteria:** Valid credentials switch HUD to Admin Mode; invalid credentials trigger inline error text; logging out cleanly revokes admin controls.

---

### CF-212: In-App Course Editor Modal & Form Controls (5 SP)
* **Description:** Build an administrative modal enabling authorized faculty to edit course information directly from the canvas node or drawer.
* **Target Files:**
  - `src/features/admin/components/CourseEditorModal.tsx`
  - `src/features/canvas/components/CourseNode.tsx`
  - `src/features/drawer/ModuleDetailsDrawer.tsx`
* **Implementation Details:**
  1. Add an "Edit Course" action button visible only in Admin Mode on `CourseNode` cards and inside `ModuleDetailsDrawer`.
  2. Form fields:
     - Course Code (`CO544`), Title, Total Credits ($1\text{--}12$).
     - Course Type dropdown (`CORE`, `ELECTIVE`, `LAB`, `CAPSTONE`).
     - Recommended Semester ($1\text{--}8$) and Offering Semesters (`FALL`, `SPRING`, `BOTH`).
     - Academic Contact Hours (Lectures, Labs, Tutorials per week).
     - Full Syllabus Objectives and Description textarea.
  3. Form submission calls `PUT /api/v1/courses/{id}`, updates local Zustand course catalog, and optimistic-refreshes the canvas graph without full-page reload.
* **Acceptance Criteria:** Editing course attributes updates PostgreSQL and immediately reflects on the canvas card and drawer; validation prevents saving invalid credit numbers.

---

### CF-213: Prerequisite AST Visual Rule Editor (5 SP)
* **Description:** Build a recursive visual editor component allowing administrators to view, construct, and modify boolean prerequisite AST expressions without writing raw JSON.
* **Target Files:**
  - `src/features/admin/components/AstVisualEditor.tsx`
  - `src/features/admin/components/AstRuleNode.tsx`
  - `src/core/algorithms/ast_evaluator.ts`
* **Implementation Details:**
  1. Tree-based UI rendering nested logical groups (`AND` / `OR` gates) with indentation lines and operator toggles.
  2. Leaf node selectors:
     - `COURSE` selector: Autocomplete searchable dropdown of all courses in the active program.
     - `CREDIT_THRESHOLD` input: Numeric input for minimum earned credits.
  3. Tree actions:
     - "Add Condition" (+ Course or + Credit Threshold).
     - "Add Nested Group" (+ Logical AND/OR block).
     - "Remove Node" (trash icon).
  4. Real-time mathematical preview: Renders live formula string (e.g. `(CO221 AND CO222) OR (CO225 AND ≥ 45 Credits)`).
* **Acceptance Criteria:** Administrators can construct compound `AND`/`OR` trees visually; tree serializes directly to `PrerequisiteRule` contract and passes AST evaluation.

---

### CF-214: MIS Document Upload Dropzone & Staging View (5 SP)
* **Description:** Create the syllabus document upload dropzone and document queue manager for faculty data officers.
* **Target Files:**
  - `src/features/mis/components/MisUploadDropzone.tsx`
  - `src/features/mis/components/DocumentQueueTable.tsx`
  - `src/features/mis/pages/MisIngestionPage.tsx`
* **Implementation Details:**
  1. Drag-and-drop upload zone with animated dashed border and file drag states.
  2. File validation: Accepts `.pdf` and `.docx` up to 15 MB.
  3. Progress telemetry: Upload progress bar and ingestion state indicator (`UPLOADING`, `EXTRACTING`, `READY_FOR_REVIEW`).
  4. Staging table listing recent uploads: File Name, Size, Upload Time, Detected Course Code, Extraction Status, and "Review Extraction" action button.
* **Acceptance Criteria:** Dragging a PDF initiates upload; progress is visually displayed; completed upload adds a row to the staging table with an active "Review" link.

---

### CF-215: Extraction Review Split-Screen Dashboard (8 SP)
* **Description:** Build the dual-pane human-in-the-loop review workbench displaying the original PDF document side-by-side with extracted course fields, confidence badges, and one-click commit action.
* **Target Files:**
  - `src/features/mis/components/ExtractionReviewWorkbench.tsx`
  - `src/features/mis/components/PdfViewerPane.tsx`
  - `src/features/mis/components/ExtractedFieldsPane.tsx`
  - `src/features/mis/components/ConfidenceBadge.tsx`
* **Implementation Details:**
  1. Left Pane (`PdfViewerPane`): Embedded PDF viewer with page navigation, zoom in/out, and text selection.
  2. Right Pane (`ExtractedFieldsPane`):
     - Course Code, Title, Credits, and Type form inputs.
     - Extracted Contact Hours table.
     - Generated Prerequisite AST preview with interactive visual AST editor embedded.
     - Field Confidence Badges:
       - Green ($\ge 90\%$): High confidence.
       - Amber ($70\text{--}89\%$): Review recommended.
       - Red ($< 70\%$): Manual input required.
  3. Action Footer:
     - "Discard Extraction" button.
     - "Save Draft" button.
     - "Commit to Curriculum Database" button with confirmation modal summarizing changes.
* **Acceptance Criteria:** Split-screen renders PDF on left and editable extracted fields on right; clicking commit writes verified course data to PostgreSQL and redirects to canvas.

---

### CF-216: Sprint 2 Documentation & Jira Governance (5 SP)
* **Description:** Author comprehensive documentation for Sprint 2 deliverables, maintain Jira backlogs and sprint boards, and update architectural context files.
* **Target Files:**
  - `docs/ADMIN_PORTAL_GUIDE.md`
  - `docs/MIS_EXTRACTION_GUIDE.md`
  - `docs/SYSTEM_STATE.md`
  - `frontend/src/features/mis/CONTEXT.md`
  - `frontend/src/features/admin/CONTEXT.md`
* **Implementation Details:**
  1. Initialize Jira Sprint 2 board with user stories (US015 to US025) and engineering tickets (CF-201 to CF-235).
  2. Write `ADMIN_PORTAL_GUIDE.md` detailing login procedures, course content editing, and AST rule configuration.
  3. Write `MIS_EXTRACTION_GUIDE.md` detailing document preparation, extraction review workflows, and confidence score thresholds.
  4. Keep repository `guide.md`, `README.md`, and subfolder `CONTEXT.md` files synchronized with implementation state.
* **Acceptance Criteria:** Jira backlog organized; documentation published with complete step-by-step administrator workflows.

---

## 4. Agile Ceremonies & Team Protocols

1. **Sprint Planning:** First Monday of Sprint 2 (1 hour). Review backlog items, confirm story points, and commit to sprint scope.
2. **Daily Standup (Asynchronous on Discord/Slack):** Every morning by 09:30 AM:
   - What did you accomplish yesterday?
   - What are you working on today?
   - Are there any technical blockers?
3. **Sprint Review & Live Demo:** Final Friday of Sprint 2 (1 hour). Demonstrate working MIS document extraction and in-app course editing on the `dev` branch.
4. **Sprint Retrospective:** Immediately following review (30 minutes). Discuss: What went well? What slowed us down? Action items for Sprint 3.

---

## 5. Definition of Done (DoD) & Quality Gates

A story or engineering task is marked **Done** in Jira only when:
- [ ] Code is implemented on an isolated `feature/<ticket>-<description>` branch.
- [ ] Unit & integration tests pass with zero regressions (`npm test` and `pytest backend/tests`).
- [ ] Static typecheck passes (`npx tsc --noEmit`).
- [ ] PR is opened targeting `dev`, passing GitHub Actions CI checks (CourseFlow Quality Gate).
- [ ] PR is reviewed and approved by Didula (Lead Architect).
- [ ] PR is Squash Merged into `dev` and local branches are synchronized.
- [ ] Feature is validated against acceptance criteria on the live development build.

