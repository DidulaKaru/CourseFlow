# Sprint 1 Implementation Plan: Anuththara (Database & AI Engineer)

**Official Project Role:** Database & AI Engineer  
**Sprint Window:** October 12, 2026 – November 01, 2026 (3 Weeks)  
**Sprint Goal:** Ship a working, zero-login Student Web App for 2 engineering degree programs (Computer Engineering & Electrical Engineering) rendering an 8-semester swimlane DAG canvas, interactive elective selection, >= 18 semester credit checks, 150 total credit validation, multi-semester split credits, and client-side PDF plan export. Complete Docker setup, database schema foundation, and CI/CD quality gates.  
**Primary Tech Stack:** PostgreSQL, pgvector, SQLAlchemy, Alembic, pdfplumber, Ollama, Instructor  
**Total Allocated Story Points:** 21 SP  

---

## 1. Core Ownership Domains & Responsibilities

Anuththara leads database architecture, schema migrations, authoritative curriculum dataset transcription, and AI data engineering. In Sprint 1, core responsibilities encompass:
- **PostgreSQL Database Relational Modeling:** Designing and implementing database tables using SQLAlchemy matching the canonical schema specification (`degree_programs`, `courses`, `prerequisite_rules`, and `credit_distributions`).
- **Alembic Database Migration Pipeline:** Configuring Alembic for automated, reproducible schema evolution across development and CI container instances.
- **Curriculum Dataset Transcription & Validation:** Transcribing complete, authoritative 8-semester curriculum datasets for the initial 2 engineering programs:
  1. **Computer Engineering** (`computer_engineering.json`)
  2. **Electrical Engineering** (`electrical_engineering.json`)
- **AST Prerequisite Validation:** Encoding complex natural-language prerequisites into structured recursive boolean AST JSON structures with zero broken course pointers.
- **Automated Database Seeder Script:** Implementing `scripts/seed_db.py` to idempotently populate the PostgreSQL database directly from validated JSON curriculum files.
- **AI Infrastructure Groundwork:** Enabling the `pgvector` extension in PostgreSQL and preparing for Sprint 2 local Ollama runtime and Instructor grammar-guided AST extraction.

---

## 2. Epics & User Stories Mapping

### Target Epics
- **CF-EPIC-5: Database Architecture & Curriculum Data Modeling** (Epic Lead | Core Data Layer | Target: Sprint 1)

### User Stories Supported
| User Story ID | Narrative | Priority | Story Points | Target Epic | Contribution |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **US002** | Switch seamlessly between 2 initial engineering degree programs | Must Have | 3 | CF-EPIC-1 | Provides validated datasets for Computer and Electrical Engineering |
| **US003** | View curriculum as interactive DAG across 8 semester swimlanes | Must Have | 8 | CF-EPIC-1 | Models 8-semester column mappings, prerequisite trees, and offerings |
| **US007** | Select and deselect elective modules | Must Have | 5 | CF-EPIC-2 | Classifies courses into CORE vs. ELECTIVE types across all 8 terms |
| **US008** | Immediate visual warnings if prerequisites are unmet | Must Have | 5 | CF-EPIC-2 | Transcribes recursive boolean AST trees (`AND`/`OR`/`CREDIT_THRESHOLD`) |
| **US009** | Semester credit counter ($\ge 18$ credits minimum) | Must Have | 5 | CF-EPIC-2 | Provides accurate credit totals and per-semester distributions |
| **US010** | Cumulative planned credits against 150-credit graduation rule | Must Have | 3 | CF-EPIC-2 | Structures 150-credit degree requirements with complete catalogs |
| **US011** | Multi-semester spanning modules split credits across semesters | Must Have | 5 | CF-EPIC-2 | Formulates discrete `creditDistribution` arrays for capstone courses |

---

## 3. Granular Jira Tasks & Engineering Roadmap

| Ticket Key | Task Summary | Story Points | Target Epic | Assigned |
| :--- | :--- | :--- | :--- | :--- |
| **CF-131** | PostgreSQL Database Initialization & SQLAlchemy Models | 5 SP | CF-EPIC-5 | Anuththara |
| **CF-132** | Database Migration Framework (Alembic) | 3 SP | CF-EPIC-5 | Anuththara |
| **CF-133** | Curriculum Dataset Collection & Validation: Computer Engineering | 5 SP | CF-EPIC-5 | Anuththara |
| **CF-134** | Curriculum Dataset Collection & Validation: Electrical Engineering | 5 SP | CF-EPIC-5 | Anuththara |
| **CF-135** | Automated Database Seeder Script | 3 SP | CF-EPIC-5 | Anuththara |

```
┌────────────────────────────────────────────────────────────────────────┐
│ CF-131: PostgreSQL Database Initialization & SQLAlchemy Models (5 SP)   │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
┌───────────────────────────────────▼────────────────────────────────────┐
│ CF-132: Database Migration Framework (Alembic) (3 SP)                  │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
┌───────────────────────────────────▼────────────────────────────────────┐
│ CF-133: Curriculum Dataset: Computer Engineering (5 SP)                │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
┌───────────────────────────────────▼────────────────────────────────────┐
│ CF-134: Curriculum Dataset: Electrical Engineering (5 SP)              │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
┌───────────────────────────────────▼────────────────────────────────────┐
│ CF-135: Automated Database Seeder Script (3 SP)                        │
└────────────────────────────────────────────────────────────────────────┘
```

