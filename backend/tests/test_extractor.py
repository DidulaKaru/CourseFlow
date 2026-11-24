"""Tests for schema-constrained extraction and confidence scoring (CF-233). The language model is mocked."""

import asyncio
import json
import sys
from typing import Any

import pytest
from app.schemas.curriculum import CourseType, CourseUpdate
from app.schemas.extraction import ExtractedCourse, SyllabusExtraction
from app.services import course_service
from app.services.extraction_contract import PDF_CONTENT_TYPE, ExtractionError
from app.services.extraction_prompts import EXAMPLES
from app.services.extractor import (
    SyllabusPipeline,
    build_course,
    detect_semester_span,
    split_credits,
)
from app.services.llm_client import (
    LLMCompletion,
    LLMError,
    LLMUnavailableError,
)
from app.services.pdf_parser import first_module_text, parse_docx
from app.services.structured_output import generate_structured

from tests.document_factory import PdfPage, make_docx, make_pdf

CE_LINES = [
    "Course Code: CE3301",
    "Course Title: Digital Signal Processing",
    "Course Type: Core",
    "Credits: 3",
    "Semester: 5",
    "Prerequisites: CE2201 and EE2201",
    "Description:",
    "Discrete time signals and filter design.",
    "Course Objectives:",
    "Analyse discrete time signals.",
    "Design digital filters.",
]
HOURS_TABLE = [["Lectures", "Tutorials", "Labs", "Total Hours"], ["28", "7", "14", "49"]]
CE_ANSWER: dict[str, Any] = {
    "code": "CE3301",
    "title": "Digital Signal Processing",
    "description": "Discrete time signals and filter design.",
    "totalCredits": 3,
    "durationSemesters": 1,
    "courseType": "CORE",
    "offeredSemesters": ["FALL"],
    "recommendedSemester": 5,
    "corequisites": [],
    "syllabusObjectives": ["Analyse discrete time signals.", "Design digital filters."],
    "contactHours": {"lecture": 28, "lab": 14, "tutorial": 7, "totalSemesterHours": 49},
    "contactHoursPerWeek": False,
    "prerequisiteText": "CE2201 and EE2201",
}
CE_PREREQUISITE: dict[str, Any] = {
    "rule": {
        "type": "AND",
        "children": [{"type": "COURSE", "courseId": "CE2201"}, {"type": "COURSE", "courseId": "EE2201"}],
    }
}


class FakeLLM:
    """Replays prepared answers and records what it was asked."""

    def __init__(self, *answers: str | dict[str, Any] | Exception) -> None:
        self.answers = list(answers)
        self.prompts: list[list[dict[str, str]]] = []
        self.schemas: list[dict[str, Any]] = []
        self.healthy = True

    async def check_health(self) -> None:
        if not self.healthy:
            raise LLMUnavailableError("Automatic extraction is not available on this server.")

    async def chat(self, messages: list[dict[str, str]], *, json_schema: dict[str, Any]) -> LLMCompletion:
        self.prompts.append([dict(message) for message in messages])
        self.schemas.append(json_schema)
        answer = self.answers.pop(0)
        if isinstance(answer, Exception):
            raise answer
        return LLMCompletion(answer if isinstance(answer, str) else json.dumps(answer))


def make_pipeline(llm: FakeLLM) -> SyllabusPipeline:
    return SyllabusPipeline(llm, lambda: {"CE2201", "EE2201"})


def ask(llm: FakeLLM, prompt: str = "extract") -> SyllabusExtraction:
    return asyncio.run(generate_structured(llm, [{"role": "user", "content": prompt}], SyllabusExtraction))


def build(
    lines: list[str], tables: list[list[list[str]]] | None = None, **answer: Any
) -> tuple[ExtractedCourse, dict[str, float]]:
    """Reconcile a (partial) model answer with a document made of ``lines``; unset answers are "not stated"."""
    syllabus = parse_docx(make_docx(lines, tables or []))
    return build_course(SyllabusExtraction.model_validate(answer), syllabus, first_module_text(syllabus.text))


# ==========================================
# Structured output
# ==========================================


def test_the_model_is_constrained_to_a_schema_requiring_every_field():
    llm = FakeLLM(CE_ANSWER)
    assert ask(llm).model_dump() == SyllabusExtraction.model_validate(CE_ANSWER).model_dump()
    assert set(llm.schemas[0]["required"]) == set(CE_ANSWER)


