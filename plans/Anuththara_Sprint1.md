# Sprint 1 Implementation Plan: Anuththara (Database & AI Engineering)

**Role:** Database & AI Engineer  
**Sprint Focus:** PostgreSQL Relational Modeling, Alembic Migrations, Curriculum JSON Data Transcription for 2 Degrees, and Database Seeding  
**Target Milestone:** Sprint 1 Delivery (Zero-Login Student Web App for 2 Degree Programs)

---

## 1. Responsibilities & Domain Ownership
Anuththara is responsible for data modeling, curriculum dataset integrity, and database infrastructure. In Sprint 1, responsibilities encompass:
- Designing and implementing PostgreSQL database tables using SQLAlchemy / SQLModel matching canonical schemas.
- Configuring Alembic for reproducible schema versioning and database migrations.
- Researching and transcribing complete curriculum datasets for the initial 2 degree programs:
  1. **Computer Engineering** (`computer_engineering.json`)
  2. **Electrical Engineering** (`electrical_engineering.json`)
- Ensuring every prerequisite rule represents a valid AST boolean structure and referencing existing course IDs.
- Creating the automated database seed script (`seed_db.py`) to ingest JSON datasets into PostgreSQL.
- Laying the foundation for pgvector extension enablement and Sprint 2 MIS document ingestion.

---

## 2. Phase-by-Phase Execution Roadmap

```
┌────────────────────────────────────────────────────────────────────────┐
│ Phase 1: Database Modeling & SQLAlchemy Schemas                        │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
┌───────────────────────────────────▼────────────────────────────────────┐
│ Phase 2: Alembic Migrations Configuration                              │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
┌───────────────────────────────────▼────────────────────────────────────┐
│ Phase 3: Computer Engineering Curriculum Transcription                 │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
┌───────────────────────────────────▼────────────────────────────────────┐
│ Phase 4: Electrical Engineering Curriculum Transcription               │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
┌───────────────────────────────────▼────────────────────────────────────┐
│ Phase 5: Automated Database Seed Script (`seed_db.py`)                 │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
┌───────────────────────────────────▼────────────────────────────────────┐
│ Phase 6: Data Integrity Verification & pgvector Initialization         │
└────────────────────────────────────────────────────────────────────────┘
```

---

### Phase 1: Database Modeling & SQLAlchemy Schemas
* **Goal:** Create persistent relational tables that accurately reflect the curriculum data structures.
* **Target Files:**
  - `backend/app/models/curriculum.py`
  - `backend/app/models/__init__.py`
* **Tables to Define:**
  1. `DegreeProgram`:
     - `id` (VARCHAR PK, e.g., `'computer-eng'`)
     - `name` (VARCHAR, e.g., `'Computer Engineering'`)
     - `department` (VARCHAR)
     - `total_credits_required` (INTEGER, default 150)
     - `min_credits_per_semester` (INTEGER, default 18)
     - `max_credits_per_semester` (INTEGER, default 24)
     - `semesters_count` (INTEGER, default 8)
  2. `Course`:
     - `id` (VARCHAR PK, e.g., `'CO544'`)
     - `code` (VARCHAR)
     - `title` (VARCHAR)
     - `description` (TEXT)
     - `total_credits` (INTEGER)
     - `duration_semesters` (INTEGER, 1 or 2)
     - `recommended_semester` (INTEGER, 1 to 8)
     - `type` (VARCHAR: `'CORE'`, `'ELECTIVE'`, `'LAB'`, `'CAPSTONE'`)
     - `prerequisite_rule` (JSONB - stores the AST tree natively)
     - `corequisites` (ARRAY of VARCHAR / JSONB)
     - `offered_semesters` (ARRAY of VARCHAR)
     - `degree_program_id` (VARCHAR FK -> `degree_programs.id`)
  3. `CreditDistribution`:
     - `id` (INTEGER PK AUTOINCREMENT)
     - `course_id` (VARCHAR FK -> `courses.id`)
     - `semester_index` (INTEGER, 1 to 8)
     - `credits_allocated` (INTEGER)
* **Verification:** Python syntax passes; SQLAlchemy metadata compiles without circular foreign key errors.

---

### Phase 2: Alembic Migrations Configuration
* **Goal:** Establish version-controlled schema migrations for local development and CI environments.
* **Target Files:**
  - `backend/alembic.ini`
  - `backend/alembic/env.py`
  - `backend/alembic/versions/`
