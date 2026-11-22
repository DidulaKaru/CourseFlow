# Sprint 2 Implementation Plan: Anuththara (Database & AI Engineer)

**Official Project Role:** Database & AI Engineer  
**Sprint Window:** November 02, 2026 – November 22, 2026 (3 Weeks)  
**Sprint Goal:** Deliver an automated Module Information Sheet (MIS) Ingestion & Feature Extraction Engine capable of parsing syllabus PDFs/DOCXs, extracting metadata and prerequisite ASTs using a local Small Language Model (Qwen 2.5 7B via Ollama + Instructor), surfaced via a side-by-side human review screen with 1-click database commit. Deploy authenticated admin in-app module content editor.  
**Primary Tech Stack:** Python, pdfplumber, pytesseract / DocTR, Ollama, Instructor, Pydantic, SQLAlchemy, PostgreSQL, Alembic  
**Total Allocated Story Points:** 23 SP  

---

## 1. Core Ownership Domains & Responsibilities

Anuththara leads database architecture, schema migrations, natural language processing, and AI feature extraction pipelines. In Sprint 2, core responsibilities encompass:
- **Deterministic PDF Text & Tabular Extraction Pipeline:** Implementing parsing modules with `pdfplumber` to extract native syllabus text, academic contact hour grids (lectures, labs, tutorials), and metadata tables, with OCR fallback (`pytesseract` / `DocTR`) for scanned documents.
- **Local Small Language Model (SLM) Inference Service:** Configuring and connecting to local Ollama inference runtime running Qwen 2.5 7B-Instruct (or Phi-3.5-mini), designing optimized system prompts, and managing few-shot extraction context.
- **Grammar-Guided Structured Extraction with Instructor:** Using `instructor` to enforce strict logit-level schema constraints ensuring the SLM outputs 100% syntactically valid JSON adhering to Pydantic DTO contracts with field-level confidence telemetry.
- **Natural-Language Prerequisite to AST Synthesizer:** Developing specialized NLP logic translating unstructured prerequisite prose into canonical recursive boolean Abstract Syntax Trees (`AND`, `OR`, `COURSE`, `CREDIT_THRESHOLD`).
- **Extraction Job Relational Modeling & Database Ingestion:** Modeling the `extraction_jobs` PostgreSQL schema in SQLAlchemy, creating Alembic migrations, and building atomic upsert services to write verified course data into the curriculum database.

---

## 2. Epics & User Stories Mapping

### Target Epics
- **CF-EPIC-7: MIS Document Ingestion & Text Parsing Pipeline** (Epic Lead with Ishani | MIS Extraction Engine)
- **CF-EPIC-8: Automated Course Feature & Prerequisite AST Extraction** (Epic Lead with Didula | MIS Extraction Engine)
- **CF-EPIC-9: Extraction Review Dashboard & Database Ingestion** (Co-Lead with Malsha & Didula | MIS Extraction Engine)

### User Stories Supported
| User Story ID | Narrative | Priority | Story Points | Target Epic | Contribution |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **US018** | Upload syllabus PDFs/DOCXs to trigger feature extraction | Must Have | 5 | CF-EPIC-7 | Implements file ingestion receiver and format validator |
| **US019** | Deterministic document text and tabular extraction | Must Have | 5 | CF-EPIC-7 | Builds `pdfplumber` text/table extraction with OCR fallback |
| **US020** | Grammar-guided SLM course feature extraction | Must Have | 5 | CF-EPIC-8 | Implements Qwen 2.5 + Instructor schema-constrained extraction |
| **US021** | Natural-language prerequisite to recursive AST parsing | Must Have | 5 | CF-EPIC-8 | Synthesizes boolean AST JSON trees from syllabus text |
| **US022** | Split-screen document review with confidence scores | Must Have | 8 | CF-EPIC-9 | Computes field-level extraction confidence scores |
| **US023** | One-click database commit of extracted course data | Must Have | 5 | CF-EPIC-9 | Writes verified extraction data atomically to PostgreSQL |

