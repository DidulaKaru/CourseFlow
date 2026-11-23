"""Course feature extraction from a parsed syllabus (CF-233).

The language model reads the document; everything the parser located deterministically then overrides or
cross-checks its answer. Each field gets a confidence from 0.0 to 1.0 that drives the review badges
(0.9 and above is high, 0.7 and above is medium), so a score states how well the document itself supports the value.
"""

import asyncio
import re
from collections.abc import Iterable

from app.schemas.curriculum import CourseType
from app.schemas.extraction import (
    ExtractedContactHours,
    ExtractedCourse,
    ExtractedCreditDistribution,
    SyllabusExtraction,
)
from app.services.course_codes import (
    find_course_codes,
    is_course_code,
    normalize_course_code,
)
from app.services.course_service import DEFAULT_SEMESTER_COUNT, check_distribution
from app.services.extraction_contract import ExtractionResult
from app.services.extraction_prompts import build_extraction_messages
from app.services.llm_client import LLMClient
from app.services.pdf_parser import (
    ParsedContactHours,
    ParsedSyllabus,
    first_module_text,
    parse_document,
)
from app.services.structured_output import generate_structured

# Teaching weeks in a semester: the catalog stores 14 hours for one weekly lecture hour.
WEEKS_PER_SEMESTER = 14
# Limits of the admin course contract (CourseUpdate), which the reviewed course must satisfy.
_MAX_TITLE, _MAX_DESCRIPTION, _MAX_OBJECTIVE, _MAX_OBJECTIVES = 200, 10_000, 1_000, 50

_SEMESTER_SPAN = re.compile(
    r"\b(?:(?:semesters|terms)\s*(?P<a>[1-8])\s*(?:and|&|to|through|[-–])"
    r"|(?:semester|term)\s*(?P<b>[1-8])\s*(?:and|&))"
    r"\s*(?:(?:semester|term)\s*)?(?P<end>[1-8])\b",
    re.IGNORECASE,
)
# "Offered in semesters 1 and 2" lists alternatives, not a span.
_ALTERNATIVES = re.compile(r"\boffered\b|\beither\b", re.IGNORECASE)
_YEAR_LONG = re.compile(
    r"\byear[-\s]long\b|\btwo[-\s]semester\b|\b(?:over|across|spanning)\s+(?:two|2)\s+(?:semesters|terms)\b"
    r"|\bfull\s+academic\s+year\b",
    re.IGNORECASE,
)
_TYPE_EVIDENCE = {
    CourseType.CAPSTONE: re.compile(
        r"\bcapstone\b|\b(?:final[-\s]year|undergraduate)\s+project\b|\bdissertation\b|\bthesis\b", re.IGNORECASE
    ),
    CourseType.ELECTIVE: re.compile(r"\belective\b|\boptional\b", re.IGNORECASE),
    CourseType.LAB: re.compile(r"\blab(?:oratory)?\b", re.IGNORECASE),
    CourseType.CORE: re.compile(r"\bcore\b|\bcompulsory\b|\bmandatory\b", re.IGNORECASE),
}
_WORD = re.compile(r"[^\W\d_]{3,}")
_BULLET = re.compile(r"^(?:[•▪●*\-–]|\(?(?:\d{1,2}|[a-z])[.)])\s*", re.IGNORECASE)


def _flat(text: str) -> str:
    return " ".join(text.casefold().split())


def _support(values: Iterable[str], text: str) -> float:
    """Confidence that prose came from the document: the share of its words the document contains."""
    words = [word.casefold() for value in values for word in _WORD.findall(value)]
    if not words:
        return 0.0
    vocabulary = {word.casefold() for word in _WORD.findall(text)}
    return round(0.4 + 0.55 * sum(word in vocabulary for word in words) / len(words), 2)


# ==========================================
# Fields: each resolver returns (value, confidence)
# ==========================================


def _resolve_code(answer: SyllabusExtraction, syllabus: ParsedSyllabus, text: str) -> tuple[str | None, float]:
    stated = find_course_codes(syllabus.sections.get("code", "").upper())
    guess = normalize_course_code(answer.code or "")
    if stated:
        return stated[0], 0.98 if guess == stated[0] else 0.85
    if not guess:
        return None, 0.0
    if not is_course_code(guess):
        return guess, 0.2
    return guess, 0.9 if guess in find_course_codes(text) else 0.3


def _resolve_title(answer: SyllabusExtraction, syllabus: ParsedSyllabus, text: str) -> tuple[str | None, float]:
    stated = " ".join(syllabus.sections.get("title", "").split())
    guess = " ".join((answer.title or "").split())
    if stated and not (guess and _flat(guess) in _flat(stated)):
        return stated[:_MAX_TITLE], 0.8
    if not guess:
        return None, 0.0
    # A guess inside the stated title drops a neighbouring form field ("Signals Credits: 3").
    if stated:
        return guess[:_MAX_TITLE], 0.97
    return guess[:_MAX_TITLE], 0.9 if _flat(guess) in _flat(text) else 0.4


