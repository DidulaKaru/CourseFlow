# Curriculum Data Store
- Contains validated curriculum JSON datasets in `programs/`:
  - `computer_engineering.json`: Complete 8-semester Computer Engineering curriculum.
  - `electrical_engineering.json`: Complete 8-semester Electrical Engineering curriculum.
- Component mock: `mock_course.json` serves as the Day-1 mock for independent UI development.
- Referencing Rule: Every course code referenced in a prerequisite rule AST must exist as an independent node in the catalog.
- Integrity: Validated at build time and ingested into PostgreSQL via `backend/scripts/seed_db.py`.
- Sprint 2 note: the PostgreSQL copy of these catalogs can now be edited through the admin API (`PUT`/`PATCH /api/v1/courses/{id}`), but the student UI and `GET /programs` still read these JSON files, so admin edits are not visible to students until the read path moves to the database.
- Shared IDs: 32 course IDs appear in both programs (17 differ only in `description`); the database stores one row per ID, so the seeder is last-writer-wins (Electrical Engineering overwrites Computer Engineering).
