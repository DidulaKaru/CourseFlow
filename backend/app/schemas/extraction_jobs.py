"""MIS extraction job API contracts (CF-204).

The extracted course fields themselves are CF-233's DTOs (``schemas/extraction.py``); until those land,
``extractedData`` is an open JSON object produced by the configured extraction pipeline.
"""

from datetime import datetime
from enum import Enum
from typing import Annotated, Any, Literal

from pydantic import Field

from app.schemas.curriculum import (
    AdminCourse,
    CamelModel,
    CourseCreate,
    PrerequisiteRule,
)

ConfidenceScore = Annotated[float, Field(ge=0.0, le=1.0)]


class ExtractionJobStatus(str, Enum):
    """Canonical job states: PENDING -> PROCESSING -> EXTRACTED (ready for review) -> COMMITTED, or FAILED."""

    PENDING = "PENDING"
    PROCESSING = "PROCESSING"
    EXTRACTED = "EXTRACTED"
    COMMITTED = "COMMITTED"
    FAILED = "FAILED"


class ExtractionJob(CamelModel):
    """An uploaded syllabus document and what has been extracted from it so far."""

    job_id: str = Field(..., description="UUID of the extraction job")
    filename: str = Field(..., description="Original uploaded file name")
    content_type: str = Field(..., description="MIME type of the uploaded document")
    file_hash: str = Field(..., description="SHA256 of the file bytes; identical uploads share one job")
    status: ExtractionJobStatus
    extracted_data: dict[str, Any] | None = Field(
        default=None, description="Extracted course fields and prerequisite AST (EXTRACTED and later)"
    )
    confidence_scores: dict[str, ConfidenceScore] | None = Field(
        default=None, description="Field name -> extraction confidence from 0.0 to 1.0"
    )
    error_message: str | None = Field(default=None, description="Why extraction failed (FAILED only)")
    committed_course_id: str | None = Field(default=None, description="Course written by the commit (COMMITTED only)")
    created_at: datetime
    updated_at: datetime


class ExtractionJobResponse(CamelModel):
    """Standard success envelope for a single extraction job."""

    success: Literal[True] = True
    data: ExtractionJob


class ExtractionCommitRequest(CourseCreate):
    """The reviewer's corrected course, written to the catalog in one transaction.

    A new code creates the course inside ``programId``; an existing code replaces that course's editable
    fields (it must already belong to ``programId``). ``prerequisiteRule`` replaces the stored rule; null clears it.
    """

    prerequisite_rule: PrerequisiteRule | None = Field(default=None, description="Reviewed prerequisite AST")


class ExtractionCommitResult(CamelModel):
    """The committed job together with the course as now stored."""

    job: ExtractionJob
    course: AdminCourse


class ExtractionCommitResponse(CamelModel):
    """Standard success envelope for a commit."""

    success: Literal[True] = True
    data: ExtractionCommitResult
