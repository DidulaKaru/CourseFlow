"""Unit tests for deterministic syllabus parsing (CF-231): text, sections, contact hours, OCR and failures."""

import shutil
import sys

import pytest
from app.services import extraction_service, ocr_service, pdf_parser
from app.services.extraction_contract import DOCX_CONTENT_TYPE, PDF_CONTENT_TYPE
from app.services.ocr_service import OcrUnavailableError
from app.services.pdf_parser import (
    ExtractionError,
    ParsedContactHours,
    clean_pages,
    parse_document,
    parse_docx,
    parse_pdf,
)

from tests.document_factory import PdfPage, make_docx, make_pdf, make_scanned_pdf

CE_LINES = [
    "Module Information Sheet",
    "Course Code: CE3301",
    "Course Title: Digital Signal Processing",
    "Credits: 3",
    "Prerequisites: Students must have passed CE2201 and",
    "either EE2201 or EE2202.",
    "Course Objectives",
    "Analyse discrete-time signals.",
    "Design FIR and IIR filters.",
    "Syllabus:",
    "Sampling, z-transform, filter design.",
    "Assessment:",
    "Final examination 60%",
]
HOURS_TABLE = [["Lectures", "Tutorials", "Labs/Practical", "Total Hours"], ["28", "7", "14", "49"]]


# ==========================================
# Text and sections
# ==========================================


def test_extracts_labelled_sections_from_a_ce_pdf():
    syllabus = parse_pdf(make_pdf(PdfPage(lines=CE_LINES)))

    assert syllabus.sections["code"] == "CE3301"
    assert syllabus.sections["title"] == "Digital Signal Processing"
    assert syllabus.sections["credits"] == "3"
    assert syllabus.sections["prerequisites"] == (
        "Students must have passed CE2201 and\neither EE2201 or EE2202."
    )
    assert syllabus.sections["objectives"] == "Analyse discrete-time signals.\nDesign FIR and IIR filters."
    assert syllabus.sections["syllabus"] == "Sampling, z-transform, filter design."
    assert "Final examination" not in "".join(syllabus.sections.values())
    assert syllabus.ocr_pages == ()


def test_extracts_fields_from_an_ee_form_table():
    table = [
        ["Module Code", "EEE7803", "Credits", "8"],
        ["Module Title", "Undergraduate Project"],
        ["Semester", "7 and 8"],
        ["Pre-requisites", "EE6105"],
    ]
    syllabus = parse_pdf(make_pdf(PdfPage(lines=["Department of Electrical Engineering"] * 3, tables=[table])))

    assert syllabus.sections["code"] == "EEE7803"
    assert syllabus.sections["credits"] == "8"
    assert syllabus.sections["title"] == "Undergraduate Project"
    assert syllabus.sections["semester"] == "7 and 8"
    assert syllabus.sections["prerequisites"] == "EE6105"


def test_reads_values_below_a_header_row():
    syllabus = parse_docx(
        make_docx(tables=[[["Course Code", "Course Title", "Credits"], ["EE2201", "Circuit Theory", "3"]]])
    )
    assert syllabus.sections == {"code": "EE2201", "title": "Circuit Theory", "credits": "3"}


def test_borderless_form_without_separators():
    syllabus = parse_pdf(make_pdf(PdfPage(lines=["Course Code CE 2201", "Course Title Data Structures", "Credits 3",
                                                 "Credits are awarded after the final examination."])))
    assert syllabus.sections["code"] == "CE 2201"
    assert syllabus.sections["title"] == "Data Structures"
    assert syllabus.sections["credits"] == "3"


def test_handbook_keeps_the_first_module():
    syllabus = parse_pdf(
        make_pdf(
            PdfPage(lines=["Course Code: CE2201", "Course Title: Data Structures", "Description:", "Lists and trees." * 4]),
            PdfPage(lines=["Course Code: CE2302", "Course Title: Algorithms", "Description:", "Complexity theory." * 4]),
        )
    )
    assert syllabus.page_count == 2
    assert syllabus.sections["code"] == "CE2201"
    assert syllabus.sections["title"] == "Data Structures"
    assert "Complexity" not in syllabus.sections["description"]


# ==========================================
# Contact hours
# ==========================================


