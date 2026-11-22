"""Admin course mutation service (CF-202).

Owns every business rule for creating and editing courses so the endpoints stay thin:
credit and semester bounds, code immutability and uniqueness, corequisite integrity,
credit-distribution consistency, ``updated_at`` tracking and transactional commits.

Prerequisite ASTs are intentionally untouched here; they belong to CF-203.
"""

from typing import Any

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.curriculum import Course as CourseRecord
from app.models.curriculum import CreditDistribution as CreditDistributionRecord
from app.models.curriculum import DegreeProgram as DegreeProgramRecord
from app.schemas.curriculum import AdminCourse, CourseCreate, CoursePatch, CourseUpdate

DEFAULT_SEMESTER_COUNT = 8

Distribution = list[tuple[int, int]]  # (semester_index, credits_allocated)


class CourseServiceError(Exception):
    """Base class for expected, client-facing course errors."""


class CourseNotFoundError(CourseServiceError):
    """The requested course or degree program does not exist."""


class CourseConflictError(CourseServiceError):
    """The change collides with existing data (e.g. duplicate or immutable course code)."""


class CourseValidationError(CourseServiceError):
    """A business rule failed; ``field`` is the camelCase request field at fault."""

    def __init__(self, field: str, message: str) -> None:
        super().__init__(message)
        self.field = field
        self.message = message


# ==========================================
# Serialization
# ==========================================


def to_admin_course(course: CourseRecord) -> AdminCourse:
    """Convert an ORM course row into the admin response contract."""
    return AdminCourse.model_validate(
        {
            "id": course.id,
            "code": course.code,
            "title": course.title,
            "description": course.description or "",
            "totalCredits": course.total_credits,
            "durationSemesters": course.duration_semesters,
            "recommendedSemester": course.recommended_semester,
            "creditDistribution": [
                {"semesterIndex": d.semester_index, "creditsAllocated": d.credits_allocated}
                for d in course.credit_distribution
            ],
            "type": course.type,
            "prerequisiteRule": course.prerequisite_rule,
            "corequisites": course.corequisites or [],
            "offeredSemesters": course.offered_semesters or [],
            "syllabusObjectives": course.syllabus_objectives or [],
            # Seeded courses without hours store {}; the public contract models that as null.
            "contactHours": course.contact_hours or None,
            "updatedAt": course.updated_at,
        }
    )


# ==========================================
# Validation helpers
# ==========================================


def _validate_semester_window(start: int, duration: int, semester_count: int) -> None:
    last = start + duration - 1
    if last > semester_count:
        raise CourseValidationError(
            "durationSemesters",
            f"A {duration}-semester course starting in semester {start} would end in semester {last}, "
            f"beyond the program's {semester_count} semesters.",
        )


def _clean_corequisites(db: Session, course_id: str, corequisites: list[str]) -> list[str]:
    cleaned = list(dict.fromkeys(item.strip() for item in corequisites))
    if course_id in cleaned:
        raise CourseValidationError("corequisites", "A course cannot be its own corequisite.")
    if cleaned:
        known = set(db.scalars(select(CourseRecord.id).where(CourseRecord.id.in_(cleaned))))
        unknown = [item for item in cleaned if item not in known]
        if unknown:
            raise CourseValidationError("corequisites", f"Unknown corequisite course(s): {', '.join(unknown)}.")
    return cleaned


def check_distribution(entries: Distribution, total: int, duration: int, start: int) -> Distribution:
    """Validate a credit split (one entry per semester from ``start``, summing to ``total``); return it sorted.

    Public so CF-203 (credit-distribution endpoint) and CF-235 (ingestion) enforce the identical rule.
    """
    ordered = sorted(entries)
    expected = list(range(start, start + duration))
    if [index for index, _ in ordered] != expected:
        raise CourseValidationError(
            "creditDistribution",
            f"Must contain exactly one entry per semester for semesters {expected[0]} to {expected[-1]} "
            f"(the course starts in semester {start} and lasts {duration}).",
        )
    allocated = sum(credits for _, credits in ordered)
    if allocated != total:
        raise CourseValidationError(
            "creditDistribution",
            f"Allocated credits sum to {allocated} but totalCredits is {total}.",
        )
    return ordered