---

### CF-131: PostgreSQL Database Initialization & SQLAlchemy Models (5 SP)
* **Description:** Design relational schema: `degree_programs`, `courses`, `prerequisite_rules`, and `credit_distributions`.
* **Target Files:**
  - `backend/app/models/curriculum.py`
  - `backend/app/models/__init__.py`
* **Implementation Details:**
  1. `DegreeProgram`: `id` (VARCHAR PK), `name`, `department`, `total_credits_required` (default 150), `min_credits_per_semester` (18), `max_credits_per_semester` (24), `semesters_count` (8).
  2. `Course`: `id` (VARCHAR PK), `code` (VARCHAR UNIQUE), `title`, `description`, `total_credits`, `duration_semesters`, `recommended_semester`, `type` (`CORE`, `ELECTIVE`, `LAB`, `CAPSTONE`), `prerequisite_rule` (native `JSONB` for AST tree), `corequisites` (JSONB array), `offered_semesters` (JSONB array).
  3. `CreditDistribution`: `id` (SERIAL PK), `course_id` (FK -> `courses.id`), `semester_index`, `credits_allocated`.
  4. Enable `CREATE EXTENSION IF NOT EXISTS vector;` for pgvector readiness.
* **Acceptance Criteria:** Tables created with foreign keys, unique course code constraints, and JSONB columns for AST trees.

---

### CF-132: Database Migration Framework (Alembic) (3 SP)
* **Description:** Configure Alembic migration pipeline for automated, reproducible schema evolution.
* **Target Files:**
  - `backend/alembic.ini`
  - `backend/alembic/env.py`
  - `backend/alembic/versions/`
* **Implementation Details:**
  1. Initialize Alembic configuration pointing to `DATABASE_URL`.
  2. Import SQLAlchemy `Base.metadata` in `env.py` for automated migration generation.
  3. Generate initial migration revision: `0001_initial_curriculum_tables.py`.
  4. Validate rollback with `alembic downgrade -1` and re-apply with `alembic upgrade head`.
* **Acceptance Criteria:** `alembic upgrade head` runs cleanly from a fresh database container.

---

### CF-133: Curriculum Dataset Collection & Validation: Computer Engineering (5 SP)
* **Description:** Transcribe all 8 semesters of Computer Engineering into a validated JSON seed file and database seed script.
* **Target Files:**
  - `src/data/programs/computer_engineering.json`
* **Implementation Details:**
  1. Transcribe complete courses for Semesters 1 through 8 (Foundation, Software, Hardware, Networks, AI/ML, Electives, and Capstone).
  2. Multi-semester course modeling: Model 6-credit Final Year Project spanning Semester 7 (3 credits) and Semester 8 (3 credits) via `creditDistribution`.
  3. Prerequisite AST modeling: Convert all faculty handbook prerequisites into valid recursive boolean AST structures (`COURSE`, `AND`, `OR`, `CREDIT_THRESHOLD`).
  4. Ensure all referenced `courseId` values exist within the dataset.
* **Acceptance Criteria:** All core and elective modules, prerequisites, and credit distributions validated with zero syntax errors.

---

### CF-134: Curriculum Dataset Collection & Validation: Electrical Engineering (5 SP)
* **Description:** Transcribe all 8 semesters of Electrical Engineering into a validated JSON seed file and database seed script.
* **Target Files:**
  - `src/data/programs/electrical_engineering.json`
* **Implementation Details:**
  1. Transcribe full 8-semester sequence: Mathematics foundations, Circuit Theory, Signals & Systems, Power Systems, Telecommunications, Electives, and Capstone.
  2. Model 2-semester spanning modules with discrete credit distribution arrays.
  3. Resolve all cross-departmental prerequisites (e.g., shared mathematics, basic computing, and electronics courses).
  4. Verify total required credits $\ge 150$ with semester credit loads within 18–24 boundaries.
* **Acceptance Criteria:** Complete curriculum accurately represented; all cross-departmental prerequisites resolve.

---

### CF-135: Automated Database Seeder Script (3 SP)
* **Description:** Write `scripts/seed_db.py` populating PostgreSQL directly from validated JSON curriculum files.
* **Target Files:**
  - `backend/scripts/seed_db.py`
* **Implementation Details:**
  1. Read JSON datasets (`computer_engineering.json` and `electrical_engineering.json`).
  2. Upsert `degree_programs` records.
  3. Upsert `courses` and associated `credit_distributions`.
  4. Validate data integrity: Check for dangling prerequisite course codes and ensure idempotent execution (re-running does not duplicate rows or violate constraints).
* **Acceptance Criteria:** Script runs idempotently (safe to re-run without creating duplicate records).

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
- [ ] Static typecheck passes (`npx tsc --noEmit` and Python `ruff` / typecheck).
- [ ] PR is opened targeting `dev`, passing GitHub Actions CI checks (CourseFlow Quality Gate).
- [ ] PR is reviewed and approved by Didula (Lead Architect).
- [ ] PR is Squash Merged into `dev` and local branches are synchronized.
- [ ] Feature is validated against acceptance criteria on the live development build.