@pytest.mark.parametrize(
    "table",
    [
        HOURS_TABLE,
        [["Activity", "Hours"], ["Lectures", "28"], ["Tutorials", "7"], ["Laboratory", "14"], ["Total", "49"]],
    ],
    ids=["kinds-as-columns", "kinds-as-rows"],
)
def test_reads_contact_hours_tables(table: list[list[str]]):
    syllabus = parse_pdf(make_pdf(PdfPage(lines=CE_LINES, tables=[table])))
    assert syllabus.contact_hours == ParsedContactHours(lecture=28, tutorial=7, lab=14, total=49, from_table=True)


def test_weekly_contact_hours_keep_their_unit_and_fractions():
    table = [["Hours per week", "Lectures", "Tutorials", "Practicals"], ["", "2", "0.5", "1"]]
    syllabus = parse_docx(make_docx(CE_LINES, [table]))
    assert syllabus.contact_hours == ParsedContactHours(lecture=2, tutorial=0.5, lab=1, weekly=True, from_table=True)


def test_contact_hours_fall_back_to_running_text():
    syllabus = parse_docx(make_docx(["Lectures: 28 hours, Tutorials: 7 hours, Practicals: 14 hours"]))
    assert syllabus.contact_hours == ParsedContactHours(lecture=28, tutorial=7, lab=14)


def test_assessment_percentages_are_not_contact_hours():
    table = [["Assessment", "Weight"], ["Lab reports", "20%"], ["Tutorial quizzes", "10%"]]
    syllabus = parse_docx(make_docx(["Labs: 20%", "Tutorials: 10%"], [table]))
    assert syllabus.contact_hours is None


# ==========================================
# Text cleaning
# ==========================================


def test_strips_running_headers_page_numbers_and_disclaimers():
    body = "This course introduces the analysis of discrete-time signals and systems."
    pages = [
        PdfPage(lines=["University Faculty Handbook", f"{body} Part {n}.",
                       "Content is subject to change without notice.", f"Page {n} of 3"])
        for n in (1, 2, 3)
    ]
    text = parse_pdf(make_pdf(*pages)).text
    assert text.splitlines() == [f"{body} Part {n}." for n in (1, 2, 3)]


def test_repeated_course_code_header_survives_cleaning():
    pages = [["CE3301 Digital Signal Processing", f"Body text {n}", "more", "end"] for n in (1, 2, 3)]
    assert "CE3301 Digital Signal Processing" in clean_pages(pages)


def test_numbers_inside_a_page_are_not_mistaken_for_page_numbers():
    assert clean_pages([["Title", "Subtitle", "3", "Body", "Footer"]]) == ["Title", "Subtitle", "3", "Body", "Footer"]


# ==========================================
# OCR fallback
# ==========================================


def test_scanned_pages_are_read_with_ocr(monkeypatch: pytest.MonkeyPatch):
    sizes: list[tuple[int, int]] = []

    def recognize(image) -> str:
        sizes.append(image.size)
        return "\n".join(CE_LINES)

    monkeypatch.setattr(ocr_service, "image_to_text", recognize)

    syllabus = parse_pdf(make_scanned_pdf())

    assert syllabus.ocr_pages == (1,)
    assert syllabus.sections["code"] == "CE3301"
    assert sizes[0][1] > 1_500, "the page must be rendered at a resolution OCR can read"


