"""Tests for atomic ingestion of reviewed extractions (CF-235): upsert, synchronization and no partial writes."""

from collections.abc import Callable
from typing import Any

import pytest
from app.models.curriculum import Course, CreditDistribution, DegreeProgram
from app.models.curriculum import PrerequisiteRule as PrerequisiteRuleRecord
from app.models.extraction import ExtractionJob
from app.schemas.extraction_jobs import ExtractionCommitRequest
from app.services import course_service, extraction_service
from app.services.course_service import (
    CourseConflictError,
    CourseNotFoundError,
    CourseServiceError,
    CourseValidationError,
    RuleValidationError,
)
from app.services.extraction_contract import PDF_CONTENT_TYPE
from app.services.ingestion_service import ingest_reviewed_course
from scripts.seed_db import seed_database
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError, OperationalError
from sqlalchemy.orm import Session

Snapshot = dict[str, Any]


@pytest.fixture
def seeded(db_session: Session) -> Session:
    """Both real catalogs (CE and EE) loaded into the test database."""
    seed_database(db_session)
    return db_session


@pytest.fixture
def job(seeded: Session) -> ExtractionJob:
    """An extraction waiting for review."""
    record = ExtractionJob(
        filename="mis.pdf",
        content_type=PDF_CONTENT_TYPE,
        file_hash="c" * 64,
        status="EXTRACTED",
        extracted_data={"code": "EE5999", "prerequisiteRule": {"type": "COURSE", "courseId": "EE2201"}},
        confidence_scores={"code": 0.98, "prerequisiteRule": 0.95},
    )
    seeded.add(record)
    seeded.commit()
    return record


def review(**overrides: Any) -> ExtractionCommitRequest:
    values: dict[str, Any] = {
        "programId": "electrical-eng",
        "code": "EE5999",
        "title": "Power Electronics Studio",
        "totalCredits": 3,
        "recommendedSemester": 5,
        "type": "ELECTIVE",
        "offeredSemesters": ["FALL"],
        "contactHours": {"lecture": 28, "lab": 14, "tutorial": 0},
        "prerequisiteRule": {"type": "COURSE", "courseId": "EE2201"},
    }
    return ExtractionCommitRequest.model_validate({**values, **overrides})


def review_of(course: Course, program_id: str, **overrides: Any) -> ExtractionCommitRequest:
    """A review that keeps an existing course as stored, apart from ``overrides``."""
    return review(
        **{
            "programId": program_id,
            "code": course.code,
            "title": course.title,
            "totalCredits": course.total_credits,
            "durationSemesters": course.duration_semesters,
            "recommendedSemester": course.recommended_semester,
            "type": course.type,
            "prerequisiteRule": course.prerequisite_rule,
            **overrides,
        }
    )


def snapshot(db: Session) -> Snapshot:
    """Everything a commit may touch, read fresh from the database."""
    db.expire_all()
    return {
        "courses": {
            c.id: (c.title, c.description, c.total_credits, c.prerequisite_rule, c.contact_hours)
            for c in db.scalars(select(Course))
        },
        "distributions": sorted(
            (row.course_id, row.semester_index, row.credits_allocated) for row in db.scalars(select(CreditDistribution))
        ),
        "rules": {r.course_id: r.expression for r in db.scalars(select(PrerequisiteRuleRecord))},
        "programs": {p.id: sorted(c.id for c in p.courses) for p in db.scalars(select(DegreeProgram))},
        "jobs": {j.id: (j.status, j.committed_course_id) for j in db.scalars(select(ExtractionJob))},
    }


def existing_course(db: Session, program_id: str, matches: Callable[[Course], bool]) -> Course:
    program = db.get(DegreeProgram, program_id)
    assert program is not None
    return next(course for course in program.courses if matches(course))


# ==========================================
# Job persistence
# ==========================================


def test_extraction_jobs_persist_their_json_documents(seeded: Session, job: ExtractionJob):
    seeded.expire_all()
    stored = seeded.get(ExtractionJob, job.id)
    assert stored is not None
    assert stored.extracted_data["prerequisiteRule"] == {"type": "COURSE", "courseId": "EE2201"}
    assert stored.confidence_scores == {"code": 0.98, "prerequisiteRule": 0.95}
    assert stored.created_at is not None and stored.updated_at is not None


