# Sprint 2 Implementation Plan: Didula (Lead Architect & Backend Developer)

**Official Project Role:** Lead Architect & Backend Developer  
**Sprint Window:** November 02, 2026 – November 22, 2026 (3 Weeks)  
**Sprint Goal:** Deliver an automated Module Information Sheet (MIS) Ingestion & Feature Extraction Engine capable of parsing syllabus PDFs/DOCXs, extracting metadata and prerequisite ASTs using a local Small Language Model (Qwen 2.5 7B via Ollama + Instructor), surfaced via a side-by-side human review screen with 1-click database commit. Deploy authenticated admin in-app module content editor.  
**Primary Tech Stack:** Python (FastAPI), SQLAlchemy, Pydantic, PyJWT, bcrypt, NetworkX, TypeScript  
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
| **US015** | As a faculty admin, I want to authenticate securely using credentials to access administrative course editing and document extraction tools without exposing endpoints to unauthenticated users. | Must Have | 5 | CF-EPIC-6 | [x] Implemented (CF-201, PR pending) |
| **US016** | As a faculty curriculum coordinator, I want to update course content (syllabus description, title, credits, contact hours, course type) via REST endpoints with real-time validation. | Must Have | 5 | CF-EPIC-6 | [x] Implemented (CF-202, PR pending) |
| **US017** | As an academic advisor, I want to update course prerequisite rules and multi-semester credit distributions directly, persisting recursive ASTs into PostgreSQL. | Must Have | 5 | CF-EPIC-6 | [x] Backend: CF-203 |
| **US018** | As a faculty data officer, I want to upload syllabus PDFs/DOCXs to the backend to trigger asynchronous text extraction and structured parsing. | Must Have | 5 | CF-EPIC-7 | [x] Backend: CF-204 (pipeline: CF-231 to CF-234) |
| **US022** | As a faculty reviewer, I want to query the status and extracted payloads of an ingestion job, including field-level confidence scores. | Must Have | 3 | CF-EPIC-9 | [x] Backend: CF-204 |
| **US023** | As a faculty reviewer, I want to commit verified course extraction data to PostgreSQL in a single atomic transaction. | Must Have | 5 | CF-EPIC-9 | [x] Backend: CF-204 |

---

## 3. Granular Jira Tasks & Engineering Roadmap

| Ticket Key | Task Summary | Story Points | Target Epic | Assigned |
| :--- | :--- | :--- | :--- | :--- |
| [x] **CF-201** | Faculty Admin Authentication & Security Session Management | 5 SP | CF-EPIC-6 | Didula |
| [x] **CF-202** | In-App Course CRUD & Content Modification Endpoints | 5 SP | CF-EPIC-6 | Didula |
| [x] **CF-203** | Administrative Prerequisite & AST Persistence Service | 5 SP | CF-EPIC-6 | Didula |
| [x] **CF-204** | MIS Ingestion API & Extraction Review Endpoints | 5 SP | CF-EPIC-7 / CF-EPIC-9 | Didula |
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
  - `backend/app/core/config.py`, `backend/scripts/hash_password.py`, `.env.example` (settings, hash generator, documented variables)
* **Implementation Details:**
  1. Password hashing with salted `bcrypt`, used directly (the `bcrypt` package) rather than `passlib[bcrypt]`: passlib is unmaintained and breaks against the current bcrypt 5 release.
  2. JWT token generation using `PyJWT` (Access token with 60-minute expiry; optional Refresh token).
  3. Fast dependency injection: `get_current_admin_user` extracting and verifying Bearer tokens, rejecting unauthorized requests with 401 Unauthorized / 403 Forbidden.
  4. Endpoints:
     - `POST /api/v1/auth/login`: Accepts credentials, returns JWT bearer token and user role.
     - `POST /api/v1/auth/refresh`: Refreshes active token session.
     - `GET /api/v1/auth/me`: Returns active session identity and permissions.
  5. Configurable security settings via `app/core/config.py` (`SECRET_KEY`, `ACCESS_TOKEN_EXPIRE_MINUTES`, `ALGORITHM`).
