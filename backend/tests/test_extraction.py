"""Tests for the MIS extraction job API and service (CF-204): upload validation, deduplication,
background processing and atomic commit."""

from collections.abc import Generator
from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
from app.main import app
from app.models.curriculum import Course, DegreeProgram
from app.models.curriculum import PrerequisiteRule as PrerequisiteRuleRecord
from app.models.extraction import ExtractionJob as ExtractionJobRecord
from app.services import extraction_service
from app.services.extraction_service import (
    DOCX_CONTENT_TYPE,
    MAX_UPLOAD_BYTES,
    PDF_CONTENT_TYPE,
    ExtractionError,
    ExtractionResult,
    get_extraction_pipeline,
)
from fastapi.testclient import TestClient
from scripts.seed_db import seed_database
from sqlalchemy.orm import Session, sessionmaker

UPLOAD_URL = "/api/v1/extraction/upload"
JOB_URL = "/api/v1/extraction/jobs/{}"
COMMIT_URL = "/api/v1/extraction/jobs/{}/commit"

PDF_BYTES = b"%PDF-1.7\n% CF-204 syllabus fixture\n"
DOCX_BYTES = b"PK\x03\x04 CF-204 docx fixture"

EXTRACTED = {"code": "EE5999", "title": "Power Electronics Studio", "totalCredits": 3}
SCORES = {"code": 0.98, "title": 0.91, "totalCredits": 0.6}


class FakePipeline:
    """Deterministic stand-in for the CF-231 to CF-234 pipeline."""

    def __init__(self) -> None:
        self.calls: list[tuple[bytes, str, str]] = []
        self.failure: Exception | None = None
        self.scores: dict[str, float] = SCORES

    def extract(self, document: bytes, *, filename: str, content_type: str) -> ExtractionResult:
        self.calls.append((document, filename, content_type))
        if self.failure is not None:
            raise self.failure
        return ExtractionResult(extracted_data=EXTRACTED, confidence_scores=self.scores)


@pytest.fixture
def pipeline() -> Generator[FakePipeline, None, None]:
    fake = FakePipeline()
    app.dependency_overrides[get_extraction_pipeline] = lambda: fake
    try:
        yield fake
    finally:
        app.dependency_overrides.pop(get_extraction_pipeline, None)


@pytest.fixture
def seeded(db_session: Session) -> Session:
    """Both real catalogs (CE and EE) loaded into the test database."""
    seed_database(db_session)
    return db_session


def upload(
    client: TestClient,
    headers: dict[str, str],
    content: bytes = PDF_BYTES,
    content_type: str = PDF_CONTENT_TYPE,
    filename: str = "EE5999_MIS.pdf",
) -> Any:
    return client.post(UPLOAD_URL, files={"file": (filename, content, content_type)}, headers=headers)


def extracted_job(client: TestClient, headers: dict[str, str], content: bytes = PDF_BYTES) -> str:
    """Upload a document through the fake pipeline and return its (now EXTRACTED) job ID."""
    response = upload(client, headers, content)
    assert response.status_code == 202, response.text
    job_id = response.json()["data"]["jobId"]
    assert client.get(JOB_URL.format(job_id), headers=headers).json()["data"]["status"] == "EXTRACTED"
    return job_id


def review_payload(**overrides: Any) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "programId": "electrical-eng",
        "code": "EE5999",
        "title": "Power Electronics Studio",
        "description": "Design and test switching converters.",
        "totalCredits": 3,
        "recommendedSemester": 5,
        "type": "ELECTIVE",
        "offeredSemesters": ["FALL"],
        "contactHours": {"lecture": 28, "lab": 14, "tutorial": 0},
        "prerequisiteRule": None,
    }
    payload.update(overrides)
    return payload


def program_course_ids(db: Session, program_id: str) -> set[str]:
    program = db.get(DegreeProgram, program_id)
    assert program is not None
    return {course.id for course in program.courses}


