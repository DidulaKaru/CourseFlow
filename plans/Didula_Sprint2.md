# Sprint 2 Implementation Plan: Didula (Lead Architect & Backend Developer)

**Official Project Role:** Lead Architect & Backend Developer  
**Sprint Window:** November 02, 2026 – November 22, 2026 (3 Weeks)  
**Sprint Goal:** Deliver an automated Module Information Sheet (MIS) Ingestion & Feature Extraction Engine capable of parsing syllabus PDFs/DOCXs, extracting metadata and prerequisite ASTs using a local Small Language Model (Qwen 2.5 7B via Ollama + Instructor), surfaced via a side-by-side human review screen with 1-click database commit. Deploy authenticated admin in-app module content editor.  
**Primary Tech Stack:** Python (FastAPI), SQLAlchemy, Pydantic, PyJWT, passlib/bcrypt, NetworkX, TypeScript  
**Total Allocated Story Points:** 23 SP  

---

## 1. Core Ownership Domains & Responsibilities

Didula serves as Lead Architect and Backend Developer for CourseFlow. In Sprint 2, core responsibilities encompass:
- **Faculty Admin Authentication & Session Security:** Designing and implementing a secure, stateless JWT authentication system for faculty administrators and curriculum reviewers, protecting administrative mutation routes while preserving the zero-login guest architecture for students.
- **In-App Course Content Modification Endpoints:** Developing robust REST APIs allowing authenticated faculty to update syllabus descriptions, contact hours, course titles, credit values, and offering terms directly from the application.
- **Administrative Prerequisite & AST Persistence Service:** Constructing backend mutation endpoints for modifying recursive boolean Abstract Syntax Trees (`JSONB`), validating AST schema invariants and structural integrity before persisting to PostgreSQL.
- **MIS Ingestion API & Extraction Review Orchestration:** Building multipart upload endpoints for syllabus documents, job tracking state machines, confidence score aggregation, and atomic 1-click database commitment endpoints.
- **System Contract Synchronization & PR Merge Governance:** Maintaining 1:1 synchronization between backend Pydantic models and frontend TypeScript interfaces (`openapi-typescript`), conducting architectural code reviews, and managing PR airlocks on the `dev` branch.

---

## 2. Epics & User Stories Mapping

### Target Epics
- **CF-EPIC-6: Faculty Admin Authentication & In-App Course Editor** (Epic Lead with Malsha | Faculty Admin Portal)
- **CF-EPIC-7: MIS Document Ingestion & Text Parsing Pipeline** (Epic Co-Lead with Anuththara & Ishani | MIS Extraction Engine)
- **CF-EPIC-8: Automated Course Feature & Prerequisite AST Extraction** (Epic Co-Lead with Anuththara | MIS Extraction Engine)
- **CF-EPIC-9: Extraction Review Dashboard & Database Ingestion** (Epic Co-Lead with Malsha & Anuththara | MIS Extraction Engine)

### User Stories Addressed
| User Story ID | Narrative | Priority | Story Points | Target Epic | Backend Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **US015** | As a faculty admin, I want to authenticate securely using credentials to access administrative course editing and document extraction tools without exposing endpoints to unauthenticated users. | Must Have | 5 | CF-EPIC-6 | [ ] Target: CF-201 |
| **US016** | As a faculty curriculum coordinator, I want to update course content (syllabus description, title, credits, contact hours, course type) via REST endpoints with real-time validation. | Must Have | 5 | CF-EPIC-6 | [ ] Target: CF-202 |
| **US017** | As an academic advisor, I want to update course prerequisite rules and multi-semester credit distributions directly, persisting recursive ASTs into PostgreSQL. | Must Have | 5 | CF-EPIC-6 | [ ] Target: CF-203 |
| **US018** | As a faculty data officer, I want to upload syllabus PDFs/DOCXs to the backend to trigger asynchronous text extraction and structured parsing. | Must Have | 5 | CF-EPIC-7 | [ ] Target: CF-204 |
| **US022** | As a faculty reviewer, I want to query the status and extracted payloads of an ingestion job, including field-level confidence scores. | Must Have | 3 | CF-EPIC-9 | [ ] Target: CF-204 |
| **US023** | As a faculty reviewer, I want to commit verified course extraction data to PostgreSQL in a single atomic transaction. | Must Have | 5 | CF-EPIC-9 | [ ] Target: CF-204 |

---

## 3. Granular Jira Tasks & Engineering Roadmap

