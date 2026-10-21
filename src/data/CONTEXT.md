# Curriculum Data Store
- Contains validated curriculum JSON datasets in `programs/`:
  - `computer_engineering.json`: Complete 8-semester Computer Engineering curriculum.
  - `electrical_engineering.json`: Complete 8-semester Electrical Engineering curriculum.
- Component mock: `mock_course.json` serves as the Day-1 mock for independent UI development.
- Referencing Rule: Every course code referenced in a prerequisite rule AST must exist as an independent node in the catalog.
- Integrity: Validated at build time and ingested into PostgreSQL via `backend/scripts/seed_db.py`.
