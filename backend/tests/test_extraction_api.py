"""CF-222: end-to-end integration tests for the MIS document extraction API.

``test_extraction.py`` (CF-204) exercises the routes with a stubbed *pipeline*. These tests keep the whole
server-side stack real instead: auth, upload validation, the background job, the CF-231 PDF parser, the
CF-233/234 ``SyllabusPipeline``, the atomic catalog commit and an in-memory database. Only the language model
is replaced (``get_llm_client``), so the suite is deterministic, needs no GPU and never touches the network.
"""

import json
import socket
from collections.abc import Generator
from typing import Any

import pytest
from app.main import app
from app.models.curriculum import Course, DegreeProgram
from app.models.extraction import ExtractionJob as ExtractionJobRecord
from app.services.extraction_service import MAX_UPLOAD_BYTES, PDF_CONTENT_TYPE
from app.services.llm_client import LLMCompletion, LLMUnavailableError, get_llm_client
from fastapi.testclient import TestClient
from scripts.seed_db import seed_database
from sqlalchemy import select
from sqlalchemy.orm import Session, sessionmaker

from tests.document_factory import PdfPage, make_pdf

UPLOAD_URL = "/api/v1/extraction/upload"
JOB_URL = "/api/v1/extraction/jobs/{}"
COMMIT_URL = "/api/v1/extraction/jobs/{}/commit"

PROGRAM_ID = "computer-eng"
MODEL_UNAVAILABLE = "Automatic extraction is not available on this server."


# ==========================================
# Offline guarantees and the mocked Ollama client
# ==========================================


@pytest.fixture(autouse=True)
def forbid_network(monkeypatch: pytest.MonkeyPatch) -> None:
    """Acceptance: zero network dependencies. Any attempt to resolve a host or open a socket fails the test."""

    def refuse(*_args: Any, **_kwargs: Any) -> None:
        raise AssertionError("The extraction suite must not use the network")

    monkeypatch.setattr(socket, "getaddrinfo", refuse)
    monkeypatch.setattr(socket, "create_connection", refuse)


class FakeOllama:
    """Replays prepared model answers, records the prompts, and notes every job status it saw while "thinking"."""

    def __init__(self, session_factory: sessionmaker[Session], *answers: str | dict[str, Any] | Exception) -> None:
        self._session_factory = session_factory
        self.answers = list(answers)
        self.prompts: list[list[dict[str, str]]] = []
        self.statuses_while_answering: list[list[str]] = []
        self.unavailable = False

    async def check_health(self) -> None:
        if self.unavailable:
            raise LLMUnavailableError(MODEL_UNAVAILABLE)

    async def chat(self, messages: list[dict[str, str]], *, json_schema: dict[str, Any]) -> LLMCompletion:
        self.prompts.append([dict(message) for message in messages])
        with self._session_factory() as db:
            self.statuses_while_answering.append(list(db.scalars(select(ExtractionJobRecord.status))))
        assert self.answers, "The language model was asked more questions than the test prepared answers for"
        answer = self.answers.pop(0)
        if isinstance(answer, Exception):
            raise answer
        return LLMCompletion(answer if isinstance(answer, str) else json.dumps(answer))


@pytest.fixture
def ollama(session_factory: sessionmaker[Session]) -> Generator[FakeOllama, None, None]:
    """The mocked model. Tests replace ``answers`` before uploading."""
    fake = FakeOllama(session_factory)
    app.dependency_overrides[get_llm_client] = lambda: fake
    try:
        yield fake
    finally:
        app.dependency_overrides.pop(get_llm_client, None)


@pytest.fixture
def seeded(db_session: Session) -> Session:
    """Both real catalogs loaded, so prerequisite checks and the commit run against genuine course data."""
    seed_database(db_session)
    return db_session


# ==========================================
# Helpers
# ==========================================


def upload(
    client: TestClient,
    headers: dict[str, str],
    content: bytes,
    content_type: str = PDF_CONTENT_TYPE,
    filename: str = "syllabus.pdf",
) -> Any:
    return client.post(UPLOAD_URL, files={"file": (filename, content, content_type)}, headers=headers)


def catalog_ids(db: Session) -> list[str]:
    program = db.get(DegreeProgram, PROGRAM_ID)
    assert program is not None
    return sorted(course.id for course in program.courses)


