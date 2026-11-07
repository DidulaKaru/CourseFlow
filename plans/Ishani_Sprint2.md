# Sprint 2 Implementation Plan: Ishani (QA & DevOps Engineer)

**Official Project Role:** QA & DevOps Engineer  
**Sprint Window:** November 02, 2026 – November 22, 2026 (3 Weeks)  
**Sprint Goal:** Deliver an automated Module Information Sheet (MIS) Ingestion & Feature Extraction Engine capable of parsing syllabus PDFs/DOCXs, extracting metadata and prerequisite ASTs using a local Small Language Model (Qwen 2.5 7B via Ollama + Instructor), surfaced via a side-by-side human review screen with 1-click database commit. Deploy authenticated admin in-app module content editor.  
**Primary Tech Stack:** Docker Compose, Ollama Container, GitHub Actions, Pytest, Vitest, Playwright, Ruff, Bandit  
**Total Allocated Story Points:** 23 SP  

---

## 1. Core Ownership Domains & Responsibilities

Ishani leads quality assurance, continuous integration, test automation, and local developer environment orchestration. In Sprint 2, core responsibilities encompass:
- **Containerized Local SLM Runtime & Ollama Orchestration:** Configuring and managing the local Ollama container within `docker-compose.yml`, automating the pull and mounting of `qwen2.5:7b-instruct` (and `phi3.5:3.8b-instruct`), and configuring GPU passthrough with graceful CPU fallback.
- **Document Upload & Extraction E2E Test Suite:** Writing end-to-end integration tests covering document ingestion endpoints, temporary file handling, job status polling, and database commit workflows.
- **Malformed PDF & OCR Test Fixture Library:** Assembling a comprehensive test corpus of real-world faculty syllabus documents, including clean tabular PDFs, multi-column handbooks, low-resolution scanned pages, and syntactically defective PDFs to rigorously test OCR and parser resilience.
- **Automated Admin Auth & In-App Editor Vitest Suite:** Implementing comprehensive frontend test suites verifying JWT authentication lifecycle, admin route guards, Course Editor form submissions, and visual AST editor state mutations.
- **CI/CD Pipeline Expansion & Security Audit Gates:** Extending GitHub Actions workflows to include automated Python security audits (`bandit`, `pip-audit`), secret scanning, and enforcing a $\ge 85\%$ test coverage standard across all new extraction and admin services.

---

## 2. Epics & User Stories Mapping

### Target Epics
- **CF-EPIC-4: Infrastructure, DevOps & Automated Quality Gates** (Epic Lead | Core Infrastructure | Sprint 1 & 2)
- **CF-EPIC-7: MIS Document Ingestion & Text Parsing Pipeline** (DevOps Co-Lead with Anuththara)

### User Stories Supported
| User Story ID | Narrative | Priority | Story Points | Target Epic | Verification Mechanism |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **US015** | Faculty Admin Authentication & Security Session | Must Have | 5 | CF-EPIC-6 | Pytest JWT token validation tests & Vitest auth store tests |
| **US016** | In-App Course Content & Metadata Editor | Must Have | 5 | CF-EPIC-6 | Vitest CourseEditorModal form tests & Pytest PUT endpoint tests |
| **US017** | Administrative Prerequisite & AST Persistence | Must Have | 5 | CF-EPIC-6 | Vitest visual AST editor tests & Pytest AST schema validation |
| **US018** | Syllabus Document (MIS) Upload | Must Have | 5 | CF-EPIC-7 | Pytest multipart upload tests, file size limits & MIME checking |
| **US019** | Deterministic Document Text & Table Extraction | Must Have | 5 | CF-EPIC-7 | Automated test runner against curated PDF fixture library |
| **US024** | Automated Quality Verification for Ingestion & SLM Pipelines | Must Have | 5 | CF-EPIC-4 | End-to-end mock SLM integration tests & CI quality gates |
| **US025** | Containerized Local SLM Runtime Orchestration | Must Have | 5 | CF-EPIC-4 | Docker Compose health check probe & Ollama container setup |