def test_one_job_per_document_hash(seeded: Session, job: ExtractionJob):
    seeded.add(ExtractionJob(filename="copy.pdf", content_type=PDF_CONTENT_TYPE, file_hash="c" * 64, status="PENDING"))
    with pytest.raises(IntegrityError):
        seeded.commit()
    seeded.rollback()


# ==========================================
# Upsert
# ==========================================


def test_a_new_ee_course_is_written_with_its_distribution_rule_and_job(seeded: Session, job: ExtractionJob):
    ingest_reviewed_course(seeded, job, review())

    after = snapshot(seeded)
    assert after["courses"]["EE5999"][0] == "Power Electronics Studio"
    assert [row for row in after["distributions"] if row[0] == "EE5999"] == [("EE5999", 5, 3)]
    assert after["courses"]["EE5999"][3] == after["rules"]["EE5999"] == {"type": "COURSE", "courseId": "EE2201"}
    assert "EE5999" in after["programs"]["electrical-eng"]
    assert "EE5999" not in after["programs"]["computer-eng"]
    assert after["jobs"][job.id] == ("COMMITTED", "EE5999")
    assert seeded.get(Course, "EE5999").updated_at is not None


def test_a_new_ce_capstone_is_written_with_its_credit_split(seeded: Session, job: ExtractionJob):
    split = [{"semesterIndex": 7, "creditsAllocated": 3}, {"semesterIndex": 8, "creditsAllocated": 3}]
    ingest_reviewed_course(
        seeded,
        job,
        review(programId="computer-eng", code="CE7999", totalCredits=6, durationSemesters=2, recommendedSemester=7,
               type="CAPSTONE", creditDistribution=split),
    )
    rows = [row for row in snapshot(seeded)["distributions"] if row[0] == "CE7999"]
    assert rows == [("CE7999", 7, 3), ("CE7999", 8, 3)]


def test_an_existing_ce_course_is_replaced_in_place(seeded: Session, job: ExtractionJob):
    before = snapshot(seeded)
    course = existing_course(seeded, "computer-eng", lambda c: c.duration_semesters == 1 and bool(c.prerequisite_rule))
    new_rule = {"type": "AND", "children": [course.prerequisite_rule, {"type": "CREDIT_THRESHOLD", "minCredits": 30}]}

    ingest_reviewed_course(
        seeded, job, review_of(course, "computer-eng", description="From the 2026 MIS.", prerequisiteRule=new_rule)
    )

    after = snapshot(seeded)
    assert after["courses"].keys() == before["courses"].keys(), "an upsert must not add a course"
    assert after["courses"][course.id][1] == "From the 2026 MIS."
    assert after["courses"][course.id][3] == after["rules"][course.id] == new_rule
    untouched = before["courses"].keys() - {course.id}
    assert all(after["courses"][other] == before["courses"][other] for other in untouched)


def test_clearing_a_rule_removes_it_from_both_places(seeded: Session, job: ExtractionJob):
    course = existing_course(seeded, "electrical-eng", lambda c: c.duration_semesters == 1 and bool(c.prerequisite_rule))
    ingest_reviewed_course(seeded, job, review_of(course, "electrical-eng", prerequisiteRule=None))
    after = snapshot(seeded)
    assert after["courses"][course.id][3] is None
    assert course.id not in after["rules"]


def test_rescheduling_a_course_leaves_no_stale_distribution_rows(seeded: Session, job: ExtractionJob):
    course = existing_course(seeded, "computer-eng", lambda c: c.duration_semesters == 2)
    ingest_reviewed_course(seeded, job, review_of(course, "computer-eng", durationSemesters=1))
    rows = [row for row in snapshot(seeded)["distributions"] if row[0] == course.id]
    assert rows == [(course.id, course.recommended_semester, course.total_credits)]


def test_a_shared_course_changes_for_every_program_that_owns_it(seeded: Session, job: ExtractionJob):
    """The catalog stores one row per course ID; 32 IDs belong to both programs."""
    shared = existing_course(
        seeded, "computer-eng", lambda c: len(c.programs) == 2 and c.duration_semesters == 1
    )
    ingest_reviewed_course(seeded, job, review_of(shared, "computer-eng", title="Reviewed shared title"))
    seeded.expire_all()
    for program_id in ("computer-eng", "electrical-eng"):
        assert existing_course(seeded, program_id, lambda c: c.id == shared.id).title == "Reviewed shared title"


