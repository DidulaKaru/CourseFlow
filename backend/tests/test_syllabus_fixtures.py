"""CF-223: the committed syllabus fixture library (``tests/fixtures/syllabi/``) against the PDF extraction path.

``test_pdf_parser.py`` (CF-231) builds tiny documents inline. These tests read the real PDF files a reviewer can
open: clean documents must be extracted accurately, scanned pages must go through OCR, and damaged files must fail
with a structured ``ExtractionError`` (a FAILED job), never an unhandled 500.
"""

import shutil
from typing import Any

import pytest
from app.main import app
from app.services import ocr_service
from app.services.extraction_contract import ExtractionError
from app.services.extractor import SyllabusPipeline, detect_semester_span, split_credits
from app.services.llm_client import LLMCompletion, get_llm_client
from app.services.ocr_service import OcrUnavailableError
from app.services.pdf_parser import ParsedSyllabus, parse_pdf
from fastapi.testclient import TestClient

from tests import syllabus_fixtures as fixtures
from tests.syllabus_fixtures import CLEAN, CORRUPTED, SCANNED, SyllabusFixture

PDF = "application/pdf"
ACCURACY_TARGET = 0.95  # CF-223 acceptance: at least 95% of fields right on clean documents.


def read(fixture: SyllabusFixture) -> bytes:
    return (fixtures.FIXTURE_DIR / fixture.filename).read_bytes()


def squash(text: str | None) -> str:
    """Line wraps inside a field are layout, not content."""
    return " ".join((text or "").split())


def field_results(fixture: SyllabusFixture, parsed: ParsedSyllabus) -> list[bool]:
    results = [squash(parsed.sections.get(name)) == value for name, value in fixture.expected.items()]
    if fixture.expected_hours is not None:
        hours = parsed.contact_hours
        results.append(hours is not None and (hours.lecture, hours.lab, hours.tutorial) == fixture.expected_hours)
    return results


# ==========================================
# The library itself
# ==========================================


@pytest.mark.parametrize("fixture", fixtures.ALL, ids=lambda fixture: fixture.filename)
def test_every_fixture_is_committed_and_looks_like_a_pdf(fixture: SyllabusFixture):
    assert read(fixture).startswith(b"%PDF-")


def test_the_library_has_the_five_documents_the_ticket_requires():
    assert {fixture.filename for fixture in fixtures.ALL} == {
        "standard_course.pdf",
        "multi_semester_capstone.pdf",
        "complex_prerequisites.pdf",
        "scanned_page.pdf",
        "corrupted_document.pdf",
    }


@pytest.mark.parametrize("fixture", fixtures.DETERMINISTIC, ids=lambda fixture: fixture.filename)
def test_committed_files_match_their_generator(fixture: SyllabusFixture):
    """Fails when a fixture is edited by hand or its definition changes without re-running the generator."""
    assert read(fixture) == fixture.build(), "run `python -m tests.syllabus_fixtures` from backend/"


# ==========================================
# Clean documents: accuracy
# ==========================================


@pytest.mark.parametrize("fixture", CLEAN, ids=lambda fixture: fixture.filename)
def test_clean_documents_are_extracted_field_for_field(fixture: SyllabusFixture):
    parsed = parse_pdf(read(fixture))

    for name, value in fixture.expected.items():
        assert squash(parsed.sections.get(name)) == value, name
    assert parsed.ocr_pages == ()


def test_parser_reaches_the_accuracy_target_across_the_clean_documents():
    results = [result for fixture in CLEAN for result in field_results(fixture, parse_pdf(read(fixture)))]

    accuracy = sum(results) / len(results)

    assert len(results) >= 15
    assert accuracy >= ACCURACY_TARGET, f"{accuracy:.0%} of fields correct"


def test_standard_course_contact_hours_come_from_the_table():
    hours = parse_pdf(read(CLEAN[0])).contact_hours

    assert hours is not None
    assert (hours.lecture, hours.lab, hours.tutorial, hours.total) == (28, 14, 7, 49)
    assert hours.from_table is True


def test_mixed_and_or_prerequisites_keep_both_clauses_across_the_line_wrap():
    prerequisites = squash(parse_pdf(read(CLEAN[2])).sections["prerequisites"])

    assert prerequisites == "(CE3301 and EE3201) or (CE3302 and 60 credits)"