---

## 3. Granular Jira Tasks & Engineering Roadmap

| Ticket Key | Task Summary | Story Points | Target Epic | Assigned | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| [ ] **CF-221** | Containerized Local SLM Runtime & Ollama Orchestration | 5 SP | CF-EPIC-4 | Ishani | Planned |
| [ ] **CF-222** | Document Upload & Extraction E2E Integration Test Suite | 5 SP | CF-EPIC-4 / CF-EPIC-7 | Ishani | Planned |
| [ ] **CF-223** | Malformed PDF & OCR Fixture Library | 5 SP | CF-EPIC-4 / CF-EPIC-7 | Ishani | Planned |
| [ ] **CF-224** | Automated Admin Auth & In-App Editor Vitest Suite | 5 SP | CF-EPIC-4 / CF-EPIC-6 | Ishani | Planned |
| [ ] **CF-225** | CI/CD Pipeline Expansion & Security Audit Gates | 3 SP | CF-EPIC-4 | Ishani | Planned |

```
┌────────────────────────────────────────────────────────────────────────┐
│ CF-221: Containerized Local SLM Runtime & Ollama Orchestration (5 SP)  │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
┌───────────────────────────────────▼────────────────────────────────────┐
│ CF-222: Document Upload & Extraction E2E Integration Test Suite (5 SP) │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
┌───────────────────────────────────▼────────────────────────────────────┐
│ CF-223: Malformed PDF & OCR Fixture Library (5 SP)                     │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
┌───────────────────────────────────▼────────────────────────────────────┐
│ CF-224: Automated Admin Auth & In-App Editor Vitest Suite (5 SP)       │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
┌───────────────────────────────────▼────────────────────────────────────┐
│ CF-225: CI/CD Pipeline Expansion & Security Audit Gates (3 SP)         │
└────────────────────────────────────────────────────────────────────────┘
```

---

### CF-221: Containerized Local SLM Runtime & Ollama Orchestration (5 SP)
* **Description:** Add and configure a dedicated `ollama` service within `docker-compose.yml` to serve Qwen 2.5 7B locally, with volume persistence for model weights and health check orchestration.
* **Target Files:**
  - `docker-compose.yml`
  - `backend/scripts/init-ollama.sh`
  - `.env.example`
* **Implementation Details:**
  1. Add `ollama` service using official `ollama/ollama:latest` image.
  2. Configure shared volume `ollama_models:/root/.ollama` to cache downloaded models across container restarts.
  3. Implement startup hook: `backend/scripts/init-ollama.sh` that checks if `qwen2.5:7b-instruct` is pulled and initiates `ollama pull qwen2.5:7b-instruct` on first run.
  4. Expose port `11434` with health check probe: `curl -f http://localhost:11434/api/tags || exit 1`.
  5. Configure NVIDIA container runtime parameters for GPU acceleration with automatic fallback to multi-threaded CPU inference.
* **Acceptance Criteria:** Running `docker compose up` starts database, backend, frontend, and Ollama; Ollama responds with status 200 on port 11434 with Qwen 2.5 model ready.

---

### CF-222: Document Upload & Extraction E2E Integration Test Suite (5 SP)
* **Description:** Build comprehensive integration tests for the MIS document upload API, extraction job lifecycle, and database ingestion.
* **Target Files:**
  - `backend/tests/test_extraction_api.py`
  - `backend/tests/conftest.py`
