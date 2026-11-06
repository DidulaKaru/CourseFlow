"""Schemas for study plan validation.

Defines payloads and response contracts for POST /api/plans/validate.
"""

from pydantic import Field

from app.schemas.curriculum import CamelModel


class PlanValidationRequest(CamelModel):
    """Payload to validate a student's study plan against curriculum rules."""

    program_id: str = Field(
        ...,
        description="Target degree program identifier (e.g., 'computer-eng')",
    )
    selected_elective_ids: list[str] = Field(
        default_factory=list,
        description="Course IDs of electives chosen by the student",
    )
    completed_course_ids: list[str] = Field(
        default_factory=list,
        description="Course IDs completed/passed by the student",
    )


class SemesterValidationDetail(CamelModel):
    """Validation outcome for a single semester execution window."""

    semester_index: int = Field(..., ge=1, le=8, description="Semester term (1 to 8)")
    total_credits: int = Field(..., ge=0, description="Sum of planned credits in this term")
    is_valid: bool = Field(
        ...,
        description="True if term load meets minimum bounds (>= 18 credits) and cap (<= 24)",
    )
    warning: str | None = Field(
        default=None,
        description="Warning explanation if credit thresholds are breached",
    )
    course_ids: list[str] = Field(
        default_factory=list,
        description="Course codes allocated to this semester",
    )


class PrerequisiteValidationDetail(CamelModel):
    """Diagnostic outcome for an individual module's prerequisite rule."""

    course_id: str
    course_title: str
    is_satisfied: bool
    missing_prerequisite_ids: list[str] = Field(default_factory=list)
    credit_deficit: int = 0
    summary: str


class PlanValidationResponse(CamelModel):
    """Comprehensive plan validation report."""

    is_valid: bool = Field(
        ...,
        description="True if all prerequisites are met and credit boundaries satisfied",
    )
    total_planned_credits: int = Field(
        ...,
        description="Cumulative credits across all planned courses in curriculum",
    )
    total_earned_credits: int = Field(
        ...,
        description="Cumulative credits earned from completed courses",
    )
    total_credits_required: int = Field(
        default=150,
        description="Minimum total degree credits required for graduation",
    )
    is_graduation_eligible: bool = Field(
        ...,
        description="True if total planned credits reach graduation requirement",
    )
    semesters: list[SemesterValidationDetail] = Field(
        default_factory=list,
        description="Detailed breakdown for semesters 1 through 8",
    )
    prerequisite_validations: list[PrerequisiteValidationDetail] = Field(
        default_factory=list,
        description="Prerequisite satisfaction states for planned courses",
    )
    errors: list[str] = Field(
        default_factory=list,
        description="Blocking errors (e.g. unmet prerequisites)",
    )
    warnings: list[str] = Field(
        default_factory=list,
        description="Non-blocking warnings (e.g. semester load < 18 credits)",
    )