| Ticket Key | Task Summary | Story Points | Target Epic | Assigned |
| :--- | :--- | :--- | :--- | :--- |
| [ ] **CF-201** | Faculty Admin Authentication & Security Session Management | 5 SP | CF-EPIC-6 | Didula |
| [ ] **CF-202** | In-App Course CRUD & Content Modification Endpoints | 5 SP | CF-EPIC-6 | Didula |
| [ ] **CF-203** | Administrative Prerequisite & AST Persistence Service | 5 SP | CF-EPIC-6 | Didula |
| [ ] **CF-204** | MIS Ingestion API & Extraction Review Endpoints | 5 SP | CF-EPIC-7 / CF-EPIC-9 | Didula |
| [ ] **CF-205** | System Contract Sync & PR Merge Governance | 3 SP | All Epics | Didula |

```
┌────────────────────────────────────────────────────────────────────────┐
│ CF-201: Faculty Admin Authentication & Security Session (5 SP)        │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
┌───────────────────────────────────▼────────────────────────────────────┐
│ CF-202: In-App Course CRUD & Content Modification Endpoints (5 SP)     │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
┌───────────────────────────────────▼────────────────────────────────────┐
│ CF-203: Administrative Prerequisite & AST Persistence Service (5 SP)  │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
┌───────────────────────────────────▼────────────────────────────────────┐
│ CF-204: MIS Ingestion API & Extraction Review Endpoints (5 SP)         │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
┌───────────────────────────────────▼────────────────────────────────────┐
│ CF-205: System Contract Sync & PR Merge Governance (3 SP)              │
└────────────────────────────────────────────────────────────────────────┘
```

---

### CF-201: Faculty Admin Authentication & Security Session Management (5 SP)
* **Description:** Implement a stateless JWT-based authentication layer protecting administrative routes. Non-admin student endpoints remain completely open with zero authentication requirements (preserving ADR-001).
* **Target Files:**
  - `backend/app/core/security.py`
  - `backend/app/api/deps.py`
  - `backend/app/schemas/auth.py`
  - `backend/app/api/v1/endpoints/auth.py`
  - `backend/tests/test_auth.py`
* **Implementation Details:**
  1. Password hashing using `passlib[bcrypt]` with salted cryptographic hashing.
  2. JWT token generation using `PyJWT` (Access token with 60-minute expiry; optional Refresh token).
  3. Fast dependency injection: `get_current_admin_user` extracting and verifying Bearer tokens, rejecting unauthorized requests with 401 Unauthorized / 403 Forbidden.
  4. Endpoints:
     - `POST /api/v1/auth/login`: Accepts credentials, returns JWT bearer token and user role.
     - `POST /api/v1/auth/refresh`: Refreshes active token session.
     - `GET /api/v1/auth/me`: Returns active session identity and permissions.
  5. Configurable security settings via `app/core/config.py` (`SECRET_KEY`, `ACCESS_TOKEN_EXPIRE_MINUTES`, `ALGORITHM`).
* **Acceptance Criteria:** Unauthenticated requests to administrative endpoints receive 401 Unauthorized; valid JWT tokens grant access; student routes (`/api/v1/programs`, `/api/v1/plans/validate`) remain 100% public.

---

### CF-202: In-App Course CRUD & Content Modification Endpoints (5 SP)
* **Description:** Build administrative REST endpoints enabling curriculum coordinators to update course descriptions, titles, credits, contact hours, and offerings directly.
* **Target Files:**
  - `backend/app/schemas/curriculum.py`
  - `backend/app/api/v1/endpoints/courses.py`
  - `backend/app/services/course_service.py`
  - `backend/tests/test_courses.py`
* **Implementation Details:**
  1. Define Pydantic request models: `CourseUpdate`, `CourseCreate`, `ContactHoursUpdate`.
  2. Endpoints:
     - `PUT /api/v1/courses/{course_id}`: Full update of course entity with transactional commit.
     - `PATCH /api/v1/courses/{course_id}`: Partial update (e.g. updating description or contact hours only).
     - `POST /api/v1/courses`: Create a new course node within a degree program.
  3. Validation rules:
     - Credit integrity: $1 \le \text{totalCredits} \le 12$.
     - Semester window bounds: $1 \le \text{recommendedSemester} \le 8$.
     - Course code uniqueness per degree program.
  4. Automatic timestamp tracking (`updated_at`) and response envelope standard compliance (`{ success: true, data: Course }`).
* **Acceptance Criteria:** Authenticated admin can update module attributes; changes persist to PostgreSQL; invalid payloads return 422 with descriptive validation error messages.

