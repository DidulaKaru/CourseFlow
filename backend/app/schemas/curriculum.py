"""Curriculum domain schemas and DTOs.

Matches src/types/curriculum.ts canonical data contracts.
"""

from datetime import datetime
from enum import Enum
from typing import Annotated, Literal

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    StringConstraints,
    field_validator,
    model_validator,
)
from pydantic.alias_generators import to_camel


class CamelModel(BaseModel):
    """Base model enforcing camelCase serialization for frontend compatibility."""

    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
    )


# ==========================================
# 1. Prerequisite Abstract Syntax Tree (AST)
# ==========================================


class RuleType(str, Enum):
    """Prerequisite AST rule node types."""

    AND = "AND"
    OR = "OR"
    COURSE = "COURSE"
    CREDIT_THRESHOLD = "CREDIT_THRESHOLD"


class CourseRuleNode(CamelModel):
    """Leaf AST node asserting completion of a prerequisite course."""

    type: Literal["COURSE"] = "COURSE"
    course_id: str = Field(..., description="Course code, e.g., EC101")


class CreditThresholdRuleNode(CamelModel):
    """Leaf AST node asserting a minimum earned credits threshold."""

    type: Literal["CREDIT_THRESHOLD"] = "CREDIT_THRESHOLD"
    min_credits: int = Field(..., ge=0, description="Minimum earned credits, e.g., 30")


class LogicalRuleNode(CamelModel):
    """Branch AST node combining sub-rules via boolean AND or OR."""

    type: Literal["AND", "OR"]
    children: list["PrerequisiteRule"] = Field(..., description="Child AST rules")


PrerequisiteRule = Annotated[
    CourseRuleNode | CreditThresholdRuleNode | LogicalRuleNode,
    Field(discriminator="type"),
]

# Rebuild recursive model to resolve forward references
LogicalRuleNode.model_rebuild()


# ==========================================
# 2. Course & Multi-Semester Credit Modeling
# ==========================================


class CourseType(str, Enum):
    """Course classification."""

    CORE = "CORE"
    ELECTIVE = "ELECTIVE"
    LAB = "LAB"
    CAPSTONE = "CAPSTONE"


class SemesterTerm(str, Enum):
    """Semester offering terms."""

    FALL = "FALL"
    SPRING = "SPRING"
    BOTH = "BOTH"


class ContactHours(CamelModel):
    """Contact hours breakdown for lecture, lab, and tutorial."""

    lecture: int = Field(default=0, ge=0, description="Weekly lecture hours")
    lab: int = Field(default=0, ge=0, description="Weekly practical lab hours")
    tutorial: int = Field(default=0, ge=0, description="Weekly tutorial hours")


class CreditDistribution(CamelModel):
    """Credit allocation for a specific semester in multi-semester courses."""

    semester_index: int = Field(..., ge=1, le=8, description="Discrete term: 1 to 8")
    credits_allocated: int = Field(
        ..., ge=0, description="Credits counted toward this semester's load"
    )


class Course(CamelModel):
    """Course entity in the curriculum dependency graph."""

    id: str = Field(..., description="Unique primary identifier (e.g., 'CO544')")
    code: str = Field(..., description="Official display code")
    title: str = Field(..., description="Full course title")
    description: str = Field(default="", description="Course syllabus description")
    total_credits: int = Field(..., ge=1, description="Total academic credits")
    duration_semesters: int = Field(
        default=1,
        ge=1,
        le=8,
        description="Duration in semesters (1 standard, 2+ capstone/spanning)",
    )
    recommended_semester: int = Field(
        ..., ge=1, le=8, description="Recommended semester: 1 through 8"
    )
    credit_distribution: list[CreditDistribution] = Field(
        default_factory=list,
        description="Credit distribution across semesters for multi-term courses",
    )
    type: CourseType = Field(..., description="Course classification")
    prerequisite_rule: PrerequisiteRule | None = Field(
        default=None,
        description="Prerequisite AST boolean formula",
    )
    corequisites: list[str] = Field(
        default_factory=list,
        description="Course IDs required concurrently",
    )
    offered_semesters: list[SemesterTerm] = Field(
        default_factory=list,
        description="Semester terms when course is offered",
    )
    syllabus_objectives: list[str] = Field(
        default_factory=list,
        description="Official learning objectives from syllabus",
    )
    contact_hours: ContactHours | None = Field(
        default=None,
        description="Weekly lecture, lab, and tutorial contact hours",
    )


# ==========================================
# 3. Degree Program Container & Summaries
# ==========================================


class DegreeProgram(CamelModel):
    """Degree program container containing the full curriculum course catalog."""

    id: str = Field(..., description="Unique program identifier (e.g., 'computer-eng')")
    name: str = Field(..., description="Degree program name (e.g., 'Computer Engineering')")
    department: str = Field(..., description="Department offering the program")
    total_credits_required: int = Field(
        default=150,
        description="Total credits required for graduation",
    )
    min_credits_per_semester: int = Field(
        default=18,
        description="Minimum workload credits per semester",
    )
    max_credits_per_semester: int = Field(
        default=24,
        description="Maximum credit cap per semester",
    )
    semesters_count: int = Field(
        default=8,
        description="Total duration in semesters",
    )
    courses: list[Course] = Field(
        default_factory=list,
        description="Complete course catalog for this degree program",
    )