* **Tasks:**
  1. Initialize Alembic environment in `backend/alembic`.
  2. Connect `target_metadata = Base.metadata` in `backend/alembic/env.py`.
  3. Generate initial migration script:
     ```powershell
     alembic revision --autogenerate -m "create_initial_curriculum_tables"
     ```
  4. Test upgrade and downgrade commands:
     ```powershell
     alembic upgrade head
     alembic downgrade -1
     ```
* **Verification:** Tables are created in PostgreSQL with matching column data types.

---

### Phase 3: Computer Engineering Curriculum Transcription
* **Goal:** Assemble the authoritative, complete 8-semester curriculum for Computer Engineering.
* **Target Files:**
  - `src/data/programs/computer_engineering.json`
* **Data Requirements:**
  - Cover Semesters 1 through 8 (Foundation, Core, Technical Electives, General Electives).
  - Include multi-semester capstone project (e.g., Final Year Project with 3 credits in Sem 7 and 3 credits in Sem 8).
  - Convert prerequisite sentences from handbook into exact recursive AST JSON:
    - Single prerequisite: `{"type": "COURSE", "courseId": "CO221"}`
    - Conjunction: `{"type": "AND", "children": [...]}`
    - Disjunction: `{"type": "OR", "children": [...]}`
    - Credit hurdle: `{"type": "CREDIT_THRESHOLD", "minCredits": 60}`
* **Verification:** JSON conforms strictly to `DegreeProgram` schema; zero broken course references in prerequisite trees.

---

### Phase 4: Electrical Engineering Curriculum Transcription
* **Goal:** Assemble the authoritative 8-semester curriculum for Electrical Engineering.
* **Target Files:**
  - `src/data/programs/electrical_engineering.json`
* **Data Requirements:**
  - Cover Semesters 1 through 8 (Math foundation, Circuits, Signals, Electromagnetics, Power/Telecom electives, Capstone).
  - Verify prerequisite dependencies (e.g., Circuits I -> Circuits II, Signals -> DSP).
  - Ensure total credits satisfy $\ge 150$ graduation minimum with semester allocations within 18–24 credit limits.
* **Verification:** Valid JSON schema; validated by runtime schema checker.

---

### Phase 5: Automated Database Seed Script (`seed_db.py`)
* **Goal:** Create a script to populate PostgreSQL from the transcribed JSON datasets.
* **Target Files:**
  - `backend/scripts/seed_db.py`
* **Script Workflow:**
  1. Connect to PostgreSQL database using `DATABASE_URL`.
  2. Read `computer_engineering.json` and `electrical_engineering.json`.
  3. Upsert `degree_programs` records.
  4. Upsert `courses` and associated `credit_distributions`.
  5. Run a validation loop to verify that all referenced `courseId`s exist in the catalog.
* **Verification:** Running `python backend/scripts/seed_db.py` outputs "Seeding completed successfully: 2 programs, N courses inserted."

---

### Phase 6: Data Integrity Verification & pgvector Initialization
* **Goal:** Prepare the database foundation for Sprint 2/4 AI vector features.
* **Tasks:**
  1. Add SQL extension command in initial migration: `CREATE EXTENSION IF NOT EXISTS vector;`.
  2. Implement an automated data integrity script checking:
     - No dangling prerequisite pointers.
     - Sum of per-semester minimum credits $\ge 18$.
     - Total mandatory credits + available electives $\ge 150$.
  3. Prepare documentation on syllabus ingestion formats for Sprint 2 MIS document extraction.
* **Verification:** All data integrity sanity checks pass with 0 errors.

---

## 3. Definition of Done (DoD) for Sprint 1
- [ ] SQLAlchemy models created for `DegreeProgram`, `Course`, and `CreditDistribution`.
- [ ] Alembic migration applies cleanly to PostgreSQL with `pgvector` enabled.
- [ ] `computer_engineering.json` and `electrical_engineering.json` fully transcribed with valid AST prerequisite trees.
- [ ] Multi-semester courses correctly modeled with discrete `creditDistribution` arrays.
- [ ] `seed_db.py` populates PostgreSQL from JSON files without foreign key or constraint errors.
- [ ] Zero dangling course codes in prerequisite rules.
