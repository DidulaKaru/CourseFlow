"""MIS extraction job orchestration (CF-204).

Owns the job lifecycle behind the extraction endpoints: validating uploads, SHA256 deduplication,
running the extraction pipeline in the background and committing a reviewed course atomically.

The pipeline is a seam: ``get_extraction_pipeline`` is a FastAPI dependency returning anything that
satisfies ``ExtractionPipeline``. Until the parser and SLM extractor (CF-231 to CF-234) are wired in,
it returns ``UnavailablePipeline``, so uploads are accepted and their jobs end ``FAILED`` with a clear message.
Tests replace it through ``app.dependency_overrides``.
"""

import hashlib
import logging
from datetime import UTC, datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, sessionmaker

from app.models.extraction import ExtractionJob as ExtractionJobRecord
from app.schemas.extraction_jobs import (
    ExtractionCommitRequest,
    ExtractionCommitResult,
    ExtractionJob,
    ExtractionJobStatus,
)
from app.services import course_service
from app.services.extraction_contract import (
    DOCX_CONTENT_TYPE,
    PDF_CONTENT_TYPE,
    ExtractionError,
    ExtractionPipeline,
    ExtractionResult,
)

logger = logging.getLogger(__name__)

MAX_UPLOAD_BYTES = 15 * 1024 * 1024
# The declared MIME type must agree with the file's leading bytes (a DOCX is a ZIP container).
_FILE_SIGNATURES = {PDF_CONTENT_TYPE: b"%PDF-", DOCX_CONTENT_TYPE: b"PK\x03\x04"}
_MAX_FILENAME_LENGTH = 255
# A PENDING/PROCESSING job untouched this long lost its worker (restart, serverless freeze); re-uploading retries it.
STALE_JOB_AFTER = timedelta(minutes=15)


# ==========================================
# Extraction pipeline seam
# ==========================================


class UnavailablePipeline:
    """Default until the CF-231 to CF-234 extraction pipeline is integrated."""

    def extract(self, document: bytes, *, filename: str, content_type: str) -> ExtractionResult:
        raise ExtractionError("Automatic extraction is not available on this server yet.")


def get_extraction_pipeline() -> ExtractionPipeline:
    """FastAPI dependency providing the extraction pipeline."""
    return UnavailablePipeline()


# ==========================================
# Errors
# ==========================================


class ExtractionJobError(Exception):
    """Base class for expected, client-facing extraction job errors."""


class UnsupportedDocumentError(ExtractionJobError):
    """The upload is not a PDF or DOCX document."""


class DocumentTooLargeError(ExtractionJobError):
    """The upload exceeds ``MAX_UPLOAD_BYTES``."""


class JobNotFoundError(ExtractionJobError):
    """No extraction job has the requested ID."""


class JobStateError(ExtractionJobError):
    """The job is not in a state that allows the requested action."""


# ==========================================
# Helpers
# ==========================================


def to_extraction_job(job: ExtractionJobRecord) -> ExtractionJob:
    """Convert an ORM job row into the API contract."""
    return ExtractionJob(
        job_id=job.id,
        filename=job.filename,
        content_type=job.content_type,
        file_hash=job.file_hash,
        status=ExtractionJobStatus(job.status),
        extracted_data=job.extracted_data,
        confidence_scores=job.confidence_scores,
        error_message=job.error_message,
        committed_course_id=job.committed_course_id,
        created_at=job.created_at,
        updated_at=job.updated_at,
    )


def validate_document(document: bytes, content_type: str | None) -> str:
    """Return the normalized MIME type of a valid upload, or raise why it cannot be accepted."""
    media_type = (content_type or "").split(";", 1)[0].strip().lower()
    signature = _FILE_SIGNATURES.get(media_type)
    if signature is None:
        raise UnsupportedDocumentError("Only PDF or DOCX documents can be uploaded.")
    if len(document) > MAX_UPLOAD_BYTES:
        raise DocumentTooLargeError(f"Documents must be {MAX_UPLOAD_BYTES // (1024 * 1024)} MB or smaller.")
    if not document.startswith(signature):
        kind = "PDF" if media_type == PDF_CONTENT_TYPE else "DOCX"
        raise UnsupportedDocumentError(f"The file is not a valid {kind} document.")
    return media_type


def _display_filename(filename: str | None) -> str:
    """Keep only the base name a browser sent (some include a client path)."""
    name = (filename or "").replace("\\", "/").rsplit("/", 1)[-1].strip()
    return name[:_MAX_FILENAME_LENGTH] or "document"


def _is_retryable(job: ExtractionJobRecord) -> bool:
    if job.status == ExtractionJobStatus.FAILED.value:
        return True
    if job.status not in (ExtractionJobStatus.PENDING.value, ExtractionJobStatus.PROCESSING.value):
        return False
    # SQLite returns naive timestamps; every stored timestamp is UTC.
    touched = job.updated_at if job.updated_at.tzinfo else job.updated_at.replace(tzinfo=UTC)
    return datetime.now(UTC) - touched > STALE_JOB_AFTER