def _resolve_distribution(
    *,
    total: int,
    duration: int,
    start: int,
    provided: Distribution | None,
    existing: Distribution,
) -> Distribution:
    """Pick the credit distribution that matches the final course values, or explain why none can be."""
    if provided is not None:
        return check_distribution(provided, total, duration, start)
    if duration == 1:
        return [(start, total)]  # Derived: a single-semester course carries all credits in its term.
    try:
        return check_distribution(existing, total, duration, start)
    except CourseValidationError:
        raise CourseValidationError(
            "creditDistribution",
            "This multi-semester course's credits, duration or start semester changed, so the stored split "
            "no longer fits. Send a creditDistribution that matches the new values.",
        ) from None


# ==========================================
# Persistence helpers
# ==========================================


def _existing_distribution(course: CourseRecord) -> Distribution:
    return sorted((d.semester_index, d.credits_allocated) for d in course.credit_distribution)


def _write_fields(course: CourseRecord, values: dict[str, Any], distribution: Distribution) -> None:
    """Assign validated values. Fresh objects are assigned so JSON column changes are detected."""
    course.title = values["title"]
    course.description = values["description"]
    course.total_credits = values["total_credits"]
    course.duration_semesters = values["duration_semesters"]
    course.recommended_semester = values["recommended_semester"]
    course.type = values["type"]
    course.offered_semesters = values["offered_semesters"]
    course.corequisites = values["corequisites"]
    course.syllabus_objectives = values["syllabus_objectives"]
    course.contact_hours = values["contact_hours"]
    if distribution != _existing_distribution(course):
        course.credit_distribution = [
            CreditDistributionRecord(semester_index=index, credits_allocated=credits)
            for index, credits in distribution
        ]
    # Explicit so edits that only touch child rows still advance the timestamp.
    course.updated_at = func.now()


def _commit(db: Session, course: CourseRecord) -> CourseRecord:
    """Commit atomically; any failure leaves the database untouched."""
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise CourseConflictError("The change conflicts with existing course data.") from None
    except Exception:
        db.rollback()
        raise
    db.refresh(course)
    return course


def _get_course(db: Session, course_id: str) -> CourseRecord:
    course = db.get(CourseRecord, course_id)
    if course is None:
        raise CourseNotFoundError(f"Course '{course_id}' was not found.")
    return course


def _semester_count_for(course: CourseRecord) -> int:
    """A shared course must fit every program that owns it."""
    return min((program.semesters_count for program in course.programs), default=DEFAULT_SEMESTER_COUNT)


def _normalize(values: dict[str, Any]) -> dict[str, Any]:
    """Convert request enums and models into the plain JSON-friendly shapes stored in the database."""
    return {
        **values,
        "type": getattr(values["type"], "value", values["type"]),
        "offered_semesters": list(
            dict.fromkeys(getattr(term, "value", term) for term in values["offered_semesters"])
        ),
        "syllabus_objectives": [item.strip() for item in values["syllabus_objectives"]],
    }


def _provided_distribution(payload: CourseUpdate | CoursePatch) -> Distribution | None:
    if payload.credit_distribution is None:
        return None
    return [(d.semester_index, d.credits_allocated) for d in payload.credit_distribution]


def _check_code_echo(course: CourseRecord, code: str | None) -> None:
    if code is not None and code != course.code:
        raise CourseConflictError(
            f"Course codes are permanent identifiers referenced by prerequisite rules and cannot change "
            f"('{course.code}' -> '{code}')."
        )