def reload_job(db: Session, job_id: str) -> ExtractionJobRecord:
    db.expire_all()
    job = db.get(ExtractionJobRecord, job_id)
    assert job is not None
    return job


# ==========================================
# Access control
# ==========================================


def test_every_extraction_route_rejects_anonymous_requests(db_client: TestClient, pipeline: FakePipeline):
    assert upload(db_client, {}).status_code == 401
    assert db_client.get(JOB_URL.format("any")).status_code == 401
    assert db_client.post(COMMIT_URL.format("any"), json=review_payload()).status_code == 401
    assert pipeline.calls == []


@pytest.mark.parametrize("role_headers", ["admin_headers", "reviewer_headers"])
def test_admin_and_reviewer_can_upload_and_poll(
    role_headers: str, request: pytest.FixtureRequest, db_client: TestClient, pipeline: FakePipeline
):
    headers = request.getfixturevalue(role_headers)

    response = upload(db_client, headers)

    assert response.status_code == 202
    job = response.json()["data"]
    assert response.json()["success"] is True
    assert job["status"] == "PENDING"
    assert job["filename"] == "EE5999_MIS.pdf"
    assert job["contentType"] == PDF_CONTENT_TYPE
    polled = db_client.get(JOB_URL.format(job["jobId"]), headers=headers).json()["data"]
    assert polled["status"] == "EXTRACTED"
    assert polled["extractedData"] == EXTRACTED
    assert polled["confidenceScores"] == SCORES
    assert polled["errorMessage"] is None
    assert pipeline.calls == [(PDF_BYTES, "EE5999_MIS.pdf", PDF_CONTENT_TYPE)]


def test_unknown_job_returns_404(db_client: TestClient, admin_headers: dict[str, str]):
    response = db_client.get(JOB_URL.format("00000000-0000-0000-0000-000000000000"), headers=admin_headers)
    assert response.status_code == 404


# ==========================================
# Upload validation and deduplication
# ==========================================


def test_identical_bytes_return_the_existing_job_without_reprocessing(
    db_client: TestClient, admin_headers: dict[str, str], reviewer_headers: dict[str, str], pipeline: FakePipeline
):
    first = upload(db_client, admin_headers, filename="first.pdf")
    second = upload(db_client, reviewer_headers, filename="renamed-copy.pdf")

    assert second.status_code == 200
    assert second.json()["data"]["jobId"] == first.json()["data"]["jobId"]
    assert second.json()["data"]["status"] == "EXTRACTED"
    assert second.json()["data"]["filename"] == "first.pdf"
    assert len(pipeline.calls) == 1


def test_different_documents_get_separate_jobs(
    db_client: TestClient, admin_headers: dict[str, str], pipeline: FakePipeline
):
    first = upload(db_client, admin_headers)
    second = upload(db_client, admin_headers, content=PDF_BYTES + b"revised")
    assert second.status_code == 202
    assert first.json()["data"]["jobId"] != second.json()["data"]["jobId"]
    assert first.json()["data"]["fileHash"] != second.json()["data"]["fileHash"]


def test_docx_upload_is_accepted(db_client: TestClient, admin_headers: dict[str, str], pipeline: FakePipeline):
    response = upload(db_client, admin_headers, DOCX_BYTES, DOCX_CONTENT_TYPE, "CO5999.docx")
    assert response.status_code == 202
    assert pipeline.calls[0][2] == DOCX_CONTENT_TYPE