def model_answer(**overrides: Any) -> dict[str, Any]:
    """What the model returns for a one-semester CE core course; ``overrides`` adapt it per scenario."""
    answer: dict[str, Any] = {
        "code": "CE5901",
        "title": "Embedded Machine Learning",
        "description": "Deploying trained models on microcontrollers.",
        "totalCredits": 3,
        "durationSemesters": 1,
        "courseType": "CORE",
        "offeredSemesters": ["FALL"],
        "recommendedSemester": 8,
        "corequisites": [],
        "syllabusObjectives": ["Quantise a trained network.", "Profile inference on a microcontroller."],
        "contactHours": {"lecture": 28, "lab": 14, "tutorial": 7, "totalSemesterHours": 49},
        "contactHoursPerWeek": False,
        "prerequisiteText": None,
    }
    answer.update(overrides)
    return answer


def syllabus_pdf(*extra_lines: str) -> bytes:
    lines = [
        "Course Code: CE5901",
        "Course Title: Embedded Machine Learning",
        "Course Type: Core",
        "Credits: 3",
        "Semester: 8",
        "Description:",
        "Deploying trained models on microcontrollers.",
        "Course Objectives:",
        "Quantise a trained network.",
        "Profile inference on a microcontroller.",
        *extra_lines,
    ]
    hours = [["Lectures", "Tutorials", "Labs", "Total Hours"], ["28", "7", "14", "49"]]
    return make_pdf(PdfPage(lines=lines, tables=[hours]))


def review_from(extracted: dict[str, Any], **overrides: Any) -> dict[str, Any]:
    """A reviewer accepting the extraction as-is: the same body the admin editor posts to /commit."""
    body = {key: value for key, value in extracted.items() if key not in ("courseType", "prerequisiteText")}
    body.update({"programId": PROGRAM_ID, "type": extracted["courseType"]})
    body.update(overrides)
    return body


def valid_review() -> dict[str, Any]:
    """A well-formed commit body, independent of any extraction."""
    return {
        "programId": PROGRAM_ID,
        "code": "CE5901",
        "title": "Embedded Machine Learning",
        "description": "Deploying trained models on microcontrollers.",
        "totalCredits": 3,
        "recommendedSemester": 8,
        "type": "CORE",
        "offeredSemesters": ["FALL"],
        "contactHours": {"lecture": 28, "lab": 14, "tutorial": 7},
    }


def poll(client: TestClient, headers: dict[str, str], job_id: str) -> dict[str, Any]:
    response = client.get(JOB_URL.format(job_id), headers=headers)
    assert response.status_code == 200, response.text
    return response.json()["data"]


# ==========================================
# Upload validation
# ==========================================


def test_valid_pdf_upload_is_accepted_with_a_job_id(
    db_client: TestClient, admin_headers: dict[str, str], ollama: FakeOllama
):
    ollama.answers = [model_answer()]

    response = upload(db_client, admin_headers, syllabus_pdf())

    assert response.status_code == 202
    body = response.json()
    assert body["success"] is True
    assert body["data"]["jobId"]
    assert body["data"]["status"] == "PENDING"


@pytest.mark.parametrize(
    ("filename", "content_type", "content"),
    [
        ("installer.exe", "application/x-msdownload", b"MZ\x90\x00\x03\x00\x00\x00"),
        ("photo.jpg", "image/jpeg", b"\xff\xd8\xff\xe0\x00\x10JFIF"),
        ("scan.png", "image/png", b"\x89PNG\r\n\x1a\n"),
    ],
    ids=["exe", "jpg", "png"],
)
def test_unsupported_file_types_return_400_and_never_reach_the_model(
    filename: str, content_type: str, content: bytes, db_client: TestClient, admin_headers: dict[str, str],
    ollama: FakeOllama, db_session: Session,
):
    response = upload(db_client, admin_headers, content, content_type, filename)

    assert response.status_code == 400
    assert db_session.scalar(select(ExtractionJobRecord.id)) is None
    assert ollama.prompts == []