---

## 3. Granular Jira Tasks & Engineering Roadmap

| Ticket Key | Task Summary | Story Points | Target Epic | Assigned |
| :--- | :--- | :--- | :--- | :--- |
| [ ] **CF-231** | Deterministic PDF Text & Tabular Extraction Pipeline | 5 SP | CF-EPIC-7 | Anuththara |
| [ ] **CF-232** | Local SLM Integration & Ollama Client Architecture | 5 SP | CF-EPIC-8 | Anuththara |
| [ ] **CF-233** | Grammar-Guided Structured Extraction with Instructor & Pydantic | 5 SP | CF-EPIC-8 | Anuththara |
| [ ] **CF-234** | Natural-Language Prerequisite to Recursive AST Synthesizer | 5 SP | CF-EPIC-8 | Anuththara |
| [ ] **CF-235** | Extraction Job Persistence & Database Ingestion Service | 3 SP | CF-EPIC-9 | Anuththara |

```
┌────────────────────────────────────────────────────────────────────────┐
│ CF-231: Deterministic PDF Text & Tabular Extraction Pipeline (5 SP)    │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
┌───────────────────────────────────▼────────────────────────────────────┐
│ CF-232: Local SLM Integration & Ollama Client Architecture (5 SP)      │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
┌───────────────────────────────────▼────────────────────────────────────┐
│ CF-233: Grammar-Guided Extraction with Instructor & Pydantic (5 SP)     │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
┌───────────────────────────────────▼────────────────────────────────────┐
│ CF-234: Natural-Language Prerequisite to Recursive AST Synthesizer (5SP│
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
┌───────────────────────────────────▼────────────────────────────────────┐
│ CF-235: Extraction Job Persistence & Database Ingestion Service (3 SP) │
└────────────────────────────────────────────────────────────────────────┘
```

---

### CF-231: Deterministic PDF Text & Tabular Extraction Pipeline (5 SP)
* **Description:** Build the primary text and table extraction engine using `pdfplumber` to extract syllabus body text and contact hour tables, with OCR fallback for scanned pages.
* **Target Files:**
  - `backend/app/services/pdf_parser.py`
  - `backend/app/services/ocr_service.py`
  - `backend/tests/test_pdf_parser.py`
* **Implementation Details:**
  1. Initialize `pdfplumber` document loader extracting pages, text layout, and embedded tables.
  2. Implement table boundary detection targeting academic contact hours tables (`Lectures`, `Tutorials`, `Labs/Practical`, `Total Hours`).
  3. Extract document sections: Course Code, Course Title, Prerequisites string, Corequisites, Course Objectives, and Syllabus topics.
  4. OCR Fallback: If extracted text character density is $< 50\text{ characters/page}$ (indicating a scanned image), pass page images to `pytesseract` or `DocTR` for optical character recognition.
  5. Text cleaner utility: Strip running headers, page numbers, and university disclaimers.
  6. Define a structured `ExtractionError` in `backend/app/services/pdf_parser.py`, raised for corrupted or unparseable documents so they never surface as HTTP 500s. CF-204 turns it into a `FAILED` extraction job with a readable message, and Ishani's fixture suite (CF-223, `backend/tests/test_pdf_fixtures.py`) asserts on it. `backend/tests/test_pdf_parser.py` stays yours (unit tests); CF-223 uses a separate file.
* **Acceptance Criteria:** Successfully extracts raw syllabus text and tabular contact hours from university PDF handbooks; scanned pages automatically trigger OCR fallback.

---

### CF-232: Local SLM Integration & Ollama Client Architecture (5 SP)
* **Description:** Build the backend client service interfacing with the containerized Ollama instance running Qwen 2.5 7B-Instruct.
* **Target Files:**
  - `backend/app/services/llm_client.py`
  - `backend/app/core/config.py`
  - `backend/tests/test_llm_client.py`