class DegreeProgramSummary(CamelModel):
    """High-level summary for degree program listings."""

    id: str = Field(..., description="Unique program identifier (e.g., 'computer-eng')")
    name: str = Field(..., description="Degree program name (e.g., 'Computer Engineering')")
    department: str = Field(..., description="Department offering the program")
    total_credits_required: int = Field(
        default=150,
        description="Total credits required for graduation",
    )
    min_credits_per_semester: int = Field(
        default=18,
        description="Minimum workload credits per semester",
    )
    max_credits_per_semester: int = Field(
        default=24,
        description="Maximum credit cap per semester",
    )
    semesters_count: int = Field(
        default=8,
        description="Total duration in semesters",
    )


# ==========================================
# 4. Admin Course Editing Contracts (CF-202)
# ==========================================

# Official bounds enforced on every admin write (Semester window is also capped by the program).
MIN_COURSE_CREDITS = 1
MAX_COURSE_CREDITS = 12
COURSE_CODE_PATTERN = r"^[A-Z]{2,4}[0-9]{3,5}[A-Z]?$"
CourseTitle = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]


class StrictCamelModel(CamelModel):
    """Camel-case request model that rejects unknown fields instead of silently dropping them."""

    model_config = ConfigDict(extra="forbid")


class ContactHoursUpdate(StrictCamelModel):
    """Partial contact hours: omitted fields keep their stored value (PATCH merge)."""

    lecture: int | None = Field(default=None, ge=0, description="Lecture hours")
    lab: int | None = Field(default=None, ge=0, description="Practical lab hours")
    tutorial: int | None = Field(default=None, ge=0, description="Tutorial hours")

    @model_validator(mode="after")
    def reject_explicit_nulls(self) -> "ContactHoursUpdate":
        """Omit a field to keep it; null is not a valid value."""
        for name in self.model_fields_set:
            if getattr(self, name) is None:
                raise ValueError(f"{name} must be a number or omitted, not null")
        return self


class CourseUpdate(StrictCamelModel):
    """Full replacement of a course's editable fields (PUT).

    Prerequisite rules are edited through the dedicated prerequisites endpoint, and the
    course code is a permanent identifier, so neither can be changed here.
    """

    code: str | None = Field(
        default=None,
        description="Optional echo of the course code. Codes are immutable; a different value is rejected.",
    )
    title: CourseTitle
    description: str = Field(default="", max_length=10_000)
    total_credits: int = Field(..., ge=MIN_COURSE_CREDITS, le=MAX_COURSE_CREDITS)
    duration_semesters: int = Field(default=1, ge=1, le=8)
    recommended_semester: int = Field(..., ge=1, le=8)
    type: CourseType
    offered_semesters: list[SemesterTerm] = Field(default_factory=list)
    corequisites: list[str] = Field(default_factory=list)
    syllabus_objectives: list[Annotated[str, Field(min_length=1, max_length=1_000)]] = Field(
        default_factory=list, max_length=50
    )
    contact_hours: ContactHours | None = Field(default=None, description="Null clears stored contact hours")
    credit_distribution: list[CreditDistribution] | None = Field(
        default=None,
        description=(
            "Per-semester credit split. Omit for single-semester courses (derived automatically); "
            "required when a multi-semester course changes credits, duration or start semester."
        ),
    )

    @field_validator("code", mode="before")
    @classmethod
    def normalize_code(cls, value: object) -> object:
        """Course codes are stored upper-case without surrounding whitespace."""
        return value.strip().upper() if isinstance(value, str) else value


class CourseCreate(CourseUpdate):
    """Create a new course inside a degree program (POST). The course ID equals its code."""

    program_id: str = Field(..., min_length=1, description="Degree program that will own the course")
    code: str = Field(..., pattern=COURSE_CODE_PATTERN, description="Unique official course code, e.g. CO544")


class CoursePatch(StrictCamelModel):
    """Partial update (PATCH). Omitted fields are untouched; null is never a valid value."""

    code: str | None = Field(default=None, description="Optional echo of the course code (immutable)")
    title: CourseTitle | None = None
    description: str | None = Field(default=None, max_length=10_000)
    total_credits: int | None = Field(default=None, ge=MIN_COURSE_CREDITS, le=MAX_COURSE_CREDITS)
    duration_semesters: int | None = Field(default=None, ge=1, le=8)
    recommended_semester: int | None = Field(default=None, ge=1, le=8)
    type: CourseType | None = None
    offered_semesters: list[SemesterTerm] | None = None
    corequisites: list[str] | None = None
    syllabus_objectives: (
        list[Annotated[str, Field(min_length=1, max_length=1_000)]] | None
    ) = Field(default=None, max_length=50)
    contact_hours: ContactHoursUpdate | None = None
    credit_distribution: list[CreditDistribution] | None = None

    @field_validator("code", mode="before")
    @classmethod
    def normalize_code(cls, value: object) -> object:
        """Course codes are stored upper-case without surrounding whitespace."""
        return value.strip().upper() if isinstance(value, str) else value

    @model_validator(mode="after")
    def require_non_null_changes(self) -> "CoursePatch":
        """Reject explicit nulls and empty bodies so a PATCH always states a real change."""
        if not self.model_fields_set:
            raise ValueError("Provide at least one field to update")
        for name in self.model_fields_set:
            if getattr(self, name) is None:
                raise ValueError(f"{name} cannot be null; omit it to leave it unchanged")
        return self


class AdminCourse(Course):
    """Course as returned to admin tools: the public contract plus audit metadata."""

    updated_at: datetime | None = Field(default=None, description="Last admin modification time")


class CourseResponse(CamelModel):
    """Standard success envelope for admin course mutations."""

    success: Literal[True] = True
    data: AdminCourse