* **Status:** Implemented on branch `cf-201-faculty-admin-auth` (PR pending). 32 tests in `backend/tests/test_auth.py`.
* **As delivered (differences from the original text):**
  - Accounts are configured through environment variables (`ADMIN_USERNAME` / `ADMIN_PASSWORD_HASH`, `REVIEWER_USERNAME` / `REVIEWER_PASSWORD_HASH`); there is no users table and no default credentials. An account with no hash cannot log in. Generate hashes with `python backend/scripts/hash_password.py`.
  - Two roles: `ADMIN` and `FACULTY_REVIEWER`. Guards in `app/api/deps.py`: `get_current_user` (`CurrentUser`, any session), `get_current_admin_user` (`AdminUser`, `ADMIN` only: course and prerequisite mutations) and `get_current_staff_user` (`StaffUser`, `ADMIN` or `FACULTY_REVIEWER`: extraction upload, review and commit).
  - `POST /auth/refresh` takes a still-valid bearer token and returns a new one; there is no separate refresh token. `GET /auth/me` returns `{ username, role, permissions }`.
  - The role always comes from configuration, never from the token, and removing an account revokes its live tokens. A `SECRET_KEY` left at its default is refused when `ENVIRONMENT` is `production` or `staging`, or on Vercel.
  - Login response (camelCase): `{ accessToken, tokenType: "bearer", expiresIn, user: { username, role, permissions } }`.
* **Acceptance Criteria:** Unauthenticated requests to administrative endpoints receive 401 Unauthorized; valid JWT tokens grant access; student routes (`/api/v1/programs`, `/api/v1/plans/validate`) remain 100% public.

---

### CF-202: In-App Course CRUD & Content Modification Endpoints (5 SP)
* **Description:** Build administrative REST endpoints enabling curriculum coordinators to update course descriptions, titles, credits, contact hours, and offerings directly.
* **Target Files:**
  - `backend/app/schemas/curriculum.py`
  - `backend/app/api/v1/endpoints/courses.py`
  - `backend/app/services/course_service.py`
  - `backend/tests/test_courses.py`
  - `backend/app/models/curriculum.py`, `backend/alembic/versions/0002_course_updated_at.py`, `backend/tests/test_migrations.py` (the `updated_at` column)
  - `backend/tests/conftest.py` (shared `db_client`, `admin_headers`, `reviewer_headers` fixtures)
* **Implementation Details:**
  1. Define Pydantic models: requests `CourseUpdate` (PUT), `CoursePatch` (PATCH), `CourseCreate` (POST) and `ContactHoursUpdate`; responses `AdminCourse` (`Course` plus `updatedAt`) and the `CourseResponse` envelope. Requests reject unknown fields (422).
  2. Endpoints:
     - `PUT /api/v1/courses/{course_id}`: Full update of course entity with transactional commit.
     - `PATCH /api/v1/courses/{course_id}`: Partial update (e.g. updating description or contact hours only).
     - `POST /api/v1/courses`: Create a new course node within a degree program.
  3. Validation rules:
     - Credit integrity: $1 \le \text{totalCredits} \le 12$.
     - Semester window bounds: $1 \le \text{recommendedSemester} \le 8$.
     - Course code uniqueness: `courses.code` is unique across the whole catalog (which also guarantees uniqueness inside each program), so a duplicate on create returns 409. Codes are immutable after creation (409 if a different `code` is sent on PUT/PATCH) because prerequisite rules reference them.
     - Semester window also fits every owning program's `semestersCount`; corequisites must exist and cannot include the course itself; titles are trimmed.
     - Credit distribution: single-semester courses derive it from `totalCredits` and `recommendedSemester`; a multi-semester course must send a `creditDistribution` (one entry per semester from `recommendedSemester`, summing to `totalCredits`) whenever credits, duration or start semester change.
  4. Automatic timestamp tracking (`updated_at`) and response envelope standard compliance (`{ success: true, data: Course }`).