@pytest.mark.parametrize(
    "invalid",
    ["not json at all", {**CE_ANSWER, "totalCredits": 40}, {**CE_ANSWER, "courseType": "SEMINAR"}],
    ids=["not-json", "credits-out-of-range", "unknown-type"],
)
def test_an_invalid_answer_is_retried_with_the_validation_errors(invalid: str | dict[str, Any]):
    llm = FakeLLM(invalid, CE_ANSWER)
    assert ask(llm).total_credits == 3
    assert len(llm.prompts) == 2
    assert len(llm.prompts[1]) > len(llm.prompts[0]), "the retry must explain what was wrong"


def test_persistently_invalid_answers_become_a_readable_error():
    with pytest.raises(LLMError, match="could not read this document reliably"):
        ask(FakeLLM(*["nope"] * 10))


def test_transport_errors_keep_their_own_message():
    with pytest.raises(LLMError, match="too long to answer"):
        ask(FakeLLM(*[LLMError("The language model took too long to answer.")] * 10))


def test_document_text_is_never_rendered_as_a_template():
    llm = FakeLLM("invalid", CE_ANSWER)
    ask(llm, "Course {{ 7 * 7 }} {% raw %}")
    assert all(prompt[0]["content"] == "Course {{ 7 * 7 }} {% raw %}" for prompt in llm.prompts)


def test_missing_instructor_is_reported_readably(monkeypatch: pytest.MonkeyPatch):
    """The serverless API does not install instructor and must not crash."""
    monkeypatch.setitem(sys.modules, "instructor", None)
    with pytest.raises(LLMUnavailableError, match="not available"):
        ask(FakeLLM(CE_ANSWER))


def test_prompt_examples_answer_the_extraction_schema():
    for _, answer in EXAMPLES:
        parsed = SyllabusExtraction.model_validate(answer)
        assert parsed.model_dump(by_alias=True, mode="json").keys() == answer.keys()


# ==========================================
# Pipeline
# ==========================================


def test_pipeline_extracts_a_ce_course_with_high_confidence():
    llm = FakeLLM(CE_ANSWER, CE_PREREQUISITE)
    document = make_pdf(PdfPage(lines=CE_LINES, tables=[HOURS_TABLE]))

    result = make_pipeline(llm).extract(document, filename="CE3301.pdf", content_type=PDF_CONTENT_TYPE)

    data = result.extracted_data
    assert data["code"] == "CE3301"
    assert data["totalCredits"] == 3
    assert data["courseType"] == "CORE"
    assert data["contactHours"] == {"lecture": 28, "lab": 14, "tutorial": 7, "totalSemesterHours": 49}
    assert data["creditDistribution"] == [{"semesterIndex": 5, "creditsAllocated": 3}]
    assert data["prerequisiteText"] == "CE2201 and EE2201"
    assert data["prerequisiteRule"] == CE_PREREQUISITE["rule"]
    for field in ("code", "title", "totalCredits", "contactHours", "recommendedSemester", "creditDistribution",
                  "prerequisiteRule"):
        assert result.confidence_scores[field] >= 0.9, field
    assert "CE3301" in llm.prompts[0][-1]["content"]


def test_every_extracted_field_has_a_confidence_score():
    result = make_pipeline(FakeLLM(CE_ANSWER, CE_PREREQUISITE)).extract(
        make_pdf(PdfPage(lines=CE_LINES)), filename="x.pdf", content_type=PDF_CONTENT_TYPE
    )
    assert result.confidence_scores.keys() == result.extracted_data.keys()
    assert all(0.0 <= score <= 1.0 for score in result.confidence_scores.values())


def test_extracted_data_commits_through_the_admin_contract():
    """Renaming courseType and dropping the reviewer hints must leave a valid CourseUpdate body."""
    data = make_pipeline(FakeLLM(CE_ANSWER, CE_PREREQUISITE)).extract(
        make_pdf(PdfPage(lines=CE_LINES, tables=[HOURS_TABLE])), filename="x.pdf", content_type=PDF_CONTENT_TYPE
    ).extracted_data
    body = {key: value for key, value in data.items() if key not in ("courseType", "prerequisiteText", "prerequisiteRule")}
    update = CourseUpdate.model_validate({**body, "type": data["courseType"]})
    assert update.type is CourseType.CORE
    assert update.contact_hours is not None and update.contact_hours.lecture == 28


def test_pipeline_checks_the_model_before_parsing():
    llm = FakeLLM()
    llm.healthy = False
    with pytest.raises(ExtractionError, match="not available"):
        make_pipeline(llm).extract(b"%PDF-broken", filename="x.pdf", content_type=PDF_CONTENT_TYPE)


