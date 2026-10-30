"""Curriculum domain schemas and DTOs.

Matches src/types/curriculum.ts canonical data contracts.
"""

from enum import Enum
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field
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
        le=2,
        description="Duration in semesters (1 standard, 2 capstone)",
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