* **Status:** Implemented on branch `cf-202-course-crud-endpoints` (stacked on CF-201; PR pending). 74 tests across `test_courses.py` and `test_migrations.py`.
* **As delivered:** The whole `/courses` router requires `ADMIN` (guarded at router level so CF-203 routes inherit it). Errors: 422 `detail: [{ loc, msg, type }]` (FastAPI shape; business rules use `loc: ["body", "<field>"]`), 404/409 `detail: "<message>"`. `courses.updated_at` is set on every mutation, including edits that only change credit distributions. Prerequisite ASTs are untouched here (CF-203). `PATCH` merges `contactHours` per field; `PUT` without `contactHours` clears them.
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
  4. Both endpoints are added to the existing admin-guarded `courses.py` router, keep the `prerequisite_rules` table in sync with `courses.prerequisite_rule` (the seeder maintains both), set `updated_at`, and reuse `check_distribution` from `app/services/course_service.py` so credit-distribution rules cannot differ from CF-202. The AST validator should be importable so Anuththara's CF-234 synthesizer can reuse it.
* **Status:** Implemented on branch `feature/cf-203-prerequisite-ast-persistence` (stacked on CF-202; PR pending). 97 passing tests across `test_ast.py` and `test_course_prerequisites.py`.
* **As delivered:** Three routes on the admin-guarded `/courses` router: `PUT /api/v1/courses/{course_id}/prerequisites` (the body is the `PrerequisiteRule` AST itself), `DELETE /api/v1/courses/{course_id}/prerequisites` (clears the rule; added beyond the plan because a PUT body of `null` cannot be expressed reliably) and `PUT /api/v1/courses/{course_id}/credit-distribution` (the body is a JSON array of `CreditDistribution`). All return `{ success, data: AdminCourse }`. Rejected with 422 (`loc` is `["body", ...path to the offending leaf]`): depth > 20, empty `AND` / `OR`, unknown or self `courseId`, and indirect circular dependencies (cycles use `loc: ["body", "prerequisiteRule"]`). Both writes keep `courses.prerequisite_rule` and the `prerequisite_rules` table in sync and bump `updated_at`. Credit distribution reuses `check_distribution` from `course_service`. The validator `find_rule_issues` in `backend/app/core/ast_evaluator.py` is importable for CF-234. `main.py` now sets `separate_input_output_schemas=False` so OpenAPI keeps single `LogicalRuleNode` style names instead of splitting them into `-Input` / `-Output`, which would break the generated TS names. `frontend/src/types/api.ts` was regenerated with the new operations.
* **Acceptance Criteria:** Prerequisite updates successfully update JSONB column; malformed trees, excessive nesting, or dangling course IDs are rejected with status 400/422.

---

