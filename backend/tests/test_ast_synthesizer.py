"""Tests for natural-language prerequisites to AST synthesis (CF-234). The language model is mocked."""

import asyncio
import json
import subprocess
import sys
from pathlib import Path
from typing import Any

import pytest
from app.core.ast_evaluator import (
    MAX_AST_RECURSION_DEPTH,
    evaluate_prerequisite,
    find_rule_issues,
)
from app.main import app
from app.schemas.curriculum import PrerequisiteRule
from app.services.ast_synthesizer import (
    PrerequisiteAnswer,
    SynthesizedPrerequisite,
    normalize_rule,
    score_rule,
    simplify_rule,
    synthesize_prerequisite,
)
from app.services.course_codes import find_course_codes
from app.services.extraction_contract import PDF_CONTENT_TYPE
from app.services.extraction_prompts import PREREQUISITE_EXAMPLES
from app.services.llm_client import LLMCompletion, LLMError, get_llm_client
from fastapi.testclient import TestClient
from pydantic import TypeAdapter
from scripts.seed_db import seed_database
from sqlalchemy.orm import Session

from tests.document_factory import PdfPage, make_pdf

BACKEND_DIR = Path(__file__).resolve().parent.parent
RULE: TypeAdapter[PrerequisiteRule] = TypeAdapter(PrerequisiteRule)
KNOWN = {"CO221", "CO222", "CO223", "EE2201"}


def course(code: str) -> dict[str, Any]:
    return {"type": "COURSE", "courseId": code}


def credits(minimum: int) -> dict[str, Any]:
    return {"type": "CREDIT_THRESHOLD", "minCredits": minimum}


def gate(kind: str, *children: dict[str, Any]) -> dict[str, Any]:
    return {"type": kind, "children": list(children)}


def dump(rule: PrerequisiteRule | None) -> dict[str, Any] | None:
    return None if rule is None else rule.model_dump(by_alias=True, mode="json")


class FakeLLM:
    """Replays prepared answers."""

    def __init__(self, *answers: dict[str, Any] | Exception) -> None:
        self.answers = list(answers)
        self.prompts: list[list[dict[str, str]]] = []

    async def check_health(self) -> None:
        """Always available."""

    async def chat(self, messages: list[dict[str, str]], *, json_schema: dict[str, Any]) -> LLMCompletion:
        self.prompts.append([dict(message) for message in messages])
        answer = self.answers.pop(0)
        if isinstance(answer, Exception):
            raise answer
        return LLMCompletion(json.dumps(answer))


def synthesize(llm: FakeLLM, text: str | None, course_id: str | None = "CO544") -> SynthesizedPrerequisite:
    return asyncio.run(synthesize_prerequisite(llm, text, course_id=course_id, known_course_ids=KNOWN))


# ==========================================
# Synthesis
# ==========================================

PLAN_TEXT = "Students must have passed CO221 and either CO222 or CO223, and earned at least 40 credits"
PLAN_RULE = gate("AND", course("CO221"), gate("OR", course("CO222"), course("CO223")), credits(40))


def test_compound_wording_becomes_a_recursive_rule():
    llm = FakeLLM({"rule": PLAN_RULE})
    result = synthesize(llm, PLAN_TEXT)

    assert dump(result.rule) == PLAN_RULE
    assert result.confidence >= 0.9
    assert PLAN_TEXT in llm.prompts[0][-1]["content"]
    assert evaluate_prerequisite(result.rule, {"CO221", "CO223"}, 40)
    assert not evaluate_prerequisite(result.rule, {"CO221", "CO223"}, 39)


def test_codes_are_standardized_and_redundant_gates_removed():
    llm = FakeLLM({"rule": gate("AND", gate("OR", course(" co 221 ")), course("CO221"), credits(0))})
    result = synthesize(llm, "CO 221")
    assert dump(result.rule) == course("CO221")
    assert result.confidence >= 0.9


@pytest.mark.parametrize("text", ["None", "nil.", "N/A", "-", "No prerequisites", "No pre-requisite required"])
def test_no_prerequisite_wording_needs_no_model(text: str):
    llm = FakeLLM()
    assert synthesize(llm, text) == SynthesizedPrerequisite(None, 0.95)
    assert llm.prompts == []


@pytest.mark.parametrize("text", [None, ""])
def test_unstated_prerequisites_are_uncertain(text: str | None):
    assert synthesize(FakeLLM(), text) == SynthesizedPrerequisite(None, 0.5)