@pytest.mark.parametrize(
    ("content", "content_type"),
    [
        (b"plain text syllabus", "text/plain"),
        (PDF_BYTES, "application/octet-stream"),
        (b"<html>not a pdf</html>", PDF_CONTENT_TYPE),
        (PDF_BYTES, DOCX_CONTENT_TYPE),
        (b"", PDF_CONTENT_TYPE),
    ],
    ids=["text", "octet-stream", "fake-pdf", "pdf-labelled-docx", "empty"],
)
def test_unsupported_documents_are_rejected_with_400(
    content: bytes, content_type: str, db_client: TestClient, admin_headers: dict[str, str],
    pipeline: FakePipeline, db_session: Session,
):
    response = upload(db_client, admin_headers, content, content_type)
    assert response.status_code == 400
    assert isinstance(response.json()["detail"], str)
    assert db_session.query(ExtractionJobRecord).count() == 0
    assert pipeline.calls == []


def test_documents_over_15_mb_are_rejected_with_413(
    db_client: TestClient, admin_headers: dict[str, str], pipeline: FakePipeline, db_session: Session
):
    oversized = PDF_BYTES + b"0" * (MAX_UPLOAD_BYTES + 1 - len(PDF_BYTES))
    response = upload(db_client, admin_headers, oversized)
    assert response.status_code == 413
    assert db_session.query(ExtractionJobRecord).count() == 0


def test_a_document_of_exactly_15_mb_is_accepted(
    db_client: TestClient, admin_headers: dict[str, str], pipeline: FakePipeline
):
    at_limit = PDF_BYTES + b"0" * (MAX_UPLOAD_BYTES - len(PDF_BYTES))
    assert upload(db_client, admin_headers, at_limit).status_code == 202


def test_client_paths_are_stripped_from_the_filename(
    db_client: TestClient, admin_headers: dict[str, str], pipeline: FakePipeline
):
    response = upload(db_client, admin_headers, filename="C:\\Users\\faculty\\Desktop\\EE5999.pdf")
    assert response.json()["data"]["filename"] == "EE5999.pdf"


# ==========================================
# Background processing outcomes
# ==========================================


def test_extraction_error_marks_the_job_failed_with_its_message(
    db_client: TestClient, admin_headers: dict[str, str], pipeline: FakePipeline
):
    pipeline.failure = ExtractionError("The PDF is password protected.")
    job_id = upload(db_client, admin_headers).json()["data"]["jobId"]

    job = db_client.get(JOB_URL.format(job_id), headers=admin_headers).json()["data"]
    assert job["status"] == "FAILED"
    assert job["errorMessage"] == "The PDF is password protected."
    assert job["extractedData"] is None


def test_unexpected_pipeline_crash_marks_the_job_failed_not_500(
    db_client: TestClient, admin_headers: dict[str, str], pipeline: FakePipeline
):
    pipeline.failure = RuntimeError("Ollama connection reset")
    job_id = upload(db_client, admin_headers).json()["data"]["jobId"]

    job = db_client.get(JOB_URL.format(job_id), headers=admin_headers).json()["data"]
    assert job["status"] == "FAILED"
    assert "Ollama" not in job["errorMessage"]


def test_out_of_range_confidence_scores_fail_the_job(
    db_client: TestClient, admin_headers: dict[str, str], pipeline: FakePipeline
):
    pipeline.scores = {"code": 1.5}
    job_id = upload(db_client, admin_headers).json()["data"]["jobId"]
    assert db_client.get(JOB_URL.format(job_id), headers=admin_headers).json()["data"]["status"] == "FAILED"


def test_default_pipeline_fails_jobs_until_extraction_is_integrated(
    db_client: TestClient, admin_headers: dict[str, str]
):
    job_id = upload(db_client, admin_headers).json()["data"]["jobId"]
    job = db_client.get(JOB_URL.format(job_id), headers=admin_headers).json()["data"]
    assert job["status"] == "FAILED"
    assert "not available" in job["errorMessage"]


