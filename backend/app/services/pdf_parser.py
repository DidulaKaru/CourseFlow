"""Deterministic syllabus parsing (CF-231): document text, labelled sections and contact hours.

``parse_document`` turns an uploaded PDF or DOCX into a ``ParsedSyllabus`` without any model. Pages that carry
almost no text are treated as scans and read with OCR. Every expected failure is an ``ExtractionError``.
"""

import io
import logging
import re
from collections import Counter
from dataclasses import dataclass

from app.services import ocr_service
from app.services.docx_parser import read_docx
from app.services.extraction_contract import DOCX_CONTENT_TYPE, ExtractionError
from app.services.ocr_service import OcrUnavailableError

__all__ = ["ExtractionError", "ParsedContactHours", "ParsedSyllabus", "parse_document", "parse_docx", "parse_pdf"]

logger = logging.getLogger(__name__)

MIN_CHARS_PER_PAGE = 50
# OCR takes seconds per page; a long scan would hold the worker for minutes.
MAX_OCR_PAGES = 20
_EDGE_LINES = 2

Table = list[list[str]]


@dataclass(frozen=True)
class ParsedContactHours:
    """Contact hours exactly as the document states them (``weekly`` says which unit they are in)."""

    lecture: float = 0
    lab: float = 0
    tutorial: float = 0
    total: float | None = None
    weekly: bool = False
    from_table: bool = False


@dataclass(frozen=True)
class ParsedSyllabus:
    """Cleaned text of one document plus the fields that could be located without a model.

    ``sections`` is keyed by ``code``, ``title``, ``credits``, ``semester``, ``prerequisites``, ``corequisites``,
    ``objectives``, ``syllabus``, ``description``, ``type`` and ``offered``; absent sections are not in it.
    """

    text: str
    sections: dict[str, str]
    contact_hours: ParsedContactHours | None
    page_count: int = 1
    ocr_pages: tuple[int, ...] = ()


# ==========================================
# Section labels
# ==========================================

_SECTION_LABELS: dict[str, str] = {
    "code": r"(?:course|module|subject|unit)\s+code",
    "title": r"(?:course|module|subject|unit)\s+(?:title|name)",
    "credits": r"(?:(?:total|no\.?\s+of|number\s+of)\s+)?credits?(?:\s+(?:value|points?|hours?))?",
    "offered": r"(?:semesters?|terms?)\s+offered|offered(?:\s+(?:in|semesters?|terms?))?",
    "semester": r"(?:recommended\s+)?(?:semesters?|terms?)",
    "prerequisites": r"pre[-\s]?requisites?(?:\s*\(s\)|/s)?(?:\s+(?:courses?|modules?))?",
    "corequisites": r"co[-\s]?requisites?(?:\s*\(s\)|/s)?(?:\s+(?:courses?|modules?))?",
    "objectives": (
        r"(?:intended\s+)?(?:course|module|learning)\s+(?:learning\s+)?(?:objectives?|outcomes?|aims?)"
        r"|objectives?"
    ),
    "description": r"(?:(?:course|module|subject)\s+)?(?:description|synopsis|overview)",
    "syllabus": (
        r"(?:(?:course|module|detailed|outline)\s+)?(?:syllabus|contents?)(?:\s+(?:outline|topics?))?"
        r"|(?:course|module)\s+outline|topics?(?:\s+covered)?"
    ),
    "type": r"(?:course|module|subject)\s+(?:type|status|category)",
    # Not extracted, but these end the section before them.
    "other": (
        r"contact\s+hours?|notional\s+hours?|teaching\s+(?:hours?|methods?)|assessments?(?:\s+\w+)?|evaluation"
        r"|references?|(?:recommended\s+)?(?:texts?|textbooks?|reading)|lecturers?|coordinator|department|faculty"
        r"|gpa(?:\s*/\s*ngpa)?|level|academic\s+year"
    ),
}
_SINGLE_LINE = {"code", "title", "credits", "semester", "type", "offered", "other"}
_LABEL = re.compile(
    r"^(?:\d{1,2}[.)]\s*)?(?:"
    + "|".join(f"(?P<{key}>{pattern})" for key, pattern in _SECTION_LABELS.items())
    + r")(?:\s*:\s*(?P<value>.*)|\s+[-–]\s+(?P<dash_value>.*)|\s*)$",
    re.IGNORECASE,
)
# Borderless forms print "Course Code CO221" with no separator. Only values that cannot be prose are accepted.
_UNSEPARATED = re.compile(
    r"^(?:(?P<code>(?:course|module|subject|unit)\s+code)\s+(?P<code_value>[A-Z]{2,4}\s?\d{3,5}[A-Z]?)"
    r"|(?P<title>(?:course|module|subject|unit)\s+(?:title|name))\s+(?P<title_value>\S.*)"
    r"|(?P<credits>(?:(?:total|no\.?\s+of|number\s+of)\s+)?credits?)\s+(?P<credits_value>\d{1,2}(?:\.\d+)?)"
    r"|(?P<semester>semesters?)\s+(?P<semester_value>\d\b.{0,20}))$",
    re.IGNORECASE,
)
_CODE_IN_LINE = re.compile(r"\b[A-Z]{2,4}\s?\d{3,5}[A-Z]?\b")