def test_pipeline_reports_a_damaged_document_without_asking_the_model():
    llm = FakeLLM()
    with pytest.raises(ExtractionError):
        make_pipeline(llm).extract(b"%PDF-broken", filename="x.pdf", content_type=PDF_CONTENT_TYPE)
    assert llm.prompts == []


def test_a_handbook_only_sends_its_first_module():
    llm = FakeLLM(CE_ANSWER, CE_PREREQUISITE)
    second = ["Course Code: CE4401", "Course Title: Robotics", "Semesters 7 and 8", "Kinematics and control. " * 3]
    document = make_pdf(PdfPage(lines=CE_LINES), PdfPage(lines=second))

    data = make_pipeline(llm).extract(document, filename="x.pdf", content_type=PDF_CONTENT_TYPE).extracted_data

    assert "Robotics" not in llm.prompts[0][-1]["content"]
    assert data["durationSemesters"] == 1


def test_a_code_repeated_on_every_page_does_not_split_the_module():
    text = "Course Code: CE3301\nPage one\nCourse Code: CE 3301\nPage two"
    assert first_module_text(text) == text


# ==========================================
# Multi-semester courses
# ==========================================


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("Final Year Project spanning terms 7 and 8 with 6 total credits", (7, 2)),
        ("Conducted in semesters 7 & 8", (7, 2)),
        ("Semester 7 and Semester 8", (7, 2)),
        ("Runs over semesters 5 to 8", (5, 4)),
        ("A year-long industrial project", (None, 2)),
        ("Delivered over two semesters", (None, 2)),
        ("Offered in semesters 1 and 2", None),
        ("Semester 1 - 3 credits", None),
        ("Semester 5", None),
        ("Semesters 8 and 7", None),
    ],
)
def test_detects_semester_spans(text: str, expected: tuple[int | None, int] | None):
    assert detect_semester_span(text) == expected


def test_an_ee_capstone_splits_its_credits_evenly():
    course, scores = build(
        [
            "Module Code: EEE7803",
            "Module Title: Undergraduate Project",
            "Credits: 8",
            "Undergraduate project spanning semesters 7 and 8.",
        ],
        code="EEE7803", title="Undergraduate Project", totalCredits=8, durationSemesters=2, courseType="CAPSTONE",
    )
    assert course.duration_semesters == 2
    assert course.recommended_semester == 7
    assert [(d.semester_index, d.credits_allocated) for d in course.credit_distribution] == [(7, 4), (8, 4)]
    assert course.course_type is CourseType.CAPSTONE
    assert scores["durationSemesters"] >= 0.9
    assert scores["creditDistribution"] >= 0.9


def test_a_span_in_a_semester_form_field_is_detected():
    course, _ = build(["Credits: 6"], [[["Semester", "7 and 8"]]], totalCredits=6, durationSemesters=2)
    assert [(d.semester_index, d.credits_allocated) for d in course.credit_distribution] == [(7, 3), (8, 3)]


def test_the_document_overrides_a_missed_span_with_lower_confidence():
    course, scores = build(["Project spanning semesters 7 and 8"], totalCredits=6, durationSemesters=1)
    assert course.duration_semesters == 2
    assert scores["durationSemesters"] < 0.9


@pytest.mark.parametrize(
    ("total", "duration", "expected"),
    [(6, 2, [(7, 3), (8, 3)]), (7, 2, [(7, 4), (8, 3)]), (1, 2, [(7, 1), (8, 0)])],
)
def test_credit_splits_satisfy_the_admin_distribution_rule(
    total: int, duration: int, expected: list[tuple[int, int]]
):
    entries = [(d.semester_index, d.credits_allocated) for d in split_credits(total, 7, duration)]
    assert entries == expected
    assert course_service.check_distribution(entries, total, duration, 7) == expected


def test_a_schedule_beyond_the_program_gets_no_distribution():
    course, scores = build(["Body"], totalCredits=6, durationSemesters=2, recommendedSemester=8)
    assert course.credit_distribution == []
    assert scores["durationSemesters"] <= 0.2
    assert scores["creditDistribution"] == 0.0


# ==========================================
# Contact hours
# ==========================================


def test_weekly_hours_are_converted_to_semester_hours_with_lower_confidence():
    table = [["Hours per week", "Lectures", "Tutorials", "Labs"], ["", "2", "0.5", "1"]]
    course, scores = build(CE_LINES, [table])
    assert course.contact_hours is not None
    assert course.contact_hours.model_dump() == {
        "lecture": 28, "tutorial": 7, "lab": 14, "total_semester_hours": None
    }
    assert 0.7 <= scores["contactHours"] < 0.9