def test_reuploading_a_failed_document_retries_the_same_job(
    db_client: TestClient, admin_headers: dict[str, str], pipeline: FakePipeline
):
    pipeline.failure = ExtractionError("Temporary parser outage.")
    job_id = upload(db_client, admin_headers).json()["data"]["jobId"]

    pipeline.failure = None
    retry = upload(db_client, admin_headers)

    assert retry.status_code == 202
    assert retry.json()["data"]["jobId"] == job_id
    assert retry.json()["data"]["status"] == "PENDING"
    job = db_client.get(JOB_URL.format(job_id), headers=admin_headers).json()["data"]
    assert job["status"] == "EXTRACTED"
    assert job["errorMessage"] is None
    assert len(pipeline.calls) == 2


@pytest.mark.parametrize("stalled_status", ["PENDING", "PROCESSING"])
def test_reuploading_a_stalled_job_retries_it(
    stalled_status: str, db_client: TestClient, admin_headers: dict[str, str], pipeline: FakePipeline,
    db_session: Session,
):
    """A job whose background worker died must not block its document forever."""
    job_id = upload(db_client, admin_headers).json()["data"]["jobId"]
    job = reload_job(db_session, job_id)
    job.status = stalled_status
    job.updated_at = datetime.now(UTC) - extraction_service.STALE_JOB_AFTER - timedelta(minutes=1)
    db_session.commit()

    retry = upload(db_client, admin_headers)

    assert retry.status_code == 202
    assert retry.json()["data"]["jobId"] == job_id
    assert db_client.get(JOB_URL.format(job_id), headers=admin_headers).json()["data"]["status"] == "EXTRACTED"
    assert len(pipeline.calls) == 2


def test_reuploading_a_job_still_processing_returns_it_unchanged(
    db_client: TestClient, admin_headers: dict[str, str], pipeline: FakePipeline, db_session: Session
):
    job_id = upload(db_client, admin_headers).json()["data"]["jobId"]
    job = reload_job(db_session, job_id)
    job.status = "PROCESSING"
    db_session.commit()

    again = upload(db_client, admin_headers)

    assert again.status_code == 200
    assert again.json()["data"]["status"] == "PROCESSING"
    assert len(pipeline.calls) == 1


def test_process_job_ignores_jobs_that_are_not_pending(session_factory: sessionmaker, db_session: Session):
    """A duplicate background run must not reprocess (or un-commit) a job."""
    job = ExtractionJobRecord(
        filename="done.pdf", content_type=PDF_CONTENT_TYPE, file_hash="a" * 64, status="COMMITTED"
    )
    db_session.add(job)
    db_session.commit()
    fake = FakePipeline()

    extraction_service.process_job(session_factory, job.id, PDF_BYTES, fake)

    assert fake.calls == []
    assert reload_job(db_session, job.id).status == "COMMITTED"


# ==========================================
# Atomic commit
# ==========================================


def test_commit_creates_a_new_ee_course_with_its_prerequisite_rule(
    seeded: Session, db_client: TestClient, reviewer_headers: dict[str, str], pipeline: FakePipeline
):
    prerequisite = min(program_course_ids(seeded, "electrical-eng"))
    rule = {"type": "COURSE", "courseId": prerequisite}
    job_id = extracted_job(db_client, reviewer_headers)

    response = db_client.post(
        COMMIT_URL.format(job_id), json=review_payload(prerequisiteRule=rule), headers=reviewer_headers
    )

    assert response.status_code == 200, response.text
    data = response.json()["data"]
    assert data["job"]["status"] == "COMMITTED"
    assert data["job"]["committedCourseId"] == "EE5999"
    assert data["course"]["prerequisiteRule"] == rule
    assert data["course"]["creditDistribution"] == [{"semesterIndex": 5, "creditsAllocated": 3}]
    seeded.expire_all()
    course = seeded.get(Course, "EE5999")
    assert course is not None
    assert course.prerequisite_rule == rule
    assert course.prerequisite_rule_record.expression == rule
    assert "EE5999" in program_course_ids(seeded, "electrical-eng")
    assert "EE5999" not in program_course_ids(seeded, "computer-eng")