def _match_label(text: str) -> tuple[str, str] | None:
    """The section a line opens and its inline value, or None when the line is ordinary text."""
    match = _LABEL.match(text.strip())
    if match:
        key = next(key for key in _SECTION_LABELS if match.group(key) is not None)
        return key, (match.group("value") or match.group("dash_value") or "").strip()
    match = _UNSEPARATED.match(text.strip())
    if match:
        key = next(key for key in ("code", "title", "credits", "semester") if match.group(key) is not None)
        return key, match.group(f"{key}_value").strip()
    return None


def _sections_from_lines(lines: list[str]) -> dict[str, str]:
    collected: dict[str, list[str]] = {}
    current: str | None = None
    for line in lines:
        label = _match_label(line)
        if label:
            key, value = label
            # The first module in a handbook wins; a repeated label only ends the previous section.
            current = None if key in collected else key
            if current:
                collected[key] = [value] if value else []
                if value and key in _SINGLE_LINE:
                    current = None
        elif current:
            collected[current].append(line)
            if current in _SINGLE_LINE:
                current = None
    return {key: "\n".join(values) for key, values in collected.items() if key != "other" and values}


def _sections_from_tables(tables: list[Table]) -> dict[str, str]:
    """Read "label | value" pairs, and header rows whose values sit in the row below."""
    found: dict[str, str] = {}
    for table in tables:
        for row_index, row in enumerate(table):
            for column, cell in enumerate(row):
                label = _match_label(cell)
                if label is None or label[0] == "other" or label[0] in found:
                    continue
                key, value = label
                if not value:
                    candidates = [other for other in row[column + 1 :] if other][:1]
                    below = table[row_index + 1] if row_index + 1 < len(table) else []
                    if column < len(below):
                        candidates.append(below[column])
                    value = next((item for item in candidates if item and _match_label(item) is None), "")
                if value:
                    found[key] = value
    return found


# ==========================================
# Contact hours
# ==========================================

_HOUR_KINDS = {
    "lecture": re.compile(r"\blectur", re.IGNORECASE),
    "tutorial": re.compile(r"\btutorial", re.IGNORECASE),
    "lab": re.compile(r"\blab|\bpractical", re.IGNORECASE),
    "total": re.compile(r"\btotal\b", re.IGNORECASE),
}
_WEEKLY = re.compile(r"per\s+week|/\s*(?:week|wk)\b|\bweekly\b|\beach\s+week", re.IGNORECASE)
_NUMBER = re.compile(r"(?<![\d.])\d{1,3}(?:\.\d{1,2})?(?![\d.]|\s*%)")
_HOURS_IN_TEXT = re.compile(
    r"\b(?P<kind>lectures?|tutorials?|lab(?:s|oratory|oratories)?|practicals?|total(?:\s+contact)?)"
    r"(?:\s+(?:hours?|hrs?))?(?:\s*[:=]|\s+[-–])\s*(?P<hours>\d{1,3}(?:\.\d{1,2})?)(?![\d.]|\s*%)",
    re.IGNORECASE,
)