def test_files_over_15_mb_return_413_and_never_reach_the_model(
    db_client: TestClient, admin_headers: dict[str, str], ollama: FakeOllama, db_session: Session
):
    pdf = syllabus_pdf()
    oversized = pdf + b"0" * (MAX_UPLOAD_BYTES + 1 - len(pdf))

    response = upload(db_client, admin_headers, oversized)

    assert response.status_code == 413
    assert db_session.scalar(select(ExtractionJobRecord.id)) is None
    assert ollama.prompts == []


# ==========================================
# Job lifecycle, through the real parser and pipeline
# ==========================================


def test_job_progresses_from_pending_through_processing_to_extracted(
    db_client: TestClient, admin_headers: dict[str, str], ollama: FakeOllama
):
    ollama.answers = [model_answer()]

    created = upload(db_client, admin_headers, syllabus_pdf()).json()["data"]

    assert created["status"] == "PENDING"  # What the upload response reports.
    assert ollama.statuses_while_answering == [["PROCESSING"]]  # What the model run observed.
    job = poll(db_client, admin_headers, created["jobId"])
    assert job["status"] == "EXTRACTED"
    assert job["errorMessage"] is None
    assert job["extractedData"]["code"] == "CE5901"
    assert job["extractedData"]["title"] == "Embedded Machine Learning"
    assert job["extractedData"]["totalCredits"] == 3
    assert job["extractedData"]["creditDistribution"] == [{"semesterIndex": 8, "creditsAllocated": 3}]
    scores = job["confidenceScores"]
    assert scores.keys() == job["extractedData"].keys()
    assert all(0.0 <= score <= 1.0 for score in scores.values())
    assert "CE5901" in ollama.prompts[0][-1]["content"]  # The parsed PDF text reached the model.


def test_unknown_job_returns_404_for_polling_and_commit(
    db_client: TestClient, admin_headers: dict[str, str], ollama: FakeOllama
):
    missing = "00000000-0000-4000-8000-000000000000"

    assert db_client.get(JOB_URL.format(missing), headers=admin_headers).status_code == 404
    assert db_client.post(COMMIT_URL.format(missing), json=valid_review(), headers=admin_headers).status_code == 404


def test_uploading_the_same_pdf_twice_reuses_the_job_and_asks_the_model_once(
    db_client: TestClient, admin_headers: dict[str, str], ollama: FakeOllama
):
    ollama.answers = [model_answer()]
    pdf = syllabus_pdf()
    first = upload(db_client, admin_headers, pdf)

    second = upload(db_client, admin_headers, pdf)

    assert (first.status_code, second.status_code) == (202, 200)
    assert second.json()["data"]["jobId"] == first.json()["data"]["jobId"]
    assert len(ollama.prompts) == 1


# ==========================================
# Commit to the catalog
# ==========================================


def test_extracted_course_is_committed_with_its_prerequisite_rule_and_credit_distribution(
    seeded: Session, db_client: TestClient, admin_headers: dict[str, str], ollama: FakeOllama
):
    first, second = catalog_ids(seeded)[:2]
    rule = {"type": "AND", "children": [{"type": "COURSE", "courseId": first}, {"type": "COURSE", "courseId": second}]}
    ollama.answers = [model_answer(prerequisiteText=f"{first} and {second}"), {"rule": rule}]
    job_id = upload(db_client, admin_headers, syllabus_pdf(f"Prerequisites: {first} and {second}")).json()["data"][
        "jobId"
    ]
    extracted = poll(db_client, admin_headers, job_id)["extractedData"]
    assert extracted["prerequisiteRule"] == rule

    response = db_client.post(COMMIT_URL.format(job_id), json=review_from(extracted), headers=admin_headers)

    assert response.status_code == 200, response.text
    data = response.json()["data"]
    assert data["job"]["status"] == "COMMITTED"
    assert data["job"]["committedCourseId"] == "CE5901"
    assert data["course"]["prerequisiteRule"] == rule
    assert data["course"]["creditDistribution"] == [{"semesterIndex": 8, "creditsAllocated": 3}]
    seeded.expire_all()
    course = seeded.get(Course, "CE5901")
    assert course is not None
    assert course.title == "Embedded Machine Learning"
    assert course.prerequisite_rule == rule
    assert course.prerequisite_rule_record.expression == rule
    assert "CE5901" in catalog_ids(seeded)
    assert poll(db_client, admin_headers, job_id)["status"] == "COMMITTED"