* **Implementation Details:**
  1. Configure Ollama async HTTP client connecting to `settings.OLLAMA_BASE_URL` (default: `http://localhost:11434` or `http://ollama:11434`).
  2. Health check endpoint wrapper verifying model availability (`qwen2.5:7b-instruct`).
  3. Formulate domain-optimized system prompt:
     - Instructs model on engineering curriculum domain rules (course codes, credit bounds, contact hour conventions).
     - Provides few-shot exemplars mapping syllabus excerpts to structured outputs.
  4. Telemetry logging: Track token usage, prompt evaluation latency, and generation speed ($tokens/sec$).
  5. Test seam: expose the client through a factory / FastAPI dependency (`get_llm_client()`) returning a small `Protocol`, so Ishani's CF-222 suite can replace it with a deterministic mock through `app.dependency_overrides`, with no network or GPU.
  6. Settings: add `OLLAMA_BASE_URL` and `OLLAMA_MODEL` (default `qwen2.5:7b-instruct`) to `Settings` in `app/core/config.py` and to `.env.example`. Inside Docker Compose the URL is `http://ollama:11434` (Ishani's CF-221 passes it to the backend service).
* **Acceptance Criteria:** Service successfully sends prompt payloads to Ollama and receives responses with $< 3\text{s}$ first-token latency on local hardware.

---

### CF-233: Grammar-Guided Structured Extraction with Instructor & Pydantic (5 SP)
* **Description:** Integrate `instructor` with Ollama to enforce strict Pydantic model decoding, guaranteeing syntactically valid JSON responses and calculating field-level confidence scores.
* **Target Files:**
  - `backend/app/services/extractor.py`
  - `backend/app/schemas/extraction.py`
  - `backend/tests/test_extractor.py`
* **Implementation Details:**
  1. Define extraction DTOs (this file, `schemas/extraction.py`, is owned by CF-233; Didula's CF-204 job API models live in `schemas/extraction_jobs.py` so the two do not collide). Extracted values must map one-to-one onto the admin course contract implemented in CF-202 (`CourseUpdate`):
     - `ExtractedCourseMetadata`: `code`, `title`, `description`, `totalCredits` (1 to 12), `durationSemesters`, `courseType` (committed as `type`: `CORE`, `ELECTIVE`, `LAB`, `CAPSTONE`), `offeredSemesters` (`FALL`, `SPRING`, `BOTH`).
     - `ExtractedContactHours`: produce the catalog's `ContactHours` shape (`lecture`, `lab`, `tutorial`) in **hours per semester**, as in the seeded data (e.g. 14 / 14 / 7). If a syllabus states weekly hours, convert and lower the field's confidence. A `totalSemesterHours` value is informational only.
     - `ExtractedCreditDistribution`: `semesterIndex`, `creditsAllocated`. Must have one entry per semester starting at the recommended semester and sum to `totalCredits` (the same `check_distribution` rule CF-202 enforces).
  2. Configure `instructor.from_openai` (or `instructor.from_ollama`) with structured JSON mode.
  3. Multi-Semester Detection:
     - Detect year-long modules (e.g. "Final Year Project spanning terms 7 and 8 with 6 total credits").
     - Automatically formulate `creditDistribution` array allocating split credits evenly (3 cr + 3 cr).
  4. Confidence score estimation:
     - Cross-validate extracted fields against regex patterns (e.g. import `COURSE_CODE_PATTERN` from `app/schemas/curriculum.py`, currently `^[A-Z]{2,4}[0-9]{3,5}[A-Z]?$`, so extraction and the catalog accept the same codes).
     - Assign confidence scores ($0.0 - 1.0$) per field to power frontend review badges.
* **Acceptance Criteria:** Extracted output strictly adheres to Pydantic models; multi-semester courses are automatically detected; confidence scores are generated for each extracted field.

---

### CF-234: Natural-Language Prerequisite to Recursive AST Synthesizer (5 SP)
* **Description:** Implement an AI-assisted parser translating complex natural-language prerequisite clauses into recursive boolean AST JSON structures.
* **Target Files:**
  - `backend/app/services/ast_synthesizer.py`
  - `backend/app/schemas/curriculum.py`
  - `backend/tests/test_ast_synthesizer.py`
* **Implementation Details:**
  1. Extract prerequisite text chunk from syllabus (e.g. *"Students must have passed CO221 and either CO222 or CO223, and earned at least 40 credits"*).
  2. Specialized extraction prompt with `instructor` mapping text directly into `PrerequisiteRule` union (`LogicalRuleNode`, `CourseRuleNode`, `CreditThresholdRuleNode`).
  3. AST Post-Processor:
     - Sanitize course codes: Strip whitespace, ensure standard uppercase formatting.
     - Validate course pointers against catalog: Check if referenced course IDs exist in known degree datasets.
     - Tree simplifier: Flatten single-child `AND`/`OR` gates and eliminate redundant tautologies.
     - Structural limits: output must satisfy the rules the admin API enforces in CF-203 (depth <= 20, only `AND` / `OR` / `COURSE` / `CREDIT_THRESHOLD`, no course referencing itself). Reuse the CF-203 validator once it is merged instead of re-implementing it.
* **Acceptance Criteria:** Natural language prerequisite strings are converted into valid, recursive `PrerequisiteRule` trees matching TypeScript contracts.

---

### CF-235: Extraction Job Persistence & Database Ingestion Service (3 SP)
* **Description:** Design database models for tracking extraction jobs, create Alembic migrations, and implement the atomic ingestion service writing verified course data into PostgreSQL.
* **Target Files:**
  - `backend/app/models/extraction.py`
  - `backend/alembic/versions/0003_extraction_jobs_table.py`
  - `backend/app/services/ingestion_service.py`
  - `backend/tests/test_ingestion_service.py`
* **Implementation Details:**
  1. Define SQLAlchemy `ExtractionJob` model:
     - `id`: UUID Primary Key.
     - `filename`: Source document name.
     - `file_hash`: SHA256 checksum for deduplication.
     - `status`: Enum (`PENDING`, `PROCESSING`, `EXTRACTED`, `COMMITTED`, `FAILED`). These names are the single source of truth for the whole sprint (CF-204 API, CF-214/215 UI and CF-222 tests all use them): `PENDING` -> `PROCESSING` -> `EXTRACTED` (ready for review) -> `COMMITTED`, or `FAILED` (with an error message) from any processing step.
     - `extracted_data`: JSONB containing extracted course schema.
     - `confidence_scores`: JSONB containing field-level confidence ratings.
     - `created_at`, `updated_at`: Timestamps.
  2. Generate and test Alembic migration `0003_extraction_jobs_table.py`. Revision `0002_course_updated_at` already exists (CF-202), so set `down_revision = "0002_course_updated_at"`; two heads would break `alembic upgrade head` (`backend/tests/test_migrations.py` fails on that). Import the new model in `backend/app/models/__init__.py` so Alembic and the test fixtures see the table.
  3. Ingestion Service (called by Didula's `POST /api/v1/extraction/jobs/{job_id}/commit`, which handles auth, job-state checks and HTTP errors):
     - Atomically upserts course entity into `courses` table.
     - Upserts associated `credit_distributions` records.
     - Updates `prerequisite_rule` JSONB tree **and** the `prerequisite_rules` table row (the seeder keeps both in sync).
     - Applies the same rules as the admin editor: credits 1 to 12, semester window, distribution consistency (reuse `check_distribution` and the helpers in `app/services/course_service.py`), and sets `updated_at`.
     - Wraps operation in a single database transaction (`db.commit()` / `db.rollback()`) and moves the job to `COMMITTED`.
     - Note: 32 course IDs exist in both the CE and EE catalogs and the database has one row per ID, so an upsert on a shared ID changes it for both programs.
* **Acceptance Criteria:** Database migration runs cleanly; extraction jobs persist in database; approved course data is atomically committed with zero partial-write anomalies.

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

