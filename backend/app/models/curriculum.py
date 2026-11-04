"""SQLAlchemy ORM models for curriculum domain entities.

Matches canonical specifications for DegreeProgram, Course,
CreditDistribution, and PrerequisiteRule.
"""

from sqlalchemy import (
    Column,
    ForeignKey,
    Integer,
    String,
    Table,
    Text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import backref, relationship
from sqlalchemy.types import JSON

from app.core.database import Base

# Compatibility type: uses native PostgreSQL JSONB when available, falls back to JSON
JSONB_COMPAT = JSON().with_variant(JSONB, "postgresql")

# Association table mapping many-to-many relationship between degree programs and courses
program_courses = Table(
    "program_courses",
    Base.metadata,
    Column(
        "program_id",
        String,
        ForeignKey("degree_programs.id", ondelete="CASCADE"),
        primary_key=True,
    ),
    Column(
        "course_id",
        String,
        ForeignKey("courses.id", ondelete="CASCADE"),
        primary_key=True,
    ),
)


class DegreeProgram(Base):
    """Degree program container model."""

    __tablename__ = "degree_programs"

    id = Column(String, primary_key=True, index=True, doc="Unique program identifier (e.g., 'computer-eng')")
    name = Column(String, nullable=False, doc="Degree program name (e.g., 'Computer Engineering')")
    department = Column(String, nullable=False, doc="Department offering the program")
    total_credits_required = Column(Integer, default=150, nullable=False)
    min_credits_per_semester = Column(Integer, default=18, nullable=False)
    max_credits_per_semester = Column(Integer, default=24, nullable=False)
    semesters_count = Column(Integer, default=8, nullable=False)

    # Relationships
    courses = relationship(
        "Course",
        secondary=program_courses,
        back_populates="programs",
        order_by="Course.recommended_semester, Course.code",
    )


class Course(Base):
    """Course catalog entity."""

    __tablename__ = "courses"

    id = Column(String, primary_key=True, index=True, doc="Unique course identifier (e.g., 'CO544')")
    code = Column(String, unique=True, nullable=False, index=True, doc="Official course code")
    title = Column(String, nullable=False, doc="Course title")
    description = Column(Text, default="", nullable=False)
    total_credits = Column(Integer, nullable=False)
    duration_semesters = Column(Integer, default=1, nullable=False)
    recommended_semester = Column(Integer, nullable=False, index=True)
    type = Column(String, nullable=False, doc="CORE, ELECTIVE, LAB, CAPSTONE")

    # Native JSONB columns for recursive AST tree and arrays
    prerequisite_rule = Column(JSONB_COMPAT, nullable=True, doc="Native AST boolean rule tree")
    corequisites = Column(JSONB_COMPAT, default=list, nullable=False, doc="List of concurrent course IDs")
    offered_semesters = Column(JSONB_COMPAT, default=list, nullable=False, doc="Terms offered (FALL, SPRING, BOTH)")
    syllabus_objectives = Column(JSONB_COMPAT, default=list, nullable=True, doc="List of learning objectives")
    contact_hours = Column(JSONB_COMPAT, default=dict, nullable=True, doc="Breakdown of lecture, lab, tutorial hours")

    # Relationships
    programs = relationship(
        "DegreeProgram",
        secondary=program_courses,
        back_populates="courses",
    )
    credit_distribution = relationship(
        "CreditDistribution",
        back_populates="course",
        cascade="all, delete-orphan",
        order_by="CreditDistribution.semester_index",
    )


class CreditDistribution(Base):
    """Credit allocation across semesters for multi-semester or single-term courses."""

    __tablename__ = "credit_distributions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    course_id = Column(
        String,
        ForeignKey("courses.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    semester_index = Column(Integer, nullable=False, doc="Semester index 1 to 8")
    credits_allocated = Column(Integer, nullable=False, doc="Credits counted in this term")

    # Relationships
    course = relationship("Course", back_populates="credit_distribution")


class PrerequisiteRule(Base):
    """Relational representation of prerequisite AST rules for explicit querying and integrity."""

    __tablename__ = "prerequisite_rules"

    id = Column(Integer, primary_key=True, autoincrement=True)
    course_id = Column(
        String,
        ForeignKey("courses.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
        index=True,
    )
    rule_type = Column(String, nullable=False, doc="Rule node type: AND, OR, COURSE, CREDIT_THRESHOLD")
    expression = Column(JSONB_COMPAT, nullable=False, doc="Serialized boolean AST JSON")

    # Relationships
    course = relationship("Course", backref=backref("prerequisite_rule_record", uselist=False))
