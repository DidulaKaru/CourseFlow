"""CF-225: the database layer on a real PostgreSQL engine.

Every other database test runs on in-memory SQLite, which cannot show whether native ``JSONB`` columns,
the ``ON DELETE SET NULL`` foreign key or the Alembic revisions behave on the engine production uses. These
tests do, in a throwaway database of their own. They are skipped unless ``CF_TEST_POSTGRES_URL`` points at a
server (the CI ``postgres`` job sets it), e.g.::

    CF_TEST_POSTGRES_URL=postgresql://postgres:postgres@localhost:5432/postgres pytest backend/tests/test_postgres_integration.py
"""

import os
import subprocess
import sys
import uuid
from collections.abc import Generator
from pathlib import Path

import pytest
from app.models.curriculum import Course, DegreeProgram
from app.models.extraction import ExtractionJob as ExtractionJobRecord
from app.schemas.extraction_jobs import ExtractionCommitRequest
from app.services import extraction_service
from scripts.seed_db import seed_database
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.engine import Engine, make_url
from sqlalchemy.orm import Session, sessionmaker

SERVER_URL = os.environ.get("CF_TEST_POSTGRES_URL", "")
BACKEND_DIR = Path(__file__).resolve().parent.parent

pytestmark = pytest.mark.skipif(not SERVER_URL, reason="CF_TEST_POSTGRES_URL is not set (no PostgreSQL server)")

JSONB_COLUMNS = {
    "courses": ["prerequisite_rule", "corequisites", "offered_semesters", "syllabus_objectives", "contact_hours"],
    "extraction_jobs": ["extracted_data", "confidence_scores"],
}


def alembic(database_url: str, *args: str) -> str:
    """Run the alembic CLI in a subprocess against ``database_url`` and return its output."""
    result = subprocess.run(
        [sys.executable, "-m", "alembic", *args],
        cwd=BACKEND_DIR,
        env={**os.environ, "DATABASE_URL": database_url},
        capture_output=True,
        text=True,
        timeout=180,
        check=False,
    )
    assert result.returncode == 0, result.stdout + result.stderr
    return result.stdout + result.stderr


@pytest.fixture
def database_url() -> Generator[str, None, None]:
    """An empty database created for one test and dropped afterwards."""
    name = f"cf_it_{uuid.uuid4().hex[:10]}"
    server = create_engine(SERVER_URL, isolation_level="AUTOCOMMIT")
    with server.connect() as connection:
        connection.execute(text(f'CREATE DATABASE "{name}"'))
    try:
        yield make_url(SERVER_URL).set(database=name).render_as_string(hide_password=False)
    finally:
        with server.connect() as connection:
            connection.execute(text(f'DROP DATABASE IF EXISTS "{name}" WITH (FORCE)'))
        server.dispose()


@pytest.fixture
def engine(database_url: str) -> Generator[Engine, None, None]:
    alembic(database_url, "upgrade", "head")
    created = create_engine(database_url)
    try:
        yield created
    finally:
        created.dispose()


@pytest.fixture
def db(engine: Engine) -> Generator[Session, None, None]:
    with sessionmaker(bind=engine, autoflush=False)() as session:
        yield session


def column_types(engine: Engine, table: str) -> dict[str, str]:
    query = text(
        "SELECT column_name, data_type FROM information_schema.columns "
        "WHERE table_schema = 'public' AND table_name = :table"
    )
    with engine.connect() as connection:
        return {name: kind for name, kind in connection.execute(query, {"table": table})}


# ==========================================
# Migrations
# ==========================================


def test_migrations_upgrade_to_head_and_create_the_expected_tables(engine: Engine):
    tables = set(inspect(engine).get_table_names())

    assert {"degree_programs", "courses", "extraction_jobs", "alembic_version"} <= tables
    assert "updated_at" in column_types(engine, "courses")  # Migration 0002.
    assert "committed_course_id" in column_types(engine, "extraction_jobs")  # Migration 0003.


def test_json_columns_are_native_jsonb_not_text(engine: Engine):
    for table, columns in JSONB_COLUMNS.items():
        types = column_types(engine, table)
        for column in columns:
            assert types[column] == "jsonb", f"{table}.{column} is {types[column]}"