def test_pages_with_native_text_do_not_use_ocr(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(ocr_service, "image_to_text", lambda _: pytest.fail("OCR must not run"))
    assert parse_pdf(make_pdf(PdfPage(lines=CE_LINES))).ocr_pages == ()


def test_blank_pages_are_skipped_without_ocr(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(ocr_service, "image_to_text", lambda _: pytest.fail("OCR must not run"))
    assert parse_pdf(make_pdf(PdfPage(lines=CE_LINES), PdfPage())).page_count == 2


def test_a_sparse_page_is_tolerated_when_ocr_is_missing(monkeypatch: pytest.MonkeyPatch):
    def unavailable(_image) -> str:
        raise OcrUnavailableError("Scanned documents cannot be read on this server.")

    monkeypatch.setattr(ocr_service, "image_to_text", unavailable)
    syllabus = parse_pdf(make_pdf(PdfPage(lines=CE_LINES), PdfPage(lines=["Approved by Senate"])))
    assert syllabus.sections["code"] == "CE3301"
    assert "Approved by Senate" in syllabus.text


def test_a_fully_scanned_document_fails_readably_when_ocr_is_missing(monkeypatch: pytest.MonkeyPatch):
    def unavailable(_image) -> str:
        raise OcrUnavailableError("Scanned documents cannot be read on this server.")

    monkeypatch.setattr(ocr_service, "image_to_text", unavailable)
    with pytest.raises(ExtractionError, match="cannot be read on this server"):
        parse_pdf(make_scanned_pdf())


def test_too_many_scanned_pages_are_rejected(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(pdf_parser, "MAX_OCR_PAGES", 2)
    monkeypatch.setattr(ocr_service, "image_to_text", lambda _: "text " * 20)
    with pytest.raises(ExtractionError, match="more than 2 scanned pages"):
        parse_pdf(make_scanned_pdf(page_count=3))


def test_missing_tesseract_is_reported_as_unavailable(monkeypatch: pytest.MonkeyPatch):
    pytesseract = pytest.importorskip("pytesseract")
    monkeypatch.setattr(pytesseract.pytesseract, "tesseract_cmd", "no-such-tesseract-binary")
    with pytest.raises(OcrUnavailableError):
        parse_pdf(make_scanned_pdf())


def test_tesseract_failures_become_extraction_errors(monkeypatch: pytest.MonkeyPatch):
    pytesseract = pytest.importorskip("pytesseract")

    def time_out(*_args, **_kwargs) -> str:
        raise RuntimeError("Tesseract process timeout")

    monkeypatch.setattr(pytesseract, "image_to_string", time_out)
    with pytest.raises(ExtractionError, match="Text recognition failed"):
        parse_pdf(make_scanned_pdf())


@pytest.mark.skipif(shutil.which("tesseract") is None, reason="Tesseract is not installed")
def test_real_tesseract_reads_a_scanned_sheet():
    syllabus = parse_pdf(make_scanned_pdf("Course Code: CE3301\nCourse Title: Digital Signal Processing\nCredits: 3"))
    assert "CE3301" in syllabus.text


# ==========================================
# Failures and dispatch
# ==========================================


@pytest.mark.parametrize(
    "document",
    [b"%PDF-1.7\n% truncated", b"%PDF-1.4\n" + b"\x00\xff" * 400, make_pdf(PdfPage(lines=CE_LINES))[:200]],
    ids=["header-only", "garbage", "truncated"],
)
def test_corrupted_pdfs_raise_extraction_errors(document: bytes):
    with pytest.raises(ExtractionError):
        parse_pdf(document)


@pytest.mark.parametrize(
    "document",
    [
        b"PK\x03\x04 not really a zip",
        make_docx(["text"])[:120],
        make_docx(["text"], prolog='<!DOCTYPE x [<!ENTITY a "aaaa">]>'),
        make_docx([]),
    ],
    ids=["not-a-zip", "truncated", "doctype", "empty-body"],
)
def test_corrupted_docx_files_raise_extraction_errors(document: bytes):
    with pytest.raises(ExtractionError):
        parse_docx(document)


def test_a_docx_that_unpacks_to_a_huge_body_is_rejected(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr("app.services.docx_parser._MAX_BODY_BYTES", 1_000)
    with pytest.raises(ExtractionError, match="too large"):
        parse_docx(make_docx(["a" * 2_000]))


def test_missing_pdf_library_is_reported_readably(monkeypatch: pytest.MonkeyPatch):
    """The serverless API does not install pdfplumber and must not crash."""
    monkeypatch.setitem(sys.modules, "pdfplumber", None)
    with pytest.raises(ExtractionError, match="not available"):
        parse_pdf(make_pdf(PdfPage(lines=CE_LINES)))


def test_parse_document_dispatches_on_content_type():
    assert parse_document(make_pdf(PdfPage(lines=CE_LINES)), PDF_CONTENT_TYPE).sections["code"] == "CE3301"
    assert parse_document(make_docx(CE_LINES), DOCX_CONTENT_TYPE).sections["code"] == "CE3301"


def test_parser_and_job_service_share_one_extraction_error():
    """CF-204 only turns its own ExtractionError into a FAILED job message."""
    assert pdf_parser.ExtractionError is extraction_service.ExtractionError
