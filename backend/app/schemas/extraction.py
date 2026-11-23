"""Extracted course DTOs (CF-233).

Field names map one-to-one onto the admin course contract (``CourseUpdate``), except ``courseType``, which is
committed as ``type``, and ``totalSemesterHours`` / ``prerequisiteText``, which only inform the reviewer.
Values a document does not state are null or empty, so the reviewer fills them in.

The models the language model answers with carry no string or list length limits: Ollama compiles them into
grammar repetitions and rejects large ones. ``services/extractor.py`` trims values to the admin limits instead.
"""

from pydantic import Field

from app.schemas.curriculum import (
    MAX_COURSE_CREDITS,
    MIN_COURSE_CREDITS,
    CamelModel,
    ContactHours,
    CourseType,
    CreditDistribution,
    SemesterTerm,
)


class ExtractedCourseMetadata(CamelModel):
    """Core course attributes stated by a syllabus."""

    code: str | None = None
    title: str | None = None
    description: str = ""
    total_credits: int | None = Field(default=None, ge=MIN_COURSE_CREDITS, le=MAX_COURSE_CREDITS)
    duration_semesters: int = Field(default=1, ge=1, le=8)
    course_type: CourseType | None = None
    offered_semesters: list[SemesterTerm] = Field(default_factory=list)
    recommended_semester: int | None = Field(default=None, ge=1, le=8)
    corequisites: list[str] = Field(default_factory=list)
    syllabus_objectives: list[str] = Field(default_factory=list)
    prerequisite_text: str | None = Field(default=None, description="Prerequisite wording copied from the document")


class StatedContactHours(CamelModel):
    """Contact hours as printed in the document, in whichever unit it uses."""

    lecture: float = Field(default=0, ge=0)
    lab: float = Field(default=0, ge=0)
    tutorial: float = Field(default=0, ge=0)
    total_semester_hours: float | None = Field(default=None, ge=0)


class SyllabusExtraction(ExtractedCourseMetadata):
    """What the language model answers for one document."""

    contact_hours: StatedContactHours | None = None
    contact_hours_per_week: bool = False


class ExtractedContactHours(ContactHours):
    """Contact hours per semester, the unit the catalog stores."""

    total_semester_hours: int | None = Field(default=None, ge=0, description="Stated total (informational only)")


class ExtractedCreditDistribution(CreditDistribution):
    """Credits allocated to one semester; entries sum to ``totalCredits``."""


class ExtractedCourse(ExtractedCourseMetadata):
    """A course ready for human review: the ``extractedData`` of an extraction job."""

    contact_hours: ExtractedContactHours | None = None
    credit_distribution: list[ExtractedCreditDistribution] = Field(default_factory=list)