def test_committing_an_already_committed_job_returns_409(
    seeded: Session, db_client: TestClient, admin_headers: dict[str, str], ollama: FakeOllama
):
    ollama.answers = [model_answer()]
    job_id = upload(db_client, admin_headers, syllabus_pdf()).json()["data"]["jobId"]
    review = review_from(poll(db_client, admin_headers, job_id)["extractedData"])
    assert db_client.post(COMMIT_URL.format(job_id), json=review, headers=admin_headers).status_code == 200

    again = db_client.post(COMMIT_URL.format(job_id), json=review, headers=admin_headers)

    assert again.status_code == 409
    assert "already been committed" in again.json()["detail"]


def test_two_semester_capstone_commits_a_split_credit_distribution(
    seeded: Session, db_client: TestClient, reviewer_headers: dict[str, str], ollama: FakeOllama
):
    ollama.answers = [
        model_answer(
            code="CE5990", title="Final Year Capstone Project", totalCredits=6, durationSemesters=2,
            courseType="CAPSTONE", recommendedSemester=7,
        )
    ]
    pdf = make_pdf(
        PdfPage(
            lines=[
                "Course Code: CE5990",
                "Course Title: Final Year Capstone Project",
                "Credits: 6",
                "Capstone project spanning semesters 7 and 8.",
            ]
        )
    )
    job_id = upload(db_client, reviewer_headers, pdf, filename="CE5990.pdf").json()["data"]["jobId"]
    extracted = poll(db_client, reviewer_headers, job_id)["extractedData"]
    split = [{"semesterIndex": 7, "creditsAllocated": 3}, {"semesterIndex": 8, "creditsAllocated": 3}]
    assert extracted["creditDistribution"] == split

    response = db_client.post(COMMIT_URL.format(job_id), json=review_from(extracted), headers=reviewer_headers)

    assert response.status_code == 200, response.text
    committed = response.json()["data"]["course"]
    assert committed["id"] == "CE5990"
    assert committed["creditDistribution"] == split
    assert sum(item["creditsAllocated"] for item in committed["creditDistribution"]) == committed["totalCredits"]
    assert len([c for c in catalog_ids(seeded) if c == "CE5990"]) == 1  # One entity, never CE5990_A / CE5990_B.


# ==========================================
# Failures surface as job state, never as a 500
# ==========================================


def test_unavailable_model_fails_the_job_with_a_readable_message(
    seeded: Session, db_client: TestClient, admin_headers: dict[str, str], ollama: FakeOllama
):
    ollama.unavailable = True

    response = upload(db_client, admin_headers, syllabus_pdf())

    assert response.status_code == 202
    job = poll(db_client, admin_headers, response.json()["data"]["jobId"])
    assert job["status"] == "FAILED"
    assert job["errorMessage"] == MODEL_UNAVAILABLE
    assert job["extractedData"] is None
    commit = db_client.post(COMMIT_URL.format(job["jobId"]), json=valid_review(), headers=admin_headers)
    assert commit.status_code == 409
    assert "CE5901" not in catalog_ids(seeded)


def test_unreadable_model_output_fails_the_job_instead_of_crashing(
    db_client: TestClient, admin_headers: dict[str, str], ollama: FakeOllama
):
    ollama.answers = ["this is not json"] * 10

    response = upload(db_client, admin_headers, syllabus_pdf())

    assert response.status_code == 202
    job = poll(db_client, admin_headers, response.json()["data"]["jobId"])
    assert job["status"] == "FAILED"
    assert job["errorMessage"]


def test_corrupted_pdf_fails_the_job_without_asking_the_model(
    db_client: TestClient, admin_headers: dict[str, str], ollama: FakeOllama
):
    truncated = syllabus_pdf()[:200]  # Valid %PDF header, damaged body.

    response = upload(db_client, admin_headers, truncated)

    assert response.status_code == 202
    job = poll(db_client, admin_headers, response.json()["data"]["jobId"])
    assert job["status"] == "FAILED"
    assert job["errorMessage"]
    assert ollama.prompts == []


# ==========================================
# Offline guard
# ==========================================


def test_the_suite_really_is_blocked_from_the_network():
    with pytest.raises(AssertionError, match="must not use the network"):
        socket.getaddrinfo("localhost", 11434)