def _apply_update(db: Session, course: CourseRecord, values: dict[str, Any], provided: Distribution | None) -> None:
    values = _normalize(values)
    _validate_semester_window(
        values["recommended_semester"], values["duration_semesters"], _semester_count_for(course)
    )
    values["corequisites"] = _clean_corequisites(db, course.id, values["corequisites"])
    distribution = _resolve_distribution(
        total=values["total_credits"],
        duration=values["duration_semesters"],
        start=values["recommended_semester"],
        provided=provided,
        existing=_existing_distribution(course),
    )
    _write_fields(course, values, distribution)


# ==========================================
# Public service API
# ==========================================


def create_course(db: Session, payload: CourseCreate) -> AdminCourse:
    """Create a course inside a degree program. The course ID is its code."""
    program = db.get(DegreeProgramRecord, payload.program_id)
    if program is None:
        raise CourseNotFoundError(f"Degree program '{payload.program_id}' was not found.")
    # `courses.code` is unique across the catalog, which also guarantees uniqueness within the program.
    taken = db.get(CourseRecord, payload.code) or db.scalar(
        select(CourseRecord.id).where(CourseRecord.code == payload.code)
    )
    if taken:
        raise CourseConflictError(f"A course with code '{payload.code}' already exists in the catalog.")

    values = payload.model_dump(exclude={"program_id", "code", "credit_distribution"})
    values["contact_hours"] = payload.contact_hours.model_dump() if payload.contact_hours else {}
    values = _normalize(values)
    _validate_semester_window(values["recommended_semester"], values["duration_semesters"], program.semesters_count)
    values["corequisites"] = _clean_corequisites(db, payload.code, values["corequisites"])
    distribution = _resolve_distribution(
        total=values["total_credits"],
        duration=values["duration_semesters"],
        start=values["recommended_semester"],
        provided=_provided_distribution(payload),
        existing=[],
    )

    course = CourseRecord(id=payload.code, code=payload.code, prerequisite_rule=None)
    course.programs.append(program)
    _write_fields(course, values, distribution)
    db.add(course)
    return to_admin_course(_commit(db, course))


def replace_course(db: Session, course_id: str, payload: CourseUpdate) -> AdminCourse:
    """Full update (PUT) of a course's editable fields."""
    course = _get_course(db, course_id)
    _check_code_echo(course, payload.code)
    values = payload.model_dump(exclude={"code", "credit_distribution"})
    values["contact_hours"] = payload.contact_hours.model_dump() if payload.contact_hours else {}
    return _save_update(db, course, values, _provided_distribution(payload))


def patch_course(db: Session, course_id: str, payload: CoursePatch) -> AdminCourse:
    """Partial update (PATCH): only the fields present in the request change."""
    course = _get_course(db, course_id)
    _check_code_echo(course, payload.code)
    changes = payload.model_dump(exclude_unset=True, exclude={"code", "credit_distribution", "contact_hours"})

    hours = course.contact_hours
    if payload.contact_hours is not None:
        # Merge only the supplied numbers over what is stored.
        hours = {"lecture": 0, "lab": 0, "tutorial": 0, **(course.contact_hours or {})}
        hours.update(payload.contact_hours.model_dump(exclude_unset=True))

    values: dict[str, Any] = {
        "title": course.title,
        "description": course.description or "",
        "total_credits": course.total_credits,
        "duration_semesters": course.duration_semesters,
        "recommended_semester": course.recommended_semester,
        "type": course.type,
        "offered_semesters": list(course.offered_semesters or []),
        "corequisites": list(course.corequisites or []),
        "syllabus_objectives": list(course.syllabus_objectives or []),
        "contact_hours": hours,
        **changes,
    }
    return _save_update(db, course, values, _provided_distribution(payload))


def _save_update(db: Session, course: CourseRecord, values: dict[str, Any], provided: Distribution | None) -> AdminCourse:
    """Validate and apply an update, discarding every pending change if any rule fails."""
    try:
        _apply_update(db, course, values, provided)
    except CourseServiceError:
        db.rollback()
        raise
    return to_admin_course(_commit(db, course))