def _get_job(db: Session, job_id: str, *, for_update: bool = False) -> ExtractionJobRecord:
    query = select(ExtractionJobRecord).where(ExtractionJobRecord.id == job_id)
    job = db.scalar(query.with_for_update() if for_update else query)
    if job is None:
        raise JobNotFoundError(f"Extraction job '{job_id}' was not found.")
    return job


# ==========================================
# Public service API
# ==========================================


def submit_document(
    db: Session, document: bytes, filename: str | None, content_type: str | None
) -> tuple[ExtractionJob, bool]:
    """Register an upload as a PENDING job; return it and whether it still needs processing.

    Identical bytes reuse their existing job (no reprocessing) unless that job FAILED or stalled
    (see ``STALE_JOB_AFTER``), in which case the same job is reset to PENDING and tried again.
    """
    media_type = validate_document(document, content_type)
    file_hash = hashlib.sha256(document).hexdigest()

    job = db.scalar(select(ExtractionJobRecord).where(ExtractionJobRecord.file_hash == file_hash))
    if job is not None and not _is_retryable(job):
        return to_extraction_job(job), False
    if job is None:
        job = ExtractionJobRecord(file_hash=file_hash)
        db.add(job)
    job.filename = _display_filename(filename)
    job.content_type = media_type
    job.status = ExtractionJobStatus.PENDING.value
    job.extracted_data = None
    job.confidence_scores = None
    job.error_message = None
    job.updated_at = func.now()

    try:
        db.commit()
    except IntegrityError:
        # A concurrent upload of the same bytes won the unique file_hash race; answer with its job.
        db.rollback()
        existing = db.scalar(select(ExtractionJobRecord).where(ExtractionJobRecord.file_hash == file_hash))
        if existing is None:
            raise
        return to_extraction_job(existing), False
    db.refresh(job)
    return to_extraction_job(job), True


def process_job(
    session_factory: sessionmaker, job_id: str, document: bytes, pipeline: ExtractionPipeline
) -> None:
    """Run the pipeline for a PENDING job (as a background task) and record EXTRACTED or FAILED."""
    with session_factory() as db:
        job = db.scalar(select(ExtractionJobRecord).where(ExtractionJobRecord.id == job_id).with_for_update())
        if job is None or job.status != ExtractionJobStatus.PENDING.value:
            return
        job.status = ExtractionJobStatus.PROCESSING.value
        job.updated_at = func.now()
        db.commit()

        try:
            result = pipeline.extract(document, filename=job.filename, content_type=job.content_type)
        except ExtractionError as error:
            job.status = ExtractionJobStatus.FAILED.value
            job.error_message = str(error) or "The document could not be processed."
        except Exception:
            logger.exception("Extraction pipeline crashed for job %s", job_id)
            job.status = ExtractionJobStatus.FAILED.value
            job.error_message = "Extraction failed unexpectedly. Try uploading the document again."
        else:
            job.status = ExtractionJobStatus.EXTRACTED.value
            job.extracted_data = result.extracted_data
            job.confidence_scores = result.confidence_scores
        job.updated_at = func.now()
        db.commit()


def get_job(db: Session, job_id: str) -> ExtractionJob:
    """Return one extraction job."""
    return to_extraction_job(_get_job(db, job_id))


def commit_job(db: Session, job_id: str, review: ExtractionCommitRequest) -> ExtractionCommitResult:
    """Write the reviewed course and mark the job COMMITTED in a single transaction.

    Raises ``course_service.CourseServiceError`` when the reviewed course breaks a catalog rule;
    nothing is written in that case and the job stays EXTRACTED.
    """
    job = _get_job(db, job_id, for_update=True)
    if job.status == ExtractionJobStatus.COMMITTED.value:
        raise JobStateError("This extraction job has already been committed.")
    if job.status != ExtractionJobStatus.EXTRACTED.value:
        raise JobStateError(
            f"Only jobs that are ready for review (EXTRACTED) can be committed; this job is {job.status}."
        )

    try:
        course = course_service.stage_reviewed_course(db, review, review.prerequisite_rule)
        job.status = ExtractionJobStatus.COMMITTED.value
        job.committed_course_id = course.id
        job.updated_at = func.now()
        db.commit()
    except IntegrityError:
        db.rollback()
        raise course_service.CourseConflictError("The change conflicts with existing course data.") from None
    except Exception:
        db.rollback()
        raise
    db.refresh(course)
    db.refresh(job)
    return ExtractionCommitResult(job=to_extraction_job(job), course=course_service.to_admin_course(course))