def test_commit_replaces_an_existing_ce_course(
    seeded: Session, db_client: TestClient, admin_headers: dict[str, str], pipeline: FakePipeline
):
    existing = next(
        c for c in seeded.get(DegreeProgram, "computer-eng").courses
        if c.duration_semesters == 1 and c.prerequisite_rule
    )
    payload = review_payload(
        programId="computer-eng",
        code=existing.code,
        title=existing.title,
        totalCredits=existing.total_credits,
        recommendedSemester=existing.recommended_semester,
        type=existing.type,
        description="Reviewed description from the 2026 MIS.",
        prerequisiteRule=None,
    )
    job_id = extracted_job(db_client, admin_headers)

    response = db_client.post(COMMIT_URL.format(job_id), json=payload, headers=admin_headers)

    assert response.status_code == 200, response.text
    seeded.expire_all()
    course = seeded.get(Course, existing.id)
    assert course.description == "Reviewed description from the 2026 MIS."
    assert course.prerequisite_rule is None
    assert seeded.query(PrerequisiteRuleRecord).filter_by(course_id=existing.id).count() == 0


def test_commit_is_atomic_when_the_prerequisite_rule_is_invalid(
    seeded: Session, db_client: TestClient, admin_headers: dict[str, str], pipeline: FakePipeline
):
    job_id = extracted_job(db_client, admin_headers)
    payload = review_payload(prerequisiteRule={"type": "COURSE", "courseId": "XX0000"})

    response = db_client.post(COMMIT_URL.format(job_id), json=payload, headers=admin_headers)

    assert response.status_code == 422
    assert response.json()["detail"][0]["loc"] == ["body", "prerequisiteRule", "courseId"]
    assert seeded.get(Course, "EE5999") is None
    assert reload_job(seeded, job_id).status == "EXTRACTED"


def test_failed_commit_leaves_an_existing_course_untouched(
    seeded: Session, db_client: TestClient, admin_headers: dict[str, str], pipeline: FakePipeline
):
    existing = next(c for c in seeded.get(DegreeProgram, "computer-eng").courses if c.duration_semesters == 1)
    original_description, original_rule = existing.description, existing.prerequisite_rule
    payload = review_payload(
        programId="computer-eng",
        code=existing.code,
        title=existing.title,
        totalCredits=existing.total_credits,
        recommendedSemester=existing.recommended_semester,
        type=existing.type,
        description="This edit must be rolled back.",
        prerequisiteRule={"type": "COURSE", "courseId": "XX0000"},
    )
    job_id = extracted_job(db_client, admin_headers)

    response = db_client.post(COMMIT_URL.format(job_id), json=payload, headers=admin_headers)

    assert response.status_code == 422
    seeded.expire_all()
    course = seeded.get(Course, existing.id)
    assert course.description == original_description
    assert course.prerequisite_rule == original_rule
    assert reload_job(seeded, job_id).status == "EXTRACTED"


def test_commit_rejects_a_self_referencing_rule_at_its_leaf(
    seeded: Session, db_client: TestClient, admin_headers: dict[str, str], pipeline: FakePipeline
):
    job_id = extracted_job(db_client, admin_headers)
    rule = {"type": "AND", "children": [{"type": "CREDIT_THRESHOLD", "minCredits": 30},
                                        {"type": "COURSE", "courseId": "EE5999"}]}

    response = db_client.post(COMMIT_URL.format(job_id), json=review_payload(prerequisiteRule=rule), headers=admin_headers)

    assert response.status_code == 422
    assert response.json()["detail"][0]["loc"] == ["body", "prerequisiteRule", "children", 1, "courseId"]
    assert seeded.get(Course, "EE5999") is None


