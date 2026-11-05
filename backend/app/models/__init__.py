"""SQLAlchemy ORM models."""

from app.models.curriculum import (
    Base,
    Course,
    CreditDistribution,
    DegreeProgram,
    ProgramCourse,
)

__all__ = ["Base", "Course", "CreditDistribution", "DegreeProgram", "ProgramCourse"]
