"""CF-225 regression: committing an extraction must write the course before the job that points at it.

``extraction_jobs.committed_course_id`` is a foreign key to ``courses.id``. The application session runs with
``autoflush=False`` and the job has no ORM relationship to the course, so without an explicit flush SQLAlchemy sent
``UPDATE extraction_jobs`` before ``INSERT INTO courses``. PostgreSQL rejected that, so every commit of a *new*
course code failed as a "conflict". SQLite ignores foreign keys unless asked, which is why every other test
passed. This test asks, so the bug is caught on the default SQLite run as well as on PostgreSQL.
"""

import uuid
from collections.abc import Generator

import pytest
from app.core.database import Base
from app.models.curriculum import Course
from app.models.extraction import ExtractionJob as ExtractionJobRecord
from app.schemas.extraction_jobs import ExtractionCommitRequest
from app.services import extraction_service
from scripts.seed_db import seed_database
from sqlalchemy import create_engine, event
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool


@pytest.fixture
def enforcing_session() -> Generator[Session, None, None]:
    """In-memory SQLite that enforces foreign keys, with the same autoflush=False setting as the app."""
    import app.models  # noqa: F401  (registers every table on Base.metadata)

    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)

    @event.listens_for(engine, "connect")
    def enforce_foreign_keys(connection, _record):
        connection.execute("PRAGMA foreign_keys=ON")

    Base.metadata.create_all(bind=engine)
    with sessionmaker(autocommit=False, autoflush=False, bind=engine)() as session:
        yield session
    engine.dispose()


def review(code: str, **overrides: object) -> ExtractionCommitRequest:
    body: dict[str, object] = {
        "programId": "electrical-eng",
        "code": code,
        "title": "Power Electronics Studio",
        "description": "Design and test switching converters.",
        "totalCredits": 3,
        "recommendedSemester": 8,
        "type": "ELECTIVE",
        "offeredSemesters": ["FALL"],
        "contactHours": {"lecture": 28, "lab": 14, "tutorial": 0},
        "prerequisiteRule": None,
    }
    body.update(overrides)
    return ExtractionCommitRequest.model_validate(body)


def extracted_job(db: Session) -> str:
    job = ExtractionJobRecord(
        id=str(uuid.uuid4()),
        filename="syllabus.pdf",
        content_type="application/pdf",
        file_hash=uuid.uuid4().hex * 2,
        status="EXTRACTED",
        extracted_data={"code": "EE5999"},
        confidence_scores={"code": 0.9},
    )
    db.add(job)
    db.commit()
    return job.id


def test_new_course_is_inserted_before_the_job_that_references_it(enforcing_session: Session):
    db = enforcing_session
    seed_database(db)
    job_id = extracted_job(db)

    result = extraction_service.commit_job(db, job_id, review("EE5999"))

    assert result.job.status.value == "COMMITTED"
    assert result.job.committed_course_id == "EE5999"
    db.expire_all()
    assert db.get(Course, "EE5999") is not None
    stored = db.get(ExtractionJobRecord, job_id)
    assert stored is not None
    assert stored.committed_course_id == "EE5999"


def test_replacing_an_existing_course_still_commits_with_foreign_keys_enforced(enforcing_session: Session):
    db = enforcing_session
    seed_database(db)
    existing = db.query(Course).filter(Course.id.like("EE%")).order_by(Course.id).first()
    assert existing is not None
    job_id = extracted_job(db)

    result = extraction_service.commit_job(
        db, job_id, review(existing.id, title="Renamed By Reviewer", recommendedSemester=existing.recommended_semester)
    )

    assert result.course.title == "Renamed By Reviewer"
    assert result.job.committed_course_id == existing.id
