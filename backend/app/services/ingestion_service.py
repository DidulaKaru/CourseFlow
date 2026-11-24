"""Atomic ingestion of reviewed extractions into the course catalog (CF-235).

``extraction_service.commit_job`` handles access, locking and job-state checks; this module writes the course and the
job in one transaction. Course rules are not repeated here: ``course_service.stage_reviewed_course`` applies the same
ones as the admin editor (CF-202, CF-203).
"""

from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.curriculum import Course as CourseRecord
from app.models.extraction import ExtractionJob as ExtractionJobRecord
from app.schemas.extraction_jobs import ExtractionCommitRequest, ExtractionJobStatus
from app.services import course_service


def ingest_reviewed_course(
    db: Session, job: ExtractionJobRecord, review: ExtractionCommitRequest
) -> CourseRecord:
    """Upsert the reviewed course, its credit distribution and prerequisite rule, and mark ``job`` COMMITTED.

    Everything is committed together; on any error the session is rolled back, so nothing is written and the job
    stays EXTRACTED. Raises ``course_service.CourseServiceError`` when the course breaks a catalog rule.

    The database has one row per course ID: ingesting a course shared by several programs changes it for all of them.
    """
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
    return course