def _resolve_credits(answer: SyllabusExtraction, syllabus: ParsedSyllabus) -> tuple[int | None, float]:
    match = re.search(r"\d{1,2}(?:\.\d+)?", syllabus.sections.get("credits", ""))
    stated = float(match.group()) if match else None
    if stated is not None and stated.is_integer() and 1 <= stated <= 12:
        return int(stated), 0.97 if answer.total_credits == stated else 0.8
    if stated is not None:  # Stated, but not a value the catalog accepts; the guess contradicts the document.
        return answer.total_credits, 0.2 if answer.total_credits else 0.0
    return answer.total_credits, 0.6 if answer.total_credits else 0.0


def detect_semester_span(text: str) -> tuple[int | None, int] | None:
    """The (start semester, duration) of a course the document says spans several semesters."""
    for line in text.splitlines():
        match = _SEMESTER_SPAN.search(line)
        if match and not _ALTERNATIVES.search(line):
            start, end = int(match["a"] or match["b"]), int(match["end"])
            if start < end:
                return start, end - start + 1
    return (None, 2) if _YEAR_LONG.search(text) else None


def _resolve_schedule(
    answer: SyllabusExtraction, syllabus: ParsedSyllabus, text: str
) -> tuple[tuple[int, float], tuple[int | None, float]]:
    """Duration and recommended start semester, each with its confidence."""
    stated = syllabus.sections.get("semester", "")
    # A form prints the span as "Semester | 7 and 8".
    span = detect_semester_span(f"semesters {stated}") or detect_semester_span(text)
    if span:
        duration = (span[1], 0.95 if answer.duration_semesters == span[1] else 0.7)
    else:
        duration = (answer.duration_semesters, 0.9 if answer.duration_semesters == 1 else 0.5)

    if span and span[0]:
        return duration, (span[0], 0.95)
    match = re.search(r"(?<!\d)[1-8](?!\d)", stated)
    if match:
        return duration, (int(match.group()), 0.95)
    return duration, (answer.recommended_semester, 0.6 if answer.recommended_semester else 0.0)


def _resolve_type(
    answer: SyllabusExtraction, syllabus: ParsedSyllabus, text: str
) -> tuple[CourseType | None, float]:
    if answer.course_type is None:
        return None, 0.0
    evidence = _TYPE_EVIDENCE[answer.course_type]
    if evidence.search(" ".join(syllabus.sections.get(key, "") for key in ("type", "title", "credits"))):
        return answer.course_type, 0.95
    return answer.course_type, 0.75 if evidence.search(text) else 0.5


def _resolve_contact_hours(
    answer: SyllabusExtraction, syllabus: ParsedSyllabus
) -> tuple[ExtractedContactHours | None, float]:
    hours = syllabus.contact_hours
    if hours:
        score = 0.97 if hours.from_table else 0.9
    elif answer.contact_hours:
        guess = answer.contact_hours
        hours = ParsedContactHours(
            lecture=guess.lecture,
            lab=guess.lab,
            tutorial=guess.tutorial,
            total=guess.total_semester_hours,
            weekly=answer.contact_hours_per_week,
        )
        score = 0.6
    else:
        return None, 0.0

    if hours.weekly:  # Converted on an assumed semester length, so a reviewer must confirm it.
        score -= 0.25
    if hours.total is not None and hours.total != hours.lecture + hours.lab + hours.tutorial:
        score = min(score, 0.6)
    factor = WEEKS_PER_SEMESTER if hours.weekly else 1
    return (
        ExtractedContactHours(
            lecture=round(hours.lecture * factor),
            lab=round(hours.lab * factor),
            tutorial=round(hours.tutorial * factor),
            total_semester_hours=None if hours.total is None else round(hours.total * factor),
        ),
        round(score, 2),
    )


def _resolve_corequisites(
    answer: SyllabusExtraction, syllabus: ParsedSyllabus, code: str | None, text: str
) -> tuple[list[str], float]:
    stated = [item for item in find_course_codes(syllabus.sections.get("corequisites", "").upper()) if item != code]
    if stated:
        return stated, 0.95
    guesses = dict.fromkeys(normalize_course_code(item) for item in answer.corequisites)
    cleaned = [item for item in guesses if is_course_code(item) and item != code]
    if not cleaned:
        return [], 0.9
    return cleaned, 0.8 if set(cleaned) <= set(find_course_codes(text)) else 0.2


