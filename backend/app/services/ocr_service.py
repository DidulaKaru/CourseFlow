"""Optical character recognition for scanned syllabus pages (CF-231).

Tesseract is a system binary: the backend Docker image installs it, serverless deployments do not have it.
"""

from typing import TYPE_CHECKING

from app.services.extraction_contract import ExtractionError

if TYPE_CHECKING:
    from pdfplumber.page import Page
    from PIL.Image import Image

_RENDER_DPI = 300
# Caps the bitmap of an oversized page; a 300 dpi A4 page is about 3,500 pixels tall.
_MAX_RENDER_PIXELS = 5_000
_PAGE_TIMEOUT_SECONDS = 60


class OcrUnavailableError(ExtractionError):
    """Text recognition is not installed on this server."""


def image_to_text(image: "Image") -> str:
    """Recognize the text in a page image."""
    try:
        import pytesseract
    except ImportError:
        raise OcrUnavailableError("Scanned documents cannot be read on this server.") from None
    try:
        return pytesseract.image_to_string(image, timeout=_PAGE_TIMEOUT_SECONDS)
    except pytesseract.TesseractNotFoundError:
        raise OcrUnavailableError("Scanned documents cannot be read on this server.") from None
    except RuntimeError:  # TesseractError, or the plain RuntimeError pytesseract raises on timeout.
        raise ExtractionError("Text recognition failed on a scanned page. Try a clearer scan.") from None


def ocr_page(page: "Page") -> str:
    """Render one PDF page and recognize its text."""
    longest_side_inches = max(float(page.width), float(page.height), 1.0) / 72
    resolution = min(_RENDER_DPI, _MAX_RENDER_PIXELS / longest_side_inches)
    return image_to_text(page.to_image(resolution=resolution).original)
