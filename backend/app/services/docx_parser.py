"""Plain text and tables from a DOCX file (CF-231).

A DOCX is a ZIP whose ``word/document.xml`` holds the body; reading paragraphs and tables from it needs only
the standard library. Headers, footers and footnotes live in other parts, so they are excluded by construction.
"""

import io
import zipfile
import zlib
from xml.etree import ElementTree

from app.services.extraction_contract import ExtractionError

_WORD = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
# A 15 MB upload can decompress to gigabytes; real syllabus bodies are far below this.
_MAX_BODY_BYTES = 20 * 1024 * 1024
_UNREADABLE = "The DOCX could not be read. It may be damaged or password protected."

Table = list[list[str]]


def _text_of(element: ElementTree.Element) -> str:
    parts: list[str] = []
    for node in element.iter():
        if node.tag == f"{_WORD}t":
            parts.append(node.text or "")
        elif node.tag == f"{_WORD}tab":
            parts.append(" ")
        elif node.tag in (f"{_WORD}br", f"{_WORD}cr"):
            parts.append("\n")
    return "".join(parts).strip()


def _cell_text(cell: ElementTree.Element) -> str:
    paragraphs = (_text_of(paragraph) for paragraph in cell.iter(f"{_WORD}p"))
    return " ".join(" ".join(paragraphs).split())


def _read_body(document: bytes) -> ElementTree.Element:
    try:
        with zipfile.ZipFile(io.BytesIO(document)) as archive, archive.open("word/document.xml") as part:
            xml = part.read(_MAX_BODY_BYTES + 1)
    # KeyError: no document part. RuntimeError: encrypted or an unsupported compression method.
    except (zipfile.BadZipFile, zlib.error, KeyError, RuntimeError, EOFError) as error:
        raise ExtractionError(_UNREADABLE) from error
    if len(xml) > _MAX_BODY_BYTES:
        raise ExtractionError("The DOCX is too large to process once unpacked.")
    # Word never writes a DTD; refusing one rules out entity-expansion attacks.
    if b"<!DOCTYPE" in xml:
        raise ExtractionError(_UNREADABLE)
    try:
        body = ElementTree.fromstring(xml).find(f"{_WORD}body")
    except ElementTree.ParseError as error:
        raise ExtractionError(_UNREADABLE) from error
    if body is None:
        raise ExtractionError(_UNREADABLE)
    return body


def read_docx(document: bytes) -> tuple[list[str], list[Table]]:
    """Return the body's text lines (table rows joined with `` | ``) and its tables, in document order."""
    lines: list[str] = []
    tables: list[Table] = []
    for block in _read_body(document):
        if block.tag == f"{_WORD}p":
            lines.extend(_text_of(block).splitlines())
        elif block.tag == f"{_WORD}tbl":
            table = [[_cell_text(cell) for cell in row.iter(f"{_WORD}tc")] for row in block.iter(f"{_WORD}tr")]
            tables.append(table)
            lines.extend(" | ".join(cell for cell in row if cell) for row in table)
    return [line.strip() for line in lines if line.strip()], tables