@pytest.mark.parametrize(
    "invalid",
    [
        course("CO544"),
        gate("AND", course("CO221"), course("co 544")),
        gate("OR"),
        {"type": "XOR", "children": [course("CO221")]},
        credits(-5),
    ],
    ids=["self-reference", "nested-self-reference", "empty-gate", "unknown-gate", "negative-credits"],
)
def test_structurally_invalid_answers_are_sent_back(invalid: dict[str, Any]):
    llm = FakeLLM({"rule": invalid}, {"rule": course("CO221")})
    result = synthesize(llm, "CO221")
    assert dump(result.rule) == course("CO221")
    assert len(llm.prompts) == 2


def test_rules_nested_beyond_the_evaluator_limit_are_never_returned():
    rule = course("CO221")
    for _ in range(MAX_AST_RECURSION_DEPTH + 1):
        rule = gate("AND", rule)
    result = synthesize(FakeLLM(*[{"rule": rule}] * 10), "CO221")
    assert result == SynthesizedPrerequisite(None, 0.0)


def test_a_rule_at_the_depth_limit_is_accepted_and_flattened():
    rule = course("CO221")
    for _ in range(MAX_AST_RECURSION_DEPTH):
        rule = gate("AND", rule)
    assert dump(synthesize(FakeLLM({"rule": rule}), "CO221").rule) == course("CO221")


def test_model_failure_keeps_the_document_reviewable():
    failing = FakeLLM(*[LLMError("The language model took too long to answer.")] * 10)
    assert synthesize(failing, "CO221 or CO222") == SynthesizedPrerequisite(None, 0.0)


# ==========================================
# Simplifier
# ==========================================


@pytest.mark.parametrize(
    ("rule", "expected"),
    [
        (gate("AND", course("CO221")), course("CO221")),
        (gate("OR", gate("AND", gate("OR", course("CO221")))), course("CO221")),
        (gate("AND", course("CO221"), gate("AND", course("CO222"), credits(30))),
         gate("AND", course("CO221"), course("CO222"), credits(30))),
        (gate("OR", course("CO221"), course("CO221")), course("CO221")),
        (gate("AND", course("CO221"), credits(0)), course("CO221")),
        (gate("OR", course("CO221"), credits(0)), None),
        (gate("AND", gate("OR", course("CO221"), credits(0)), credits(0)), None),
        (PLAN_RULE, PLAN_RULE),
    ],
    ids=["single-child", "nested-single", "flatten", "duplicate", "and-tautology", "or-tautology", "all-true", "minimal"],
)
def test_simplifier(rule: dict[str, Any], expected: dict[str, Any] | None):
    assert dump(simplify_rule(RULE.validate_python(rule))) == expected


@pytest.mark.parametrize(
    "raw",
    [
        PLAN_RULE,
        gate("OR", gate("AND", course("CO221"), credits(0)), gate("OR", course("CO222"), course("CO222"))),
        gate("AND", gate("AND", course("CO221"), gate("OR", course("CO222"), credits(0))), credits(30)),
    ],
)
def test_simplifying_never_changes_what_a_rule_means(raw: dict[str, Any]):
    rule = RULE.validate_python(raw)
    simplified = simplify_rule(rule)
    assert simplified is None or find_rule_issues(simplified) == []
    for mask in range(8):
        completed = {code for bit, code in enumerate(("CO221", "CO222", "CO223")) if mask >> bit & 1}
        for earned in (0, 29, 30, 40):
            assert evaluate_prerequisite(rule, completed, earned) == evaluate_prerequisite(
                simplified, completed, earned
            )


def test_every_catalog_rule_survives_normalization_unchanged(computer_eng_data: dict, electrical_eng_data: dict):
    for data in (computer_eng_data, electrical_eng_data):
        rules = [c["prerequisiteRule"] for c in data["courses"] if c.get("prerequisiteRule")]
        assert rules
        for raw in rules:
            rule = RULE.validate_python(raw)
            assert normalize_rule(rule) == rule


# ==========================================
# Confidence
# ==========================================


@pytest.mark.parametrize(
    ("text", "rule", "low", "high"),
    [
        (PLAN_TEXT, PLAN_RULE, 0.9, 1.0),
        ("CO221 and CO222", gate("AND", course("CO221"), course("EE2201")), 0.0, 0.3),
        ("CO221", gate("AND", course("CO221"), credits(40)), 0.0, 0.3),
        ("CO221 and CO222", course("CO221"), 0.3, 0.5),
        ("CO221 and 40 credits", course("CO221"), 0.3, 0.5),
        ("CO221 or CO222", gate("AND", course("CO221"), course("CO222")), 0.5, 0.7),
        ("CO221 and CO222", gate("OR", course("CO221"), course("CO222")), 0.5, 0.7),
        ("CO999", course("CO999"), 0.4, 0.5),
        ("CO221 or CO222", None, 0.0, 0.2),
        ("Consent of the lecturer", None, 0.3, 0.5),
    ],
    ids=["faithful", "invented-course", "invented-credits", "lost-course", "lost-credits", "or-read-as-and",
         "and-read-as-or", "not-in-catalog", "ignored", "no-ast-form"],
)
def test_confidence_reflects_how_well_the_wording_supports_the_rule(
    text: str, rule: dict[str, Any] | None, low: float, high: float
):
    parsed = None if rule is None else RULE.validate_python(rule)
    assert low <= score_rule(parsed, text, KNOWN) <= high