def _hour_kind(cell: str) -> str | None:
    if len(cell) > 40:  # A paragraph that mentions lectures is not a column heading.
        return None
    return next((kind for kind, pattern in _HOUR_KINDS.items() if pattern.search(cell)), None)


def _number(cell: str) -> float | None:
    match = _NUMBER.search(cell)
    return float(match.group()) if match else None


def _is_hours_grid(kinds: set[str]) -> bool:
    return len(kinds) >= 2 and bool(kinds - {"total"})


def _hours_from_table(table: Table) -> ParsedContactHours | None:
    weekly = any(_WEEKLY.search(cell) for row in table for cell in row)

    # Columns are kinds: "Lectures | Tutorials | Labs | Total" above a row of numbers.
    for row_index, row in enumerate(table):
        columns = {column: kind for column, cell in enumerate(row) if (kind := _hour_kind(cell))}
        if not _is_hours_grid(set(columns.values())):
            continue
        for values_row in table[row_index + 1 :]:
            hours = {
                kind: value
                for column, kind in columns.items()
                if column < len(values_row) and (value := _number(values_row[column])) is not None
            }
            if hours:
                return ParsedContactHours(**hours, weekly=weekly, from_table=True)

    # Rows are kinds: "Lectures | 28".
    hours = {}
    for row in table:
        kind = _hour_kind(row[0]) if row else None
        value = next((number for cell in row[1:] if (number := _number(cell)) is not None), None)
        if kind and value is not None:
            hours.setdefault(kind, value)
    if _is_hours_grid(set(hours)):
        return ParsedContactHours(**hours, weekly=weekly, from_table=True)
    return None


def _hours_from_text(lines: list[str]) -> ParsedContactHours | None:
    hours: dict[str, float] = {}
    weekly = False
    for line in lines:
        for match in _HOURS_IN_TEXT.finditer(line):
            kind = _hour_kind(match["kind"])
            if kind and kind not in hours:
                hours[kind] = float(match["hours"])
                weekly = weekly or bool(_WEEKLY.search(line))
    if not hours.keys() - {"total"}:
        return None
    return ParsedContactHours(**hours, weekly=weekly)


def _find_contact_hours(lines: list[str], tables: list[Table]) -> ParsedContactHours | None:
    for table in tables:
        hours = _hours_from_table(table)
        if hours:
            return hours
    return _hours_from_text(lines)


# ==========================================
# Text cleaning
# ==========================================

_PAGE_NUMBER = re.compile(
    r"^(?:page\s*)?[-–(]?\s*\d{1,4}\s*(?:(?:of|/)\s*\d{1,4}\s*)?[-–)]?$", re.IGNORECASE
)
_DISCLAIMER = re.compile(
    r"^disclaimer\b|\ball rights reserved\b|\bsubject to change without (?:prior )?notice\b"
    r"|\bfor internal use only\b|©|^copyright\b",
    re.IGNORECASE,
)


def _header_key(line: str) -> str:
    """Compare running headers ignoring case, spacing and an embedded page number."""
    key = " ".join(line.casefold().split())
    return re.sub(r"\d+", "#", key) if "page" in key else key


