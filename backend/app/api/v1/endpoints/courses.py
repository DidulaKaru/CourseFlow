"""Administrative course content endpoints (CF-202).

Every route here mutates the curriculum, so the whole router requires an ADMIN session.
Guarding at router level means routes added later (CF-203 prerequisites and credit
distributions among them) are protected by default. Student-facing reads live in ``programs.py`` and stay public.
"""

from fastapi import APIRouter, Depends, HTTPException, status

from app.api.deps import DbSession, get_current_admin_user
from app.schemas.curriculum import (
    CourseCreate,
    CoursePatch,
    CourseResponse,
    CourseUpdate,
    CreditDistribution,
    PrerequisiteRule,
)
from app.services import course_service
from app.services.course_service import (
    CourseConflictError,
    CourseNotFoundError,
    CourseValidationError,
    RuleValidationError,
)

router = APIRouter(dependencies=[Depends(get_current_admin_user)])

_ERROR_RESPONSES: dict[int | str, dict[str, str]] = {
    401: {"description": "Missing, invalid or expired token"},
    403: {"description": "Authenticated but not an administrator"},
    404: {"description": "Course or degree program not found"},
    409: {"description": "Duplicate or immutable course code"},
    422: {"description": "Validation failed"},
}


def course_http_error(error: course_service.CourseServiceError) -> HTTPException:
    """Translate service errors into HTTP responses; 422s mirror FastAPI's validation error shape."""
    if isinstance(error, CourseNotFoundError):
        return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(error))
    if isinstance(error, CourseConflictError):
        return HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(error))
    if isinstance(error, CourseValidationError):
        detail = [{"loc": ["body", error.field], "msg": error.message, "type": "value_error"}]
        return HTTPException(status_code=422, detail=detail)
    if isinstance(error, RuleValidationError):
        detail = [
            {"loc": ["body", *issue.path], "msg": issue.message, "type": "value_error"}
            for issue in error.issues
        ]
        return HTTPException(status_code=422, detail=detail)
    raise error


@router.post(
    "",
    response_model=CourseResponse,
    status_code=status.HTTP_201_CREATED,
    responses=_ERROR_RESPONSES,
    summary="Create Course",
    description="Create a new course inside a degree program. The course ID equals its unique code.",
)
def create_course(payload: CourseCreate, db: DbSession) -> CourseResponse:
    """Create a course node within a degree program."""
    try:
        return CourseResponse(data=course_service.create_course(db, payload))
    except course_service.CourseServiceError as error:
        raise course_http_error(error) from None


@router.put(
    "/{course_id}",
    response_model=CourseResponse,
    responses=_ERROR_RESPONSES,
    summary="Replace Course",
    description="Full update of a course's editable fields. Prerequisite rules use their own endpoint.",
)
def replace_course(course_id: str, payload: CourseUpdate, db: DbSession) -> CourseResponse:
    """Replace every editable field of a course in a single transaction."""
    try:
        return CourseResponse(data=course_service.replace_course(db, course_id, payload))
    except course_service.CourseServiceError as error:
        raise course_http_error(error) from None


@router.patch(
    "/{course_id}",
    response_model=CourseResponse,
    responses=_ERROR_RESPONSES,
    summary="Update Course Fields",
    description="Partial update: only the supplied fields change (contactHours merges per field).",
)
def patch_course(course_id: str, payload: CoursePatch, db: DbSession) -> CourseResponse:
    """Update a subset of a course's editable fields."""
    try:
        return CourseResponse(data=course_service.patch_course(db, course_id, payload))
    except course_service.CourseServiceError as error:
        raise course_http_error(error) from None


@router.put(
    "/{course_id}/prerequisites",
    response_model=CourseResponse,
    responses=_ERROR_RESPONSES,
    summary="Replace Prerequisite Rule",
    description=(
        "The request body is the prerequisite AST itself (AND / OR branches, COURSE / CREDIT_THRESHOLD "
        "leaves). Rejected with 422 when nested deeper than 20 levels, an AND/OR node is empty, a leaf "
        "references an unknown course or the course itself, or the rule would create a circular dependency."
    ),
)
def replace_prerequisites(course_id: str, rule: PrerequisiteRule, db: DbSession) -> CourseResponse:
    """Persist a validated prerequisite AST to ``courses.prerequisite_rule`` and ``prerequisite_rules``."""
    try:
        return CourseResponse(data=course_service.set_prerequisite_rule(db, course_id, rule))
    except course_service.CourseServiceError as error:
        raise course_http_error(error) from None


@router.delete(
    "/{course_id}/prerequisites",
    response_model=CourseResponse,
    responses=_ERROR_RESPONSES,
    summary="Clear Prerequisite Rule",
    description="Remove every prerequisite from the course (its rule becomes null).",
)
def clear_prerequisites(course_id: str, db: DbSession) -> CourseResponse:
    """Remove a course's prerequisite rule."""
    try:
        return CourseResponse(data=course_service.set_prerequisite_rule(db, course_id, None))
    except course_service.CourseServiceError as error:
        raise course_http_error(error) from None


@router.put(
    "/{course_id}/credit-distribution",
    response_model=CourseResponse,
    responses=_ERROR_RESPONSES,
    summary="Replace Credit Distribution",
    description=(
        "The request body is an array of {semesterIndex, creditsAllocated}: exactly one entry per "
        "semester the course spans, starting at its recommended semester, summing to its totalCredits."
    ),
)
def replace_credit_distribution(course_id: str, entries: list[CreditDistribution], db: DbSession) -> CourseResponse:
    """Replace a course's multi-semester credit split."""
    try:
        return CourseResponse(data=course_service.set_credit_distribution(db, course_id, entries))
    except course_service.CourseServiceError as error:
        raise course_http_error(error) from None