---

### CF-203: Administrative Prerequisite & AST Persistence Service (5 SP)
* **Description:** Build mutation endpoints and server-side validators for updating recursive boolean prerequisite trees and multi-semester credit distributions.
* **Target Files:**
  - `backend/app/api/v1/endpoints/courses.py`
  - `backend/app/schemas/curriculum.py`
  - `backend/app/core/ast_evaluator.py`
  - `backend/tests/test_ast.py`
* **Implementation Details:**
  1. Endpoint: `PUT /api/v1/courses/{course_id}/prerequisites`:
     - Receives `PrerequisiteRule` AST JSON in request body.
     - Validates tree structure recursively: depth guard ($\text{depth} \le 20$), valid operator tags (`AND`, `OR`), leaf nodes (`COURSE`, `CREDIT_THRESHOLD`).
     - Checks that all referenced `courseId` values exist in the active catalog (rejects dangling references).
     - Checks for preliminary self-dependency ($u \ne \text{courseId}$).
  2. Endpoint: `PUT /api/v1/courses/{course_id}/credit-distribution`:
     - Accepts array of `CreditDistribution` objects.
     - Validates that $\sum \text{creditsAllocated} = \text{course.totalCredits}$.
     - Validates sequential semester indices (e.g. Semesters 7 and 8).
  3. Persists directly into native PostgreSQL `JSONB` column on the `courses` table.
* **Acceptance Criteria:** Prerequisite updates successfully update JSONB column; malformed trees, excessive nesting, or dangling course IDs are rejected with status 400/422.

---

### CF-204: MIS Ingestion API & Extraction Review Endpoints (5 SP)
* **Description:** Construct the REST API pipeline powering the Module Information Sheet (MIS) document extraction workflow: file upload, status polling, and atomic database ingestion.
* **Target Files:**
  - `backend/app/api/v1/endpoints/extraction.py`
  - `backend/app/schemas/extraction.py`
  - `backend/app/services/extraction_service.py`
  - `backend/tests/test_extraction.py`
* **Implementation Details:**
  1. `POST /api/v1/extraction/upload`:
     - Accepts `multipart/form-data` with PDF or DOCX file.
     - Validates MIME type and file size (limit: 15 MB).
     - Computes SHA256 checksum to prevent redundant processing.
     - Creates an `ExtractionJob` in PostgreSQL (`PENDING` state) and dispatches processing to extraction pipeline.
  2. `GET /api/v1/extraction/jobs/{job_id}`:
     - Returns job status (`PROCESSING`, `COMPLETED`, `FAILED`), raw extracted metadata, parsed prerequisite AST, and field-level confidence scores.
  3. `POST /api/v1/extraction/jobs/{job_id}/commit`:
     - Accepts reviewed and corrected course payload from the frontend review dashboard.
     - Atomically commits the course into `courses`, `prerequisite_rules`, and `credit_distributions` tables.
     - Marks extraction job as `COMMITTED`.
* **Acceptance Criteria:** Uploading valid syllabus PDF initiates background job; polling returns structured course data with confidence scores; commit atomically writes course to database.

---

### CF-205: System Contract Sync & PR Merge Governance (3 SP)
* **Description:** Maintain Single Source of Truth contracts across backend Pydantic models and frontend TypeScript interfaces, lead Sprint 2 pull request code reviews, and safeguard `dev` branch stability.
* **Target Files:**
  - `backend/app/schemas/`
  - `frontend/src/types/api.ts`
  - `backend/scripts/export_openapi.py`
  - `package.json`
* **Implementation Details:**
  1. Synchronize Pydantic models with camelCase aliasing (`by_alias=True`).
  2. Automate contract generation using `npm run generate-types`.
  3. Review all incoming PRs for Sprint 2 (Malsha, Ishani, Anuththara), ensuring compliance with zero-regression policies and architectural invariants.
  4. Ensure 0 type errors, 0 linter warnings, and 100% passing tests before merge.
* **Acceptance Criteria:** `npm run generate-types` generates complete TypeScript interfaces matching all Sprint 2 endpoints without manual modifications; dev branch remains green.

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
- [ ] Static typecheck passes (`npx tsc --noEmit` and Python `ruff check`).
- [ ] PR is opened targeting `dev`, passing GitHub Actions CI checks (CourseFlow Quality Gate).
- [ ] PR is reviewed and approved by Didula (Lead Architect).
- [ ] PR is Squash Merged into `dev` and local branches are synchronized.
- [ ] Feature is validated against acceptance criteria on the live development build.