@pytest.mark.parametrize(
    ("text", "codes"),
    [
        ("EE 2201, EE2201 and co221", ["EE2201", "CO221"]),
        ("earn 100 credits by 2026", []),
        ("CE3301L or EEE7803", ["CE3301L", "EEE7803"]),
        ("ABCDE1234 and X123", []),
    ],
)
def test_course_codes_are_found_in_text(text: str, codes: list[str]):
    assert find_course_codes(text) == codes


def test_prompt_examples_are_valid_minimal_rules():
    for text, answer in PREREQUISITE_EXAMPLES:
        rule = PrerequisiteAnswer.model_validate(answer).rule
        if rule is not None:
            assert find_rule_issues(rule) == []
            assert simplify_rule(rule) == rule
            assert score_rule(rule, text, find_course_codes(text)) >= 0.9


# ==========================================
# End to end through the CF-204 API
# ==========================================

EE_LINES = [
    "Module Code: EE5999",
    "Module Title: Power Electronics Studio",
    "Module Type: Elective",
    "Credits: 3",
    "Semester: 5",
    "Prerequisites: {prerequisite} and at least 40 credits",
    "Contact hours",
    "Lectures: 28 hours, Practicals: 14 hours",
]
EE_ANSWER = {
    "code": "EE5999", "title": "Power Electronics Studio", "description": "", "totalCredits": 3,
    "durationSemesters": 1, "courseType": "ELECTIVE", "offeredSemesters": ["FALL"], "recommendedSemester": 5,
    "corequisites": [], "syllabusObjectives": [], "contactHours": None, "contactHoursPerWeek": False,
    "prerequisiteText": None,
}


def test_an_uploaded_ee_syllabus_is_extracted_and_committed(
    db_client: TestClient, db_session: Session, reviewer_headers: dict[str, str]
):
    """The whole pipeline behind the API, with only the language model replaced (the CF-222 seam)."""
    seed_database(db_session)
    rule = gate("AND", course("EE2201"), credits(40))
    document = make_pdf(PdfPage(lines=[line.format(prerequisite="EE2201") for line in EE_LINES]))
    llm = FakeLLM(EE_ANSWER, {"rule": rule})
    app.dependency_overrides[get_llm_client] = lambda: llm
    try:
        upload = db_client.post(
            "/api/v1/extraction/upload",
            files={"file": ("EE5999.pdf", document, PDF_CONTENT_TYPE)},
            headers=reviewer_headers,
        )
    finally:
        app.dependency_overrides.pop(get_llm_client, None)
    job_url = f"/api/v1/extraction/jobs/{upload.json()['data']['jobId']}"
    job = db_client.get(job_url, headers=reviewer_headers).json()["data"]

    assert job["status"] == "EXTRACTED", job["errorMessage"]
    data = job["extractedData"]
    assert data["prerequisiteRule"] == rule
    assert job["confidenceScores"]["prerequisiteRule"] >= 0.9
    assert data["contactHours"]["lecture"] == 28

    review = {
        key: data[key]
        for key in ("code", "title", "description", "totalCredits", "durationSemesters", "recommendedSemester",
                    "offeredSemesters", "corequisites", "syllabusObjectives", "contactHours", "creditDistribution",
                    "prerequisiteRule")
    }
    committed = db_client.post(
        f"{job_url}/commit",
        json={**review, "type": data["courseType"], "programId": "electrical-eng"},
        headers=reviewer_headers,
    )
    assert committed.status_code == 200, committed.text
    assert committed.json()["data"]["course"]["prerequisiteRule"] == rule


def test_api_starts_without_the_extraction_libraries():
    """Vercel installs the small root requirements.txt, which has none of them (docs/DEPLOYMENT.md)."""
    script = (
        "import sys\n"
        "for name in ('pdfplumber', 'pytesseract', 'PIL', 'instructor', 'openai'):\n"
        "    sys.modules[name] = None\n"
        "from app.main import app\n"
        "assert any('extraction' in path for path in app.openapi()['paths'])\n"
    )
    result = subprocess.run(
        [sys.executable, "-c", script], cwd=BACKEND_DIR, capture_output=True, text=True, timeout=120, check=False
    )
    assert result.returncode == 0, result.stderr
