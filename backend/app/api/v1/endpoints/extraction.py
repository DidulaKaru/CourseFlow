"""MIS document extraction endpoints (CF-204): upload, job polling and atomic commit.

Upload, review and commit are faculty work, so the whole router admits ADMIN and FACULTY_REVIEWER
sessions (``StaffUser``). Student routes stay public and never reach this router.
"""

from typing import Annotated

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    HTTPException,
    Response,
    UploadFile,
    status,
)
from sqlalchemy.orm import sessionmaker

from app.api.deps import DbSession, get_current_staff_user
from app.api.v1.endpoints.courses import course_http_error
from app.core.database import get_session_factory
from app.schemas.extraction_jobs import (
    ExtractionCommitRequest,
    ExtractionCommitResponse,
    ExtractionJobResponse,
)
from app.services import course_service, extraction_service
from app.services.extraction_service import (
    MAX_UPLOAD_BYTES,
    DocumentTooLargeError,
    ExtractionJobError,
    ExtractionPipeline,
    JobNotFoundError,
    JobStateError,
    UnsupportedDocumentError,
    get_extraction_pipeline,
)

router = APIRouter(dependencies=[Depends(get_current_staff_user)])

_AUTH_RESPONSES: dict[int | str, dict[str, str]] = {
    401: {"description": "Missing, invalid or expired token"},
    403: {"description": "Authenticated but not faculty staff"},
}


def _job_http_error(error: ExtractionJobError) -> HTTPException:
    if isinstance(error, UnsupportedDocumentError):
        return HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(error))
    if isinstance(error, DocumentTooLargeError):
        return HTTPException(status_code=413, detail=str(error))
    if isinstance(error, JobNotFoundError):
        return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(error))
    if isinstance(error, JobStateError):
        return HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(error))
    return HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(error))


def _commit_http_error(error: course_service.CourseServiceError) -> HTTPException:
    """Course rule errors, with prerequisite issues located under ``prerequisiteRule`` in the commit body."""
    if isinstance(error, course_service.RuleValidationError):
        detail = [
            {"loc": ["body", "prerequisiteRule", *issue.path], "msg": issue.message, "type": "value_error"}
            for issue in error.issues
        ]
        return HTTPException(status_code=422, detail=detail)
    return course_http_error(error)


@router.post(
    "/upload",
    response_model=ExtractionJobResponse,
    status_code=status.HTTP_202_ACCEPTED,
    responses={
        200: {"model": ExtractionJobResponse, "description": "Identical file uploaded before; its existing job"},
        400: {"description": "Not a PDF or DOCX document"},
        413: {"description": "Document larger than 15 MB"},
        **_AUTH_RESPONSES,
    },
    summary="Upload Syllabus Document",
    description=(
        "Multipart field `file`: a PDF or DOCX of at most 15 MB. A new document returns 202 with a PENDING "
        "job that is processed in the background; poll the job until it is EXTRACTED or FAILED. Identical "
        "bytes return 200 with the existing job (a FAILED job is retried instead)."
    ),
)
def upload_document(
    file: UploadFile,
    response: Response,
    background_tasks: BackgroundTasks,
    db: DbSession,
    session_factory: Annotated[sessionmaker, Depends(get_session_factory)],
    pipeline: Annotated[ExtractionPipeline, Depends(get_extraction_pipeline)],
) -> ExtractionJobResponse:
    """Register a syllabus upload and schedule its extraction."""
    document = file.file.read(MAX_UPLOAD_BYTES + 1)  # One byte over is enough to know it is too large.
    try:
        job, needs_processing = extraction_service.submit_document(db, document, file.filename, file.content_type)
    except ExtractionJobError as error:
        raise _job_http_error(error) from None
    if needs_processing:
        background_tasks.add_task(extraction_service.process_job, session_factory, job.job_id, document, pipeline)
    else:
        response.status_code = status.HTTP_200_OK
    return ExtractionJobResponse(data=job)


@router.get(
    "/jobs/{job_id}",
    response_model=ExtractionJobResponse,
    responses={404: {"description": "Extraction job not found"}, **_AUTH_RESPONSES},
    summary="Get Extraction Job",
    description="Job status, extracted course data and per-field confidence scores (0.0 to 1.0).",
)
def get_extraction_job(job_id: str, db: DbSession) -> ExtractionJobResponse:
    """Poll one extraction job."""
    try:
        return ExtractionJobResponse(data=extraction_service.get_job(db, job_id))
    except ExtractionJobError as error:
        raise _job_http_error(error) from None


@router.post(
    "/jobs/{job_id}/commit",
    response_model=ExtractionCommitResponse,
    responses={
        404: {"description": "Extraction job or degree program not found"},
        409: {"description": "Job not ready for commit, already committed, or the course conflicts"},
        422: {"description": "The reviewed course breaks a catalog rule"},
        **_AUTH_RESPONSES,
    },
    summary="Commit Reviewed Extraction",
    description=(
        "Writes the reviewed course (fields, credit distribution and prerequisite rule) and marks the job "
        "COMMITTED in one transaction. Only EXTRACTED jobs can be committed. A new code creates the course "
        "in `programId`; an existing code replaces that course, which must already belong to `programId`."
    ),
)
def commit_extraction_job(job_id: str, review: ExtractionCommitRequest, db: DbSession) -> ExtractionCommitResponse:
    """Commit a reviewed extraction to the catalog."""
    try:
        return ExtractionCommitResponse(data=extraction_service.commit_job(db, job_id, review))
    except ExtractionJobError as error:
        raise _job_http_error(error) from None
    except course_service.CourseServiceError as error:
        raise _commit_http_error(error) from None