### CF-204: MIS Ingestion API & Extraction Review Endpoints (5 SP)
* **Description:** Construct the REST API pipeline powering the Module Information Sheet (MIS) document extraction workflow: file upload, status polling, and atomic database ingestion.
* **Target Files:**
  - `backend/app/api/v1/endpoints/extraction.py`
  - `backend/app/schemas/extraction_jobs.py` (job API request/response models; `schemas/extraction.py` belongs to Anuththara's CF-233 extraction DTOs)
  - `backend/app/services/extraction_service.py`
  - `backend/tests/test_extraction.py` (service/unit tests; Ishani's HTTP-level suite is `test_extraction_api.py`)
* **Implementation Details:**
  1. `POST /api/v1/extraction/upload`:
     - Accepts `multipart/form-data` with PDF or DOCX file.
     - Validates MIME type and file size (limit: 15 MB): unsupported type returns 400, oversized file returns 413.
     - Computes SHA256 checksum to prevent redundant processing: identical bytes return 200 with the existing job; a new file returns 202 with the new job (`jobId`, status `PENDING`).
     - Creates an `ExtractionJob` in PostgreSQL (`PENDING` state) and dispatches processing to extraction pipeline. The `ExtractionJob` model and migration (`0003_extraction_jobs_table.py`) come from Anuththara's CF-235; the parser, LLM client and extractor from CF-231 to CF-234. A parser `ExtractionError` marks the job `FAILED` with a message instead of returning HTTP 500.
  2. `GET /api/v1/extraction/jobs/{job_id}`:
     - Returns job status, raw extracted metadata, parsed prerequisite AST, and field-level confidence scores (`0.0` to `1.0`). Canonical job states (defined by CF-235 and used by every plan): `PENDING` -> `PROCESSING` -> `EXTRACTED` (ready for review) -> `COMMITTED`, or `FAILED`. Unknown job returns 404.
  3. `POST /api/v1/extraction/jobs/{job_id}/commit`:
     - Accepts reviewed and corrected course payload from the frontend review dashboard.
     - Atomically commits the course into `courses`, `prerequisite_rules`, and `credit_distributions` tables by calling Anuththara's `ingestion_service` (CF-235), which applies the CF-202 course rules.
     - Marks extraction job as `COMMITTED`. Committing an already committed job, or one that is not `EXTRACTED`, returns 409.
  4. Access control: all three routes use the `StaffUser` guard (`ADMIN` or `FACULTY_REVIEWER`); anonymous requests return 401.
* **Status:** Implemented on branch `feature/cf-204-mis-extraction-api` (PR pending). 39 tests in `backend/tests/test_extraction.py` plus a `0003` migration test in `test_migrations.py`.
* **As delivered (built ahead of CF-231 to CF-235, which had not started):**
  - **Job persistence:** CF-204 adds `backend/app/models/extraction.py` (`ExtractionJob`) and `backend/alembic/versions/0003_extraction_jobs_table.py` (chained onto `0002_course_updated_at`) using CF-235's planned columns, plus `content_type`, `error_message` and `committed_course_id`. CF-235 extends these instead of creating them.
  - **Pipeline seam:** `extraction_service.ExtractionPipeline` is a `Protocol` with `extract(document, *, filename, content_type) -> ExtractionResult(extracted_data, confidence_scores)`, provided by the FastAPI dependency `get_extraction_pipeline()`. The default `UnavailablePipeline` raises `ExtractionError`, so jobs end `FAILED` with "Automatic extraction is not available on this server yet." until CF-231 to CF-234 return a real pipeline from that dependency. `ExtractionError` lives in `extraction_service`; CF-231's parser should raise it (or a subclass) rather than define its own. Tests (and CF-222) override the dependency with a fake.
  - **Processing:** a FastAPI background task opens its own session through the new `get_session_factory()` dependency (`app/core/database.py`; `db_client` in `conftest.py` overrides it). Any other exception becomes `FAILED` with a generic message, and confidence scores outside 0.0 to 1.0 fail the job.
  - **Upload:** the MIME type must be `application/pdf` or the DOCX type, and the file must start with the matching signature (`%PDF-` or `PK`); otherwise 400. Over 15 MB returns 413. Identical bytes return 200 with the existing job, except a `FAILED` job or a `PENDING` / `PROCESSING` job untouched for 15 minutes (`STALE_JOB_AFTER`: its worker died), which is reset to `PENDING` and retried (202, same `jobId`). Client paths are stripped from `filename`. `python-multipart` was added to both requirements files (FastAPI needs it for `UploadFile`). Not verified: Vercel caps serverless request bodies at about 4.5 MB, so the 15 MB limit only holds on a non-serverless backend (extraction needs Ollama, so it is expected to run in Docker anyway).
  - **Commit body:** `ExtractionCommitRequest` = `CourseCreate` + `prerequisiteRule` (strict). A new code creates the course in `programId`; an existing code replaces it (409 if it is not in `programId`); `prerequisiteRule` replaces the stored rule (null clears it). Written by `course_service.stage_reviewed_course` (same CF-202/CF-203 rules, no commit) and committed with the job's `COMMITTED` status in one transaction. Prerequisite errors use `loc: ["body", "prerequisiteRule", ...]`. Response: `{ success, data: { job, course: AdminCourse } }`.
  - `frontend/src/types/api.ts` regenerated (additions only).
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


---

## 6. CF-202 Loose Ends & Cross-Team Handoffs

CF-202 is implemented backend-only (`PUT`/`PATCH /api/v1/courses/{id}`, `POST /api/v1/courses`; admin-only; migration `0002_course_updated_at`). Nobody on the team had started Sprint 2 work, so the teammates' plans were edited to match what is built. The items below are a hand-off checklist: each one already appears in the owner's plan unless it is marked as a decision. Check each off when handled.

### Plan reconciliation (already applied)
- Job states: CF-204 and CF-222 said `COMPLETED`, CF-235 said `EXTRACTED`, CF-214 had its own labels. Canonical: `PENDING` -> `PROCESSING` -> `EXTRACTED` -> `COMMITTED` (or `FAILED`); CF-214 shows `UPLOADING` as a client-only state.
- File ownership: `schemas/extraction.py` is CF-233 (Anuththara) and CF-204 now uses `schemas/extraction_jobs.py`; `tests/test_pdf_parser.py` is CF-231 and Ishani's CF-223 suite is `tests/test_pdf_fixtures.py`; HTTP-level extraction tests are `test_extraction_api.py` (CF-222) and CF-204's are `test_extraction.py`.
- Migrations: `0002_course_updated_at` exists, so CF-235 became `0003_extraction_jobs_table.py` chained onto it.
- Contracts: contact hours are per semester (CF-212, CF-233); course codes use `COURSE_CODE_PATTERN` (CF-233); the CF-201 login response and token lifecycle are in CF-211 and CF-224; CF-212 reflects the immutable code, strict-body, and credit-distribution rules.
- Ownership gaps closed: `ExtractionError` and the `get_llm_client()` test seam (CF-231, CF-232), Docker pass-through of auth and Ollama settings (CF-221), and a PostgreSQL CI job (CF-225).

### Decisions needed (Didula)
- [ ] **Student reads still come from JSON files, not PostgreSQL.** `GET /programs` and the frontend load the bundled catalogs, so an admin edit persists to PostgreSQL but is invisible to students and the canvas until the read path moves to the database (or the frontend refetches from it). No sprint ticket covers this. Decide whether it is in Sprint 2 scope or a Sprint 3 item.
- [ ] **No optimistic concurrency.** Two admins editing the same course is last-write-wins (no `ETag`/`If-Unmodified-Since`). `updatedAt` is returned and could back a conflict check later.
- [ ] **Out of scope, not built:** `DELETE /courses/{id}` and adding an existing course to another program.

### Malsha: CF-211 / CF-212 (frontend)
- [ ] **Do not spread a whole `Course` into the PUT body.** Request models reject unknown fields with 422 (`id`, `prerequisiteRule` and so on) so nothing is dropped silently. Send only the editable fields. Prerequisites use their own endpoint (CF-203).
- [ ] **Course code field must be read-only on edit.** Codes are permanent IDs referenced by prerequisite ASTs; a different `code` returns **409**. Codes are only settable on create (`^[A-Z]{2,4}[0-9]{3,5}[A-Z]?$`, upper-cased by the server).
- [ ] **Multi-semester courses:** changing credits, duration or start semester on a course with more than one semester requires sending a matching `creditDistribution` in the same request (one entry per semester from `recommendedSemester`, summing to `totalCredits`). Single-semester courses derive it automatically.
- [ ] **Error shapes:** 422 is `detail: [{loc, msg, type}]` (same as FastAPI validation, so one parser works; business-rule errors use `loc: ["body", "<field>"]`); 404/409 are `detail: "<message>"`; 401 means log out; 403 means a reviewer account tried an admin action.
- [ ] **Success envelope:** `{ success: true, data: AdminCourse }`; `AdminCourse` = `Course` + `updatedAt`. Use the generated `AdminCourse`, `CourseUpdate`, `CoursePatch`, `CourseCreate` types from `api.ts`. `types/curriculum.ts` was intentionally not changed.
- [ ] **Contact hours labels:** the schema and the CF-212 plan say "per week", but the seeded values are semester totals (e.g. 14 / 14 / 7). Fix the label or the data before it reaches students. `PATCH` merges `contactHours` per field; `PUT` with `contactHours` omitted clears them.
- [ ] After saving, update the local store from `data` (the server is the source of truth for the derived `creditDistribution`).

### Anuththara: CF-233 / CF-235
- [ ] **Migration chain:** CF-235's `0002_extraction_jobs_table.py` must set `down_revision = "0002_course_updated_at"` and be renumbered `0003`. Two heads break `alembic upgrade head`; `tests/test_migrations.py::test_migration_chain_has_a_single_head` fails if this is missed.
- [ ] **Ingestion must follow the same rules as CF-202** when writing courses: credits 1 to 12, semester window, distribution sums to `totalCredits` and is consecutive from `recommendedSemester`, `updated_at` set on write, and the `prerequisite_rules` table kept in sync with `courses.prerequisite_rule` (the seeder does both). Reuse `app/services/course_service.py` rather than re-implementing it.
- [ ] **Code pattern mismatch:** CF-233 plans `^[A-Z]{2,3}[0-9]{4}$` for confidence checks; the catalog and CF-202 accept `^[A-Z]{2,4}[0-9]{3,5}[A-Z]?$`. Align them.
- [ ] **Shared courses:** 32 course IDs appear in both the CE and EE catalogs; 17 of them have different `description` text (everything else is identical). The database has one row per ID, so the seeder is last-writer-wins (EE overwrites CE), and an admin edit to a shared course changes it for both programs. Decide whether descriptions should be per-program.

- [ ] **CF-204 landed first (decision taken):** the `ExtractionJob` model, migration `0003_extraction_jobs_table` and the atomic commit (`course_service.stage_reviewed_course`) already exist. CF-235 should extend them (a new migration `0004_...` for any column change) and may move the commit body into `ingestion_service` behind the same call. CF-231 to CF-234 plug in by returning a real pipeline from `extraction_service.get_extraction_pipeline()` and raising `extraction_service.ExtractionError`.

### Ishani: CF-221 / CF-222 / CF-224 / CF-225
- [ ] **docker-compose.yml backend service** does not pass `SECRET_KEY`, `ADMIN_USERNAME`, `ADMIN_PASSWORD_HASH`, `REVIEWER_USERNAME`, `REVIEWER_PASSWORD_HASH`, so admin login cannot work in Docker. Hashes contain `$`, so quote them in `.env` (single quotes) or escape as `$$`.
- [ ] **CI has no PostgreSQL job.** All DB-backed tests run on in-memory SQLite (`db_client`, `session_factory` fixtures in `conftest.py`), and migration `0002` is only verified on SQLite. Add a Postgres service job running `alembic upgrade head` and the course tests so `JSONB` behaviour is covered. CF-222 can reuse `db_client`, `admin_headers` and `reviewer_headers`.
- [ ] **CF-225 security gates:** `PyJWT` and `bcrypt` are new dependencies (`pip-audit`); `bandit` will scan `backend/scripts/hash_password.py`; secret scanning must allow the placeholder hashes in `.env.example`.
- [ ] **CF-224 Vitest:** auth store tests should mock `POST /auth/login` (`accessToken`, `tokenType`, `expiresIn`, `user`) and 401 handling; token expiry is 60 minutes and `/auth/refresh` only accepts a still-valid token.

### My own follow-ups (CF-203 / CF-205)
- [x] **CF-203** adds its routes to the same `courses.py` router, which already requires `ADMIN` at router level. It must update both `courses.prerequisite_rule` and the `prerequisite_rules` table, bump `updated_at`, and reuse CF-202's credit-distribution checks (`check_distribution`) so the two endpoints cannot disagree.
- [ ] **CF-205:** `api.ts` was regenerated for auth, courses, CF-203 and CF-204 (extraction).
- [ ] **CF-216 docs (Malsha):** `docs/ADMIN_PORTAL_GUIDE.md` should cover the rules above (immutable codes, credit and semester bounds, multi-semester splits).