def test_every_revision_downgrades_to_empty_and_upgrades_again(database_url: str):
    alembic(database_url, "upgrade", "head")

    alembic(database_url, "downgrade", "base")
    engine = create_engine(database_url)
    try:
        assert inspect(engine).get_table_names() == ["alembic_version"]
    finally:
        engine.dispose()

    alembic(database_url, "upgrade", "head")
    assert "0003_extraction_jobs_table" in alembic(database_url, "current")


# ==========================================
# JSONB and constraints on the real engine
# ==========================================


def test_seeded_catalog_round_trips_prerequisite_rules_through_jsonb(db: Session):
    seed_database(db)

    courses = db.query(Course).all()
    assert {program.id for program in db.query(DegreeProgram)} >= {"computer-eng", "electrical-eng"}
    ruled = [course for course in courses if course.prerequisite_rule]
    assert ruled, "the seeded catalogs must contain prerequisite rules"
    for course in ruled:
        assert isinstance(course.prerequisite_rule, dict)
        assert course.prerequisite_rule["type"] in {"COURSE", "AND", "OR", "CREDIT_THRESHOLD"}

    # JSONB containment is native PostgreSQL behaviour that SQLite cannot evaluate.
    nested = db.execute(text("""SELECT count(*) FROM courses WHERE prerequisite_rule @> '{"type": "AND"}'::jsonb""")).scalar()
    assert nested == sum(1 for course in ruled if course.prerequisite_rule["type"] == "AND")
    kinds = db.execute(text("SELECT DISTINCT jsonb_typeof(corequisites) FROM courses")).scalars().all()
    assert kinds == ["array"]


def test_extraction_commit_writes_the_course_and_links_the_job(db: Session):
    seed_database(db)
    prerequisite = db.query(Course).filter(Course.id.like("EE%")).order_by(Course.id).first()
    assert prerequisite is not None
    job = ExtractionJobRecord(
        id=str(uuid.uuid4()),
        filename="EE5999.pdf",
        content_type="application/pdf",
        file_hash="a" * 64,
        status="EXTRACTED",
        extracted_data={"code": "EE5999", "totalCredits": 3, "nested": {"scores": [0.9, 0.8]}},
        confidence_scores={"code": 0.98},
    )
    db.add(job)
    db.commit()
    rule = {"type": "COURSE", "courseId": prerequisite.id}
    review = ExtractionCommitRequest.model_validate(
        {
            "programId": "electrical-eng",
            "code": "EE5999",
            "title": "Power Electronics Studio",
            "description": "Design and test switching converters.",
            "totalCredits": 3,
            "recommendedSemester": 8,
            "type": "ELECTIVE",
            "offeredSemesters": ["FALL"],
            "contactHours": {"lecture": 28, "lab": 14, "tutorial": 0},
            "prerequisiteRule": rule,
        }
    )

    result = extraction_service.commit_job(db, job.id, review)

    assert result.job.status.value == "COMMITTED"
    db.expire_all()
    stored = db.get(ExtractionJobRecord, job.id)
    assert stored is not None
    assert stored.extracted_data == {"code": "EE5999", "totalCredits": 3, "nested": {"scores": [0.9, 0.8]}}
    assert stored.committed_course_id == "EE5999"
    course = db.get(Course, "EE5999")
    assert course is not None
    assert course.prerequisite_rule == rule


def test_deleting_a_committed_course_clears_the_job_link_instead_of_failing(db: Session):
    seed_database(db)
    course = db.query(Course).order_by(Course.id).first()
    assert course is not None
    job = ExtractionJobRecord(
        id=str(uuid.uuid4()),
        filename="x.pdf",
        content_type="application/pdf",
        file_hash="b" * 64,
        status="COMMITTED",
        committed_course_id=course.id,
    )
    db.add(job)
    db.commit()

    db.execute(text("UPDATE courses SET prerequisite_rule = NULL"))  # Nothing may block the delete below.
    db.execute(text("DELETE FROM courses WHERE id = :id"), {"id": course.id})
    db.commit()

    db.expire_all()
    reloaded = db.get(ExtractionJobRecord, job.id)
    assert reloaded is not None
    assert reloaded.committed_course_id is None
