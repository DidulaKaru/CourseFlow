"""Types shared by every stage of MIS extraction (CF-204, CF-231 to CF-234).

Kept apart from ``extraction_service`` so the parser, LLM client and extractor can raise ``ExtractionError``
without importing the job lifecycle that depends on them.
"""

from dataclasses import dataclass
from typing import Any, Protocol

PDF_CONTENT_TYPE = "application/pdf"
DOCX_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"


class ExtractionError(Exception):
    """A document could not be turned into course data; its job becomes FAILED with this message.

    The CF-231 parser and CF-233/234 extractors raise this (or a subclass) for expected failures, so the
    message must be readable by faculty staff and free of internal detail.
    """


@dataclass(frozen=True)
class ExtractionResult:
    """What a pipeline extracted from one document."""

    extracted_data: dict[str, Any]
    confidence_scores: dict[str, float]

    def __post_init__(self) -> None:
        out_of_range = [name for name, score in self.confidence_scores.items() if not 0.0 <= score <= 1.0]
        if out_of_range:
            raise ValueError(f"Confidence scores must be between 0.0 and 1.0: {', '.join(out_of_range)}")


class ExtractionPipeline(Protocol):
    """Turns a validated PDF or DOCX into extracted course fields with per-field confidence scores."""

    def extract(self, document: bytes, *, filename: str, content_type: str) -> ExtractionResult:
        """Extract course data, raising ``ExtractionError`` when the document cannot be processed."""
        ...
