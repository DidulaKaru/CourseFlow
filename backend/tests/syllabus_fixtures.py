"""Source of truth for the CF-223 syllabus fixture library in ``tests/fixtures/syllabi/``.

Each PDF is generated deterministically by ``document_factory`` and committed, so reviewers can open the
exact files the parser tests read. ``expected`` is what a person reading the document would write down; the
tests score the parser against it. Regenerate after changing a document (run from ``backend/``)::

    python -m tests.syllabus_fixtures
"""

from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path

from tests.document_factory import PdfPage, make_pdf, make_scanned_pdf

FIXTURE_DIR = Path(__file__).resolve().parent / "fixtures" / "syllabi"

HOURS_HEADER = ["Lectures", "Tutorials", "Labs/Practical", "Total Hours"]

STANDARD_LINES = [
    "Module Information Sheet",
    "Course Code: CE3301",
    "Course Title: Digital Signal Processing",
    "Course Type: Core",
    "Credits: 3",
    "Semester: 5",
    "Prerequisites: CE2201",
    "Course Objectives",
    "Analyse discrete-time signals.",
    "Design FIR and IIR filters.",
    "Syllabus:",
    "Sampling, z-transform, filter design.",
    "Assessment:",
    "Final examination 60%",
]

CAPSTONE_LINES = [
    "Module Information Sheet",
    "Module Code: EEE7803",
    "Module Title: Undergraduate Project",
    "Course Type: Capstone",
    "Credits: 8",
    "Semester: 7 and 8",
    "Prerequisites: 90 credits",
    "Course Objectives",
    "Undergraduate project spanning semesters 7 and 8.",
    "Credit breakdown:",
    "Semester 7: 4 credits",
    "Semester 8: 4 credits",
]

COMPLEX_LINES = [
    "Module Information Sheet",
    "Course Code: CE4402",
    "Course Title: Advanced Embedded Systems",
    "Course Type: Elective",
    "Credits: 3",
    "Semester: 7",
    "Prerequisites: (CE3301 and EE3201) or",
    "(CE3302 and 60 credits)",
    "Course Objectives",
    "Design real-time systems on constrained hardware.",
    "Assessment:",
    "Final examination 70%",
]

SCANNED_LINES = [
    "Course Code: CE3305",
    "Course Title: Computer Networks",
    "Credits: 3",
    "Semester: 6",
    "Prerequisites: CE2201",
]


@dataclass(frozen=True)
class SyllabusFixture:
    """One fixture file, how it is built, and the fields a reader would extract from it."""

    filename: str
    build: Callable[[], bytes]
    expected: dict[str, str]
    expected_hours: tuple[float, float, float] | None = None  # lecture, lab, tutorial


def _standard() -> bytes:
    return make_pdf(PdfPage(lines=STANDARD_LINES, tables=[[HOURS_HEADER, ["28", "7", "14", "49"]]]))


def _truncate(document: bytes) -> bytes:
    return document[: len(document) * 2 // 5]  # Valid %PDF header, then the file just stops.


CLEAN = (
    SyllabusFixture(
        "standard_course.pdf",
        _standard,
        {
            "code": "CE3301",
            "title": "Digital Signal Processing",
            "credits": "3",
            "semester": "5",
            "prerequisites": "CE2201",
        },
        expected_hours=(28, 14, 7),
    ),
    SyllabusFixture(
        "multi_semester_capstone.pdf",
        lambda: make_pdf(PdfPage(lines=CAPSTONE_LINES)),
        {
            "code": "EEE7803",
            "title": "Undergraduate Project",
            "credits": "8",
            "semester": "7 and 8",
            "prerequisites": "90 credits",
        },
    ),
    SyllabusFixture(
        "complex_prerequisites.pdf",
        lambda: make_pdf(PdfPage(lines=COMPLEX_LINES)),
        {
            "code": "CE4402",
            "title": "Advanced Embedded Systems",
            "credits": "3",
            "semester": "7",
            "prerequisites": "(CE3301 and EE3201) or (CE3302 and 60 credits)",
        },
    ),
)

SCANNED = SyllabusFixture(
    "scanned_page.pdf",
    lambda: make_scanned_pdf("\n".join(SCANNED_LINES)),
    {
        "code": "CE3305",
        "title": "Computer Networks",
        "credits": "3",
        "semester": "6",
        "prerequisites": "CE2201",
    },
)

CORRUPTED = SyllabusFixture("corrupted_document.pdf", lambda: _truncate(_standard()), {})

ALL = (*CLEAN, SCANNED, CORRUPTED)

# The scanned fixture is rasterised by Pillow, whose output can differ between versions, so only the
# pure-Python documents are compared byte for byte with their generator.
DETERMINISTIC = (*CLEAN, CORRUPTED)


def write_fixtures(directory: Path = FIXTURE_DIR) -> None:
    directory.mkdir(parents=True, exist_ok=True)
    for fixture in ALL:
        (directory / fixture.filename).write_bytes(fixture.build())


if __name__ == "__main__":
    write_fixtures()
    print(f"Wrote {len(ALL)} fixtures to {FIXTURE_DIR}")