def test_commit_applies_the_course_credit_distribution_rules(
    seeded: Session, db_client: TestClient, admin_headers: dict[str, str], pipeline: FakePipeline
):
    job_id = extracted_job(db_client, admin_headers)
    payload = review_payload(
        totalCredits=6, durationSemesters=2, recommendedSemester=7, type="CAPSTONE",
        creditDistribution=[{"semesterIndex": 7, "creditsAllocated": 3}, {"semesterIndex": 8, "creditsAllocated": 2}],
    )

    response = db_client.post(COMMIT_URL.format(job_id), json=payload, headers=admin_headers)

    assert response.status_code == 422
    assert response.json()["detail"][0]["loc"] == ["body", "creditDistribution"]
    assert reload_job(seeded, job_id).status == "EXTRACTED"


def test_commit_accepts_a_valid_multi_semester_split(
    seeded: Session, db_client: TestClient, admin_headers: dict[str, str], pipeline: FakePipeline
):
    job_id = extracted_job(db_client, admin_headers)
    split = [{"semesterIndex": 7, "creditsAllocated": 3}, {"semesterIndex": 8, "creditsAllocated": 3}]
    payload = review_payload(
        totalCredits=6, durationSemesters=2, recommendedSemester=7, type="CAPSTONE", creditDistribution=split
    )

    response = db_client.post(COMMIT_URL.format(job_id), json=payload, headers=admin_headers)

    assert response.status_code == 200, response.text
    assert response.json()["data"]["course"]["creditDistribution"] == split


def test_commit_rejects_an_existing_course_from_another_program(
    seeded: Session, db_client: TestClient, admin_headers: dict[str, str], pipeline: FakePipeline
):
    ce_only = min(program_course_ids(seeded, "computer-eng") - program_course_ids(seeded, "electrical-eng"))
    job_id = extracted_job(db_client, admin_headers)

    response = db_client.post(COMMIT_URL.format(job_id), json=review_payload(code=ce_only), headers=admin_headers)

    assert response.status_code == 409
    assert reload_job(seeded, job_id).status == "EXTRACTED"


def test_commit_with_unknown_program_returns_404(
    seeded: Session, db_client: TestClient, admin_headers: dict[str, str], pipeline: FakePipeline
):
    job_id = extracted_job(db_client, admin_headers)
    response = db_client.post(COMMIT_URL.format(job_id), json=review_payload(programId="civil-eng"), headers=admin_headers)
    assert response.status_code == 404


def test_commit_rejects_unknown_fields(
    seeded: Session, db_client: TestClient, admin_headers: dict[str, str], pipeline: FakePipeline
):
    job_id = extracted_job(db_client, admin_headers)
    response = db_client.post(COMMIT_URL.format(job_id), json=review_payload(confidence=0.9), headers=admin_headers)
    assert response.status_code == 422


def test_committing_twice_returns_409(
    seeded: Session, db_client: TestClient, admin_headers: dict[str, str], pipeline: FakePipeline
):
    job_id = extracted_job(db_client, admin_headers)
    assert db_client.post(COMMIT_URL.format(job_id), json=review_payload(), headers=admin_headers).status_code == 200

    again = db_client.post(COMMIT_URL.format(job_id), json=review_payload(), headers=admin_headers)

    assert again.status_code == 409
    assert "already been committed" in again.json()["detail"]


@pytest.mark.parametrize("status", ["PENDING", "PROCESSING", "FAILED"])
def test_only_extracted_jobs_can_be_committed(
    status: str, seeded: Session, db_client: TestClient, admin_headers: dict[str, str]
):
    job = ExtractionJobRecord(filename="x.pdf", content_type=PDF_CONTENT_TYPE, file_hash="b" * 64, status=status)
    seeded.add(job)
    seeded.commit()

    response = db_client.post(COMMIT_URL.format(job.id), json=review_payload(), headers=admin_headers)

    assert response.status_code == 409
    assert seeded.get(Course, "EE5999") is None


def test_commit_unknown_job_returns_404(seeded: Session, db_client: TestClient, admin_headers: dict[str, str]):
    response = db_client.post(COMMIT_URL.format("missing"), json=review_payload(), headers=admin_headers)
    assert response.status_code == 404
