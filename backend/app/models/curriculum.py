"""SQLAlchemy ORM models for the curriculum data layer (CF-131).

Mirrors the Pydantic contracts in ``app/schemas/curriculum.py``. Prerequisite ASTs are
stored natively as JSONB on PostgreSQL (plain JSON on other dialects, e.g. SQLite in tests).
"""

from typing import Any

from sqlalchemy import (
    CheckConstraint,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship
from sqlalchemy.types import JSON

# JSONB on PostgreSQL, generic JSON elsewhere.
JsonType = JSON().with_variant(JSONB(), "postgresql")

COURSE_TYPES = ("CORE", "ELECTIVE", "LAB", "CAPSTONE")


class Base(DeclarativeBase):
    """Declarative base shared by every ORM model (Alembic reads ``Base.metadata``)."""


class DegreeProgram(Base):
    __tablename__ = "degree_programs"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    department: Mapped[str] = mapped_column(String(255), nullable=False)
    total_credits_required: Mapped[int] = mapped_column(Integer, nullable=False, default=150)
    min_credits_per_semester: Mapped[int] = mapped_column(Integer, nullable=False, default=18)
    max_credits_per_semester: Mapped[int] = mapped_column(Integer, nullable=False, default=24)
    semesters_count: Mapped[int] = mapped_column(Integer, nullable=False, default=8)

    course_links: Mapped[list["ProgramCourse"]] = relationship(
        back_populates="program", cascade="all, delete-orphan"
    )


class Course(Base):
    __tablename__ = "courses"
    __table_args__ = (
        CheckConstraint(
            "type IN ('CORE', 'ELECTIVE', 'LAB', 'CAPSTONE')", name="ck_courses_type"
        ),
        CheckConstraint("total_credits >= 1", name="ck_courses_total_credits"),
        CheckConstraint(
            "duration_semesters BETWEEN 1 AND 2", name="ck_courses_duration_semesters"
        ),
        CheckConstraint(
            "recommended_semester BETWEEN 1 AND 8", name="ck_courses_recommended_semester"
        ),
    )

    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    code: Mapped[str] = mapped_column(String(32), nullable=False, unique=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False, default="")
    total_credits: Mapped[int] = mapped_column(Integer, nullable=False)
    duration_semesters: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    recommended_semester: Mapped[int] = mapped_column(Integer, nullable=False)
    type: Mapped[str] = mapped_column(String(16), nullable=False)
    # Recursive boolean AST (COURSE / AND / OR / CREDIT_THRESHOLD); NULL = no prerequisites.
    prerequisite_rule: Mapped[dict[str, Any] | None] = mapped_column(JsonType, nullable=True)
    corequisites: Mapped[list[str]] = mapped_column(JsonType, nullable=False, default=list)
    offered_semesters: Mapped[list[str]] = mapped_column(JsonType, nullable=False, default=list)

    credit_distribution: Mapped[list["CreditDistribution"]] = relationship(
        back_populates="course",
        cascade="all, delete-orphan",
        order_by="CreditDistribution.semester_index",
    )
    program_links: Mapped[list["ProgramCourse"]] = relationship(
        back_populates="course", cascade="all, delete-orphan"
    )


class CreditDistribution(Base):
    __tablename__ = "credit_distributions"
    __table_args__ = (
        UniqueConstraint("course_id", "semester_index", name="uq_credit_dist_course_semester"),
        CheckConstraint("semester_index BETWEEN 1 AND 8", name="ck_credit_dist_semester"),
        CheckConstraint("credits_allocated >= 0", name="ck_credit_dist_credits"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    course_id: Mapped[str] = mapped_column(
        ForeignKey("courses.id", ondelete="CASCADE"), nullable=False
    )
    semester_index: Mapped[int] = mapped_column(Integer, nullable=False)
    credits_allocated: Mapped[int] = mapped_column(Integer, nullable=False)

    course: Mapped[Course] = relationship(back_populates="credit_distribution")


class ProgramCourse(Base):
    """Association: which courses belong to which degree program.

    Needed because modules such as the Common Core (semesters 1-2) are shared by both
    programs while ``courses.id`` stays globally unique.
    """

    __tablename__ = "program_courses"
    __table_args__ = (Index("ix_program_courses_course_id", "course_id"),)

    program_id: Mapped[str] = mapped_column(
        ForeignKey("degree_programs.id", ondelete="CASCADE"), primary_key=True
    )
    course_id: Mapped[str] = mapped_column(
        ForeignKey("courses.id", ondelete="CASCADE"), primary_key=True
    )

    program: Mapped[DegreeProgram] = relationship(back_populates="course_links")
    course: Mapped[Course] = relationship(back_populates="program_links")
