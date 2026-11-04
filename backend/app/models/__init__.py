"""ORM models package."""

from app.core.database import Base
from app.models.curriculum import (
    Course,
    CreditDistribution,
    DegreeProgram,
    PrerequisiteRule,
    program_courses,
)

__all__ = [
    "Base",
    "Course",
    "CreditDistribution",
    "DegreeProgram",
    "PrerequisiteRule",
    "program_courses",
]