def clean_pages(pages: list[list[str]]) -> list[str]:
    """Join page lines, dropping running headers and footers, page numbers and disclaimers.

    A repeated line that names a course or opens a section is kept: a handbook repeats those on purpose.
    """
    stripped = [[line.strip() for line in page if line.strip()] for page in pages]
    edges = [set(range(_EDGE_LINES)) | set(range(len(page) - _EDGE_LINES, len(page))) for page in stripped]
    occurrences = Counter(
        key
        for page, edge in zip(stripped, edges, strict=True)
        for key in {_header_key(page[index]) for index in edge if 0 <= index < len(page)}
    )
    repeats_needed = max(2, (len(stripped) * 3 + 4) // 5)  # At least 60% of the pages.

    cleaned: list[str] = []
    for page, edge in zip(stripped, edges, strict=True):
        for index, line in enumerate(page):
            if _DISCLAIMER.search(line):
                continue
            if index in edge and (
                _PAGE_NUMBER.match(line)
                or (
                    occurrences[_header_key(line)] >= repeats_needed
                    and not _CODE_IN_LINE.search(line)
                    and _match_label(line) is None
                )
            ):
                continue
            cleaned.append(line)
    return cleaned


# ==========================================
# Documents
# ==========================================


def _density(text: str) -> int:
    return len("".join(text.split()))


def _build(
    lines: list[str], tables: list[Table], *, page_count: int = 1, ocr_pages: tuple[int, ...] = ()
) -> ParsedSyllabus:
    if not lines:
        raise ExtractionError("No readable text was found in the document.")
    return ParsedSyllabus(
        text="\n".join(lines),
        # Table cells have unambiguous boundaries, so they win over the same label found in running text.
        sections={**_sections_from_lines(lines), **_sections_from_tables(tables)},
        contact_hours=_find_contact_hours(lines, tables),
        page_count=page_count,
        ocr_pages=ocr_pages,
    )


def parse_pdf(document: bytes) -> ParsedSyllabus:
    """Parse a PDF, reading pages with fewer than ``MIN_CHARS_PER_PAGE`` characters through OCR."""
    try:
        import pdfplumber  # Not installed on the serverless API, which must still start.
    except ImportError:
        raise ExtractionError("Automatic extraction is not available on this server.") from None

    pages: list[list[str]] = []
    tables: list[Table] = []
    ocr_pages: list[int] = []
    ocr_error: OcrUnavailableError | None = None
    try:
        with pdfplumber.open(io.BytesIO(document)) as pdf:
            for page in pdf.pages:
                text = page.extract_text() or ""
                if _density(text) < MIN_CHARS_PER_PAGE and page.objects:
                    if len(ocr_pages) == MAX_OCR_PAGES:
                        raise ExtractionError(
                            f"The document has more than {MAX_OCR_PAGES} scanned pages. "
                            "Upload only the module information sheet."
                        )
                    try:
                        recognized = ocr_service.ocr_page(page)
                    except OcrUnavailableError as error:
                        ocr_error = error  # Other pages may still carry enough text.
                    else:
                        ocr_pages.append(page.page_number)
                        text = recognized if _density(recognized) > _density(text) else text
                pages.append(text.splitlines())
                tables.extend(
                    [[" ".join((cell or "").split()) for cell in row] for row in table]
                    for table in page.extract_tables()
                )
                page.close()  # Releases the page's layout objects; a handbook has hundreds of pages.
    except ExtractionError:
        raise
    except Exception as error:  # pdfminer reports damaged files through many unrelated exception types.
        logger.warning("PDF could not be parsed: %s", type(error).__name__)
        raise ExtractionError("The PDF could not be read. It may be damaged or password protected.") from error

    if ocr_error is not None and all(_density("".join(page)) < MIN_CHARS_PER_PAGE for page in pages):
        raise ocr_error
    return _build(clean_pages(pages), tables, page_count=len(pages), ocr_pages=tuple(ocr_pages))


def parse_docx(document: bytes) -> ParsedSyllabus:
    """Parse a DOCX body."""
    lines, tables = read_docx(document)
    # No pages to clean: running headers and footers are stored outside the DOCX body.
    return _build([line for line in lines if not _DISCLAIMER.search(line)], tables)


def parse_document(document: bytes, content_type: str) -> ParsedSyllabus:
    """Parse an upload already validated by CF-204 as a PDF or DOCX."""
    return parse_docx(document) if content_type == DOCX_CONTENT_TYPE else parse_pdf(document)