def _resolve_objectives(answer: SyllabusExtraction, syllabus: ParsedSyllabus, text: str) -> tuple[list[str], float]:
    candidates = answer.syllabus_objectives or syllabus.sections.get("objectives", "").splitlines()
    cleaned = [_BULLET.sub("", item.strip())[:_MAX_OBJECTIVE].strip() for item in candidates]
    objectives = [item for item in dict.fromkeys(cleaned) if item][:_MAX_OBJECTIVES]
    return objectives, _support(objectives, text)


def _resolve_prerequisite_text(
    answer: SyllabusExtraction, syllabus: ParsedSyllabus, text: str
) -> tuple[str | None, float]:
    stated = " ".join(syllabus.sections.get("prerequisites", "").split())
    if stated:
        return stated, 0.95
    guess = " ".join((answer.prerequisite_text or "").split())
    if guess and _flat(guess) in _flat(text):
        return guess, 0.85
    return None, 0.5  # Nothing stated, or only a paraphrase the document does not contain.


def split_credits(total: int, start: int, duration: int) -> list[ExtractedCreditDistribution]:
    """Split credits evenly over consecutive semesters; earlier semesters take any remainder."""
    base, remainder = divmod(total, duration)
    entries = [(start + offset, base + (offset < remainder)) for offset in range(duration)]
    return [
        ExtractedCreditDistribution(semester_index=index, credits_allocated=credits)
        for index, credits in check_distribution(entries, total, duration, start)
    ]


# ==========================================
# Course assembly
# ==========================================


def build_course(
    answer: SyllabusExtraction, syllabus: ParsedSyllabus, text: str
) -> tuple[ExtractedCourse, dict[str, float]]:
    """Reconcile the model's answer with the parsed document; returns the course and its field confidences."""
    code, code_score = _resolve_code(answer, syllabus, text)
    title, title_score = _resolve_title(answer, syllabus, text)
    total, total_score = _resolve_credits(answer, syllabus)
    (duration, duration_score), (start, start_score) = _resolve_schedule(answer, syllabus, text)
    course_type, type_score = _resolve_type(answer, syllabus, text)
    hours, hours_score = _resolve_contact_hours(answer, syllabus)
    corequisites, corequisites_score = _resolve_corequisites(answer, syllabus, code, text)
    objectives, objectives_score = _resolve_objectives(answer, syllabus, text)
    prerequisite_text, prerequisite_text_score = _resolve_prerequisite_text(answer, syllabus, text)

    description = " ".join((answer.description or syllabus.sections.get("description", "")).split())
    if "offered" in syllabus.sections:
        offered_score = 0.9
    else:
        offered_score = 0.8 if "semester" in syllabus.sections else 0.5

    distribution: list[ExtractedCreditDistribution] = []
    if start and start + duration - 1 > DEFAULT_SEMESTER_COUNT:
        duration_score = min(duration_score, 0.2)  # It cannot fit a program, so the schedule was misread.
    elif start and total:
        distribution = split_credits(total, start, duration)

    course = ExtractedCourse(
        code=code,
        title=title,
        description=description[:_MAX_DESCRIPTION],
        total_credits=total,
        duration_semesters=duration,
        course_type=course_type,
        offered_semesters=list(dict.fromkeys(answer.offered_semesters)),
        recommended_semester=start,
        corequisites=corequisites,
        syllabus_objectives=objectives,
        prerequisite_text=prerequisite_text,
        contact_hours=hours,
        credit_distribution=distribution,
    )
    scores = {
        "code": code_score,
        "title": title_score,
        "description": _support([description], text),
        "totalCredits": total_score,
        "durationSemesters": duration_score,
        "courseType": type_score,
        "offeredSemesters": offered_score if answer.offered_semesters else 0.0,
        "recommendedSemester": start_score,
        "corequisites": corequisites_score,
        "syllabusObjectives": objectives_score,
        "prerequisiteText": prerequisite_text_score,
        "contactHours": hours_score,
        "creditDistribution": min(total_score, duration_score, start_score) if distribution else 0.0,
    }
    return course, scores


class SyllabusPipeline:
    """``ExtractionPipeline`` that parses a document and extracts its course with the language model."""

    def __init__(self, llm: LLMClient) -> None:
        self._llm = llm

    def extract(self, document: bytes, *, filename: str, content_type: str) -> ExtractionResult:
        """Extract course data from a validated upload. Runs in a worker thread (CF-204 background task)."""
        return asyncio.run(self._extract(document, content_type))

    async def _extract(self, document: bytes, content_type: str) -> ExtractionResult:
        await self._llm.check_health()  # Fails fast: OCR of a long scan is wasted without a model.
        syllabus = parse_document(document, content_type)
        text = first_module_text(syllabus.text)
        answer = await generate_structured(self._llm, build_extraction_messages(text), SyllabusExtraction)
        course, scores = build_course(answer, syllabus, text)
        return ExtractionResult(
            extracted_data=course.model_dump(by_alias=True, mode="json"), confidence_scores=scores
        )
