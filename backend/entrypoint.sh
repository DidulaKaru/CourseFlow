#!/bin/sh
set -e

echo "[STARTUP] Waiting for database readiness and running Alembic migrations..."
alembic upgrade head || true

echo "[STARTUP] Seeding database with engineering degree curricula..."
python scripts/seed_db.py || true

echo "[STARTUP] Launching CourseFlow FastAPI application server..."
exec python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
