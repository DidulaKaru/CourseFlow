"""Administrative course content endpoints (CF-202).

Every route here mutates the curriculum, so the whole router requires an ADMIN session.
Guarding at router level means routes added later (e.g. CF-203 prerequisites) are
protected by default. Student-facing reads live in ``programs.py`` and stay public.
"""

from fastapi import APIRouter, Depends, HTTPException, status

from app.api.deps import DbSession, get_current_admin_user
from app.schemas.curriculum import (
    CourseCreate,
    CoursePatch,
    CourseResponse,
    CourseUpdate,
)
from app.services import course_service
from app.services.course_service import (
    CourseConflictError,
    CourseNotFoundError,
    CourseValidationError,
)

router = APIRouter(dependencies=[Depends(get_current_admin_user)])

_ERROR_RESPONSES: dict[int | str, dict[str, str]] = {
    401: {"description": "Missing, invalid or expired token"},
    403: {"description": "Authenticated but not an administrator"},
    404: {"description": "Course or degree program not found"},
    409: {"description": "Duplicate or immutable course code"},
    422: {"description": "Validation failed"},
}


def _http_error(error: course_service.CourseServiceError) -> HTTPException:
    """Translate service errors into HTTP responses; 422s mirror FastAPI's validation error shape."""
    if isinstance(error, CourseNotFoundError):
        return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(error))
    if isinstance(error, CourseConflictError):
        return HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(error))
    if isinstance(error, CourseValidationError):
        detail = [{"loc": ["body", error.field], "msg": error.message, "type": "value_error"}]
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
        raise _http_error(error) from None


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
        raise _http_error(error) from None


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
        raise _http_error(error) from None
