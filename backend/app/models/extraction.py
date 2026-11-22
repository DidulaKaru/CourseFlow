"""SQLAlchemy model for MIS document extraction jobs (schema planned in CF-235, introduced by CF-204)."""

import uuid

from sqlalchemy import Column, DateTime, ForeignKey, String, Text, func

from app.core.database import Base
from app.models.curriculum import JSONB_COMPAT


def _new_job_id() -> str:
    return str(uuid.uuid4())


class ExtractionJob(Base):
    """One uploaded syllabus document moving PENDING -> PROCESSING -> EXTRACTED -> COMMITTED (or FAILED)."""

    __tablename__ = "extraction_jobs"

    id = Column(String(36), primary_key=True, default=_new_job_id, doc="UUID4 job identifier")
    filename = Column(String, nullable=False, doc="Original uploaded file name")
    content_type = Column(String, nullable=False, doc="Validated MIME type of the upload")
    file_hash = Column(String(64), nullable=False, unique=True, index=True, doc="SHA256 of the file bytes")
    status = Column(String, nullable=False, index=True, doc="PENDING, PROCESSING, EXTRACTED, COMMITTED or FAILED")
    extracted_data = Column(JSONB_COMPAT, nullable=True, doc="Extracted course fields awaiting review")
    confidence_scores = Column(JSONB_COMPAT, nullable=True, doc="Field name -> confidence between 0.0 and 1.0")
    error_message = Column(Text, nullable=True, doc="Why extraction failed (FAILED jobs only)")
    committed_course_id = Column(
        String,
        ForeignKey("courses.id", ondelete="SET NULL"),
        nullable=True,
        doc="Course written by the commit (COMMITTED jobs only)",
    )
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
