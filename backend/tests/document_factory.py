"""Builds small, deterministic PDF and DOCX documents for parser tests without extra dependencies (CF-231)."""

import io
import zipfile
from collections.abc import Sequence
from dataclasses import dataclass, field
from xml.sax.saxutils import escape

PAGE_WIDTH, PAGE_HEIGHT = 612, 792
_LEFT, _TOP, _LINE_HEIGHT, _FONT_SIZE = 72, 740, 16, 10
_CELL_WIDTH, _CELL_HEIGHT = 110, 20

Rows = Sequence[Sequence[str]]


@dataclass(frozen=True)
class PdfPage:
    """Text lines from the top of the page, then bordered tables below them."""

    lines: Sequence[str] = ()
    tables: Sequence[Rows] = field(default_factory=tuple)


def _draw_text(x: float, y: float, text: str) -> str:
    escaped = text.replace("\\", r"\\").replace("(", r"\(").replace(")", r"\)")
    return f"BT /F1 {_FONT_SIZE} Tf {x} {y} Td ({escaped}) Tj ET"


def _page_content(page: PdfPage) -> bytes:
    commands: list[str] = []
    y = float(_TOP)
    for line in page.lines:
        commands.append(_draw_text(_LEFT, y, line))
        y -= _LINE_HEIGHT
    for table in page.tables:
        y -= _LINE_HEIGHT
        for row in table:
            for column, cell in enumerate(row):
                x = _LEFT + column * _CELL_WIDTH
                commands.append(f"{x} {y - 6} {_CELL_WIDTH} {_CELL_HEIGHT} re S")
                commands.append(_draw_text(x + 4, y, cell))
            y -= _CELL_HEIGHT
    return "\n".join(commands).encode("latin-1")


def make_pdf(*pages: PdfPage) -> bytes:
    """A PDF with native (selectable) text."""
    objects: list[bytes] = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"",  # Page tree, filled in below once the page object numbers are known.
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
    ]
    kids: list[str] = []
    for page in pages:
        content = _page_content(page)
        objects.append(b"<< /Length %d >>\nstream\n%s\nendstream" % (len(content), content))
        objects.append(
            (
                f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 {PAGE_WIDTH} {PAGE_HEIGHT}] "
                f"/Resources << /Font << /F1 3 0 R >> >> /Contents {len(objects)} 0 R >>"
            ).encode()
        )
        kids.append(f"{len(objects)} 0 R")
    objects[1] = f"<< /Type /Pages /Kids [{' '.join(kids)}] /Count {len(kids)} >>".encode()

    output = io.BytesIO()
    output.write(b"%PDF-1.4\n")
    offsets: list[int] = []
    for number, body in enumerate(objects, start=1):
        offsets.append(output.tell())
        output.write(b"%d 0 obj\n%s\nendobj\n" % (number, body))
    xref = output.tell()
    output.write(b"xref\n0 %d\n0000000000 65535 f \n" % (len(objects) + 1))
    for offset in offsets:
        output.write(b"%010d 00000 n \n" % offset)
    output.write(b"trailer\n<< /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF\n" % (len(objects) + 1, xref))
    return output.getvalue()


def make_scanned_pdf(text: str = "", page_count: int = 1) -> bytes:
    """An image-only PDF, as a scanner produces. Pillow is a dependency of pdfplumber."""
    from PIL import Image, ImageDraw

    images = []
    for _ in range(page_count):
        image = Image.new("RGB", (1240, 1754), "white")
        ImageDraw.Draw(image).multiline_text((100, 100), text or "scan", fill="black", font_size=36, spacing=20)
        images.append(image)
    output = io.BytesIO()
    images[0].save(output, format="PDF", save_all=True, append_images=images[1:], resolution=150)
    return output.getvalue()


def make_docx(paragraphs: Sequence[str] = (), tables: Sequence[Rows] = (), *, prolog: str = "") -> bytes:
    """A minimal DOCX whose body is the paragraphs followed by the tables."""

    def paragraph(text: str) -> str:
        return f"<w:p><w:r><w:t>{escape(text)}</w:t></w:r></w:p>"

    def row(cells: Sequence[str]) -> str:
        return "<w:tr>" + "".join(f"<w:tc>{paragraph(cell)}</w:tc>" for cell in cells) + "</w:tr>"

    body = "".join(paragraph(text) for text in paragraphs)
    body += "".join("<w:tbl>" + "".join(row(cells) for cells in table) + "</w:tbl>" for table in tables)
    xml = (
        f'<?xml version="1.0" encoding="UTF-8"?>{prolog}'
        '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
        f"<w:body>{body}</w:body></w:document>"
    )
    output = io.BytesIO()
    with zipfile.ZipFile(output, "w", zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("word/document.xml", xml)
    return output.getvalue()