* **Implementation Details:**
  1. Test file upload validation:
     - Valid PDF upload returns HTTP 202 / 200 with `job_id`.
     - Unsupported MIME types (e.g. `.exe`, `.jpg`) return 400 Bad Request.
     - Files exceeding 15 MB return 413 Payload Too Large.
  2. Test extraction job polling:
     - `GET /api/v1/extraction/jobs/{job_id}` returns valid status progression (`PENDING` -> `PROCESSING` -> `COMPLETED`).
     - Non-existent job ID returns 404 Not Found.
  3. Test database commit:
     - `POST /api/v1/extraction/jobs/{job_id}/commit` inserts course, prerequisite AST, and credit distributions into PostgreSQL.
     - Re-committing an already committed job returns 409 Conflict.
  4. Deterministic offline mocking: Provide mock fixtures for Ollama LLM client to ensure tests run reliably in CI without requiring local GPU hardware.
* **Acceptance Criteria:** Pytest integration suite passes cleanly with zero network dependencies in under 8 seconds.

---

### CF-223: Malformed PDF & OCR Fixture Library (5 SP)
* **Description:** Create a curated fixture library of real-world syllabus documents to test the robustness of the `pdfplumber` and OCR extraction pipelines.
* **Target Files:**
  - `backend/tests/fixtures/syllabi/`
  - `backend/tests/test_pdf_parser.py`
* **Implementation Details:**
  1. Curate test fixtures:
     - `standard_course.pdf`: Clean text with standard contact hour table.
     - `multi_semester_capstone.pdf`: 2-semester spanning capstone with split credit breakdown.
     - `complex_prerequisites.pdf`: Nested prerequisite clauses (mixed AND/OR statements).
     - `scanned_page.pdf`: Image-only PDF requiring OCR processing.
     - `corrupted_document.pdf`: Damaged PDF to test graceful failure handling.
  2. Write automated test assertions verifying:
     - Parser extracts course code and credit numbers accurately across standard documents.
     - Corrupted or unparseable documents raise structured `ExtractionError` instead of unhandled 500 server crashes.
* **Acceptance Criteria:** Test suite runs against all fixtures; parser achieves $\ge 95\%$ accuracy on clean documents and fails gracefully on corrupted inputs.

---

### CF-224: Automated Admin Auth & In-App Editor Vitest Suite (5 SP)
* **Description:** Write frontend unit and component tests for the administrative authentication workflow, Course Editor modal, and visual AST editor.
* **Target Files:**
  - `src/features/admin/__tests__/authStore.test.ts`
  - `src/features/admin/components/__tests__/CourseEditorModal.test.tsx`
  - `src/features/admin/components/__tests__/AstVisualEditor.test.tsx`
* **Implementation Details:**
  1. `authStore.test.ts`:
     - Successful login saves JWT token and updates role to `ADMIN`.
     - Logout clears token from memory and `localStorage`.
     - Rehydrating expired token automatically triggers logout.
  2. `CourseEditorModal.test.tsx`:
     - Renders form pre-populated with existing course values.
     - Validates required fields (code, title, credits).
     - Dispatches update action on valid submit.
  3. `AstVisualEditor.test.tsx`:
     - Adding a child rule expands the tree.
     - Toggling operator changes `AND` to `OR`.
     - Live formula preview string updates dynamically.
* **Acceptance Criteria:** All frontend admin tests pass in Vitest with 100% assertions satisfied.

---

### CF-225: CI/CD Pipeline Expansion & Security Audit Gates (3 SP)
* **Description:** Enhance the GitHub Actions CI pipeline to include static security auditing, dependency vulnerability scans, and secret leak detection.
* **Target Files:**
  - `.github/workflows/ci.yml`
  - `.github/workflows/security.yml`
* **Implementation Details:**
  1. Add Python security analysis job:
     - Run `bandit -r backend/app` to detect common security flaws.
     - Run `pip-audit -r backend/requirements.txt` to detect vulnerable Python dependencies.
  2. Add frontend audit job:
     - Run `npm audit --audit-level=high`.
  3. Pre-commit hook configuration:
     - Enforce secret scanning to prevent accidental commit of JWT secrets, Neon database passwords, or private API keys.
* **Acceptance Criteria:** Security scan runs on all PRs targeting `dev`; any high-severity vulnerability or exposed secret fails the pipeline.

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