# ==========================================
# No partial writes
# ==========================================


@pytest.mark.parametrize(
    ("overrides", "error"),
    [
        ({"programId": "civil-eng"}, CourseNotFoundError),
        ({"recommendedSemester": 8, "durationSemesters": 2}, CourseValidationError),
        ({"creditDistribution": [{"semesterIndex": 5, "creditsAllocated": 2}]}, CourseValidationError),
        ({"totalCredits": 6, "durationSemesters": 2}, CourseValidationError),
        ({"corequisites": ["XX0000"]}, CourseValidationError),
        ({"prerequisiteRule": {"type": "COURSE", "courseId": "XX0000"}}, RuleValidationError),
        ({"prerequisiteRule": {"type": "COURSE", "courseId": "EE5999"}}, RuleValidationError),
        ({"prerequisiteRule": {"type": "OR", "children": []}}, RuleValidationError),
    ],
    ids=["unknown-program", "beyond-program", "split-mismatch", "missing-split", "unknown-corequisite",
         "unknown-prerequisite", "self-prerequisite", "empty-gate"],
)
def test_a_course_that_breaks_a_catalog_rule_writes_nothing(
    overrides: dict[str, Any], error: type[CourseServiceError], seeded: Session, job: ExtractionJob
):
    before = snapshot(seeded)
    with pytest.raises(error):
        ingest_reviewed_course(seeded, job, review(**overrides))
    assert snapshot(seeded) == before


def test_a_rule_that_closes_a_cycle_writes_nothing(seeded: Session, job: ExtractionJob):
    dependent = existing_course(
        seeded, "electrical-eng", lambda c: bool(c.prerequisite_rule) and c.prerequisite_rule["type"] == "COURSE"
    )
    upstream = seeded.get(Course, dependent.prerequisite_rule["courseId"])
    before = snapshot(seeded)
    with pytest.raises(CourseValidationError, match="circular"):
        ingest_reviewed_course(
            seeded,
            job,
            review_of(upstream, "electrical-eng", prerequisiteRule={"type": "COURSE", "courseId": dependent.id}),
        )
    assert snapshot(seeded) == before


def test_a_crash_after_the_course_is_staged_writes_nothing(
    seeded: Session, job: ExtractionJob, monkeypatch: pytest.MonkeyPatch
):
    def crash(db: Session, *_args: Any) -> None:
        db.flush()  # The course row has really been sent to the database by now.
        raise RuntimeError("power loss")

    monkeypatch.setattr(course_service, "_write_prerequisite_rule", crash)
    before = snapshot(seeded)
    with pytest.raises(RuntimeError, match="power loss"):
        ingest_reviewed_course(seeded, job, review())
    assert snapshot(seeded) == before


@pytest.mark.parametrize(
    ("raised", "expected"),
    [
        (IntegrityError("INSERT", {}, Exception("duplicate key")), CourseConflictError),
        (OperationalError("COMMIT", {}, Exception("connection lost")), OperationalError),
    ],
    ids=["integrity", "connection-lost"],
)
def test_a_failed_database_commit_writes_nothing(
    raised: Exception, expected: type[Exception], seeded: Session, job: ExtractionJob, monkeypatch: pytest.MonkeyPatch
):
    before = snapshot(seeded)

    def fail() -> None:
        seeded.flush()
        raise raised

    with monkeypatch.context() as patch:
        patch.setattr(seeded, "commit", fail)
        with pytest.raises(expected):
            ingest_reviewed_course(seeded, job, review())
    assert snapshot(seeded) == before


def test_a_failed_commit_can_be_corrected_and_retried(seeded: Session, job: ExtractionJob):
    with pytest.raises(CourseServiceError):
        extraction_service.commit_job(seeded, job.id, review(corequisites=["XX0000"]))
    result = extraction_service.commit_job(seeded, job.id, review())
    assert result.job.status.value == "COMMITTED"
    assert result.course.id == "EE5999"
    assert seeded.scalar(select(func.count()).select_from(Course).where(Course.id == "EE5999")) == 1
