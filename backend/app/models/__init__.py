"""ORM models package."""

from app.core.database import Base
from app.models.curriculum import (
    Course,
    CreditDistribution,
    DegreeProgram,
    PrerequisiteRule,
    program_courses,
)
from app.models.extraction import ExtractionJob

__all__ = [
    "Base",
    "Course",
    "CreditDistribution",
    "DegreeProgram",
    "ExtractionJob",
    "PrerequisiteRule",
    "program_courses",
]