def test_parsed_hours_override_the_model():
    course, _ = build(CE_LINES, [HOURS_TABLE], contactHours={"lecture": 99})
    assert course.contact_hours is not None and course.contact_hours.lecture == 28


def test_model_hours_are_low_confidence_and_respect_their_unit():
    course, scores = build(["Body"], contactHours={"lecture": 2}, contactHoursPerWeek=True)
    assert course.contact_hours is not None and course.contact_hours.lecture == 28
    assert scores["contactHours"] < 0.5


def test_a_total_that_does_not_add_up_lowers_confidence():
    _, scores = build(CE_LINES, [[["Lectures", "Labs", "Total"], ["28", "14", "150"]]])
    assert scores["contactHours"] <= 0.6


# ==========================================
# Confidence scores
# ==========================================


@pytest.mark.parametrize(
    ("lines", "answer", "value", "low", "high"),
    [
        (["Course Code: CE 3301"], "CE3301", "CE3301", 0.9, 1.0),
        (["Course Code: CE3301"], "CE9999", "CE3301", 0.7, 0.9),
        (["About ee 2201 and EE2202R"], "EE2202R", "EE2202R", 0.9, 1.0),
        (["No code here"], "CE3301", "CE3301", 0.0, 0.5),
        (["No code here"], "Signals 101", "SIGNALS101", 0.0, 0.3),
        (["No code here"], None, None, 0.0, 0.0),
    ],
    ids=["agrees", "document-wins", "in-text", "invented", "bad-pattern", "missing"],
)
def test_code_confidence(lines: list[str], answer: str | None, value: str | None, low: float, high: float):
    course, scores = build(lines, code=answer)
    assert course.code == value
    assert low <= scores["code"] <= high


@pytest.mark.parametrize(
    ("lines", "answer", "value", "low", "high"),
    [
        (["Credits: 3"], 3, 3, 0.9, 1.0),
        (["Credits: 3.0"], 3, 3, 0.9, 1.0),
        (["Credits: 3"], 4, 3, 0.7, 0.9),
        (["Credits: 3"], None, 3, 0.7, 0.9),
        (["Credits: 15"], 5, 5, 0.0, 0.3),
        (["Body"], 3, 3, 0.5, 0.7),
        (["Body"], None, None, 0.0, 0.0),
    ],
    ids=["agrees", "decimal", "document-wins", "model-missed", "out-of-range", "model-only", "missing"],
)
def test_credit_confidence(lines: list[str], answer: int | None, value: int | None, low: float, high: float):
    course, scores = build(lines, totalCredits=answer)
    assert course.total_credits == value
    assert low <= scores["totalCredits"] <= high


def test_a_title_that_swallowed_a_neighbouring_field_uses_the_clean_one():
    course, scores = build(["Course Title: Circuit Theory Level: 2"], title="Circuit Theory")
    assert course.title == "Circuit Theory"
    assert scores["title"] >= 0.9


def test_invented_prose_scores_below_copied_prose():
    _, copied = build(CE_LINES, description="Discrete time signals and filter design.")
    _, invented = build(CE_LINES, description="Quantum cryptography for marine biology students.")
    assert copied["description"] >= 0.9
    assert invented["description"] < 0.7


def test_invented_corequisites_score_low_and_self_references_are_dropped():
    course, scores = build(["Course Code: CE3301"], code="CE3301", corequisites=["CE 3301", "EE9999", "maths"])
    assert course.corequisites == ["EE9999"]
    assert scores["corequisites"] < 0.5


def test_a_paraphrased_prerequisite_is_not_presented_as_document_text():
    course, _ = build(["Students need CE2201 first."], prerequisiteText="Completion of Data Structures")
    assert course.prerequisite_text is None


def test_objectives_are_cleaned_and_limited_to_the_admin_contract():
    course, _ = build(["Body"], syllabusObjectives=["1. Design filters", "Design filters", " ", "x" * 5_000] + [
        f"Objective {n}" for n in range(100)
    ])
    assert course.syllabus_objectives[0] == "Design filters"
    assert len(course.syllabus_objectives) == 50
    assert max(map(len, course.syllabus_objectives)) == 1_000


def test_an_empty_answer_yields_an_empty_course_with_no_confidence():
    course, scores = build(["Body text without any facts"])
    assert course.code is None and course.title is None and course.contact_hours is None
    for field in ("code", "title", "totalCredits", "courseType", "contactHours", "creditDistribution"):
        assert scores[field] == 0.0