def test_capstone_spans_two_semesters_and_splits_its_credits_without_duplicating_the_course():
    parsed = parse_pdf(read(CLEAN[1]))

    assert detect_semester_span(parsed.text) == (7, 2)
    assert [(part.semester_index, part.credits_allocated) for part in split_credits(8, 7, 2)] == [(7, 4), (8, 4)]
    assert parsed.text.count("EEE7803") == 1  # One document, one course: never EEE7803_A / EEE7803_B.


# ==========================================
# Scanned page: OCR
# ==========================================


def test_scanned_fixture_has_no_native_text_layer():
    import io

    import pdfplumber

    with pdfplumber.open(io.BytesIO(read(SCANNED))) as pdf:
        assert [(page.extract_text() or "").strip() for page in pdf.pages] == [""]
        assert pdf.pages[0].images


def test_scanned_page_is_read_through_ocr(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(ocr_service, "image_to_text", lambda _image: "\n".join(fixtures.SCANNED_LINES))

    parsed = parse_pdf(read(SCANNED))

    assert parsed.ocr_pages == (1,)
    assert all(field_results(SCANNED, parsed))


def test_scanned_page_without_tesseract_fails_with_a_readable_message(monkeypatch: pytest.MonkeyPatch):
    def unavailable(_image: Any) -> str:
        raise OcrUnavailableError("Scanned documents cannot be read on this server.")

    monkeypatch.setattr(ocr_service, "image_to_text", unavailable)

    with pytest.raises(ExtractionError, match="cannot be read on this server"):
        parse_pdf(read(SCANNED))


@pytest.mark.skipif(shutil.which("tesseract") is None, reason="Tesseract is not installed")
def test_real_tesseract_recognises_the_scanned_fixture():
    parsed = parse_pdf(read(SCANNED))

    assert parsed.ocr_pages == (1,)
    assert "CE3305" in parsed.text


# ==========================================
# Damaged files fail gracefully
# ==========================================


class _UnusedLLM:
    """A model that must never be consulted for a document that could not be read."""

    asked = False  # Class-level so the instance FastAPI builds per request can be inspected.

    async def check_health(self) -> None:
        return None

    async def chat(self, messages: list[dict[str, str]], *, json_schema: dict[str, Any]) -> LLMCompletion:
        type(self).asked = True
        raise AssertionError("The model must not be asked about an unreadable document")


@pytest.fixture(autouse=True)
def reset_model_probe() -> None:
    _UnusedLLM.asked = False


def test_corrupted_fixture_raises_a_structured_extraction_error():
    with pytest.raises(ExtractionError, match="could not be read"):
        parse_pdf(read(CORRUPTED))


def test_the_pipeline_surfaces_the_corrupted_fixture_as_an_extraction_error_without_asking_the_model():
    pipeline = SyllabusPipeline(_UnusedLLM(), lambda: set())

    with pytest.raises(ExtractionError):
        pipeline.extract(read(CORRUPTED), filename=CORRUPTED.filename, content_type=PDF)

    assert _UnusedLLM.asked is False


def test_uploading_the_corrupted_fixture_creates_a_failed_job_not_a_server_error(
    db_client: TestClient, admin_headers: dict[str, str]
):
    app.dependency_overrides[get_llm_client] = _UnusedLLM
    try:
        response = db_client.post(
            "/api/v1/extraction/upload",
            files={"file": (CORRUPTED.filename, read(CORRUPTED), PDF)},
            headers=admin_headers,
        )
        assert response.status_code == 202
        job_id = response.json()["data"]["jobId"]
        job = db_client.get(f"/api/v1/extraction/jobs/{job_id}", headers=admin_headers).json()["data"]
    finally:
        app.dependency_overrides.pop(get_llm_client, None)

    assert job["status"] == "FAILED"
    assert job["errorMessage"] == "The PDF could not be read. It may be damaged or password protected."
    assert job["extractedData"] is None
    assert _UnusedLLM.asked is False


def test_a_pdf_cut_off_at_any_point_never_crashes_the_parser():
    """Whatever byte a download stops at, the outcome is a parsed document or an ExtractionError."""
    document = read(CLEAN[0])
    step = max(len(document) // 40, 1)

    for cut in range(0, len(document), step):
        try:
            parse_pdf(document[:cut])
        except ExtractionError:
            continue


def test_no_fixture_other_than_the_scanned_one_needs_ocr(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(ocr_service, "image_to_text", lambda _image: pytest.fail("OCR must not run"))

    for fixture in CLEAN:
        assert parse_pdf(read(fixture)).ocr_pages == ()
