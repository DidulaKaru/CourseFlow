"""Tests for admin course CRUD endpoints (CF-202)."""

from datetime import datetime

import pytest
from app.main import app
from app.models.curriculum import (
    Course,
    CreditDistribution,
    DegreeProgram,
    PrerequisiteRule,
)
from app.schemas.curriculum import CourseUpdate
from app.services.course_service import replace_course, to_admin_course
from fastapi.testclient import TestClient
from scripts.seed_db import seed_database
from sqlalchemy.orm import Session

OLD_TIMESTAMP = datetime(2020, 1, 1, 12, 0, 0)


@pytest.fixture
def catalog(db_session: Session) -> Session:
    """Small catalog: two single-semester courses, one 2-semester capstone, a 6-semester program."""
    program = DegreeProgram(id="test-eng", name="Test Engineering", department="Testing", semesters_count=8)
    short_program = DegreeProgram(id="short-eng", name="Short Engineering", department="Testing", semesters_count=6)

    intro = Course(
        id="TST1101",
        code="TST1101",
        title="Intro to Testing",
        description="Original description.",
        total_credits=3,
        duration_semesters=1,
        recommended_semester=1,
        type="CORE",
        corequisites=[],
        offered_semesters=["FALL"],
        syllabus_objectives=["Learn testing"],
        contact_hours={"lecture": 28, "lab": 14, "tutorial": 7},
        updated_at=OLD_TIMESTAMP,
    )
    intro.credit_distribution = [CreditDistribution(semester_index=1, credits_allocated=3)]

    lab = Course(
        id="TST1102",
        code="TST1102",
        title="Testing Lab",
        total_credits=2,
        recommended_semester=1,
        type="LAB",
        corequisites=[],
        offered_semesters=["FALL"],
        contact_hours={},
    )
    lab.credit_distribution = [CreditDistribution(semester_index=1, credits_allocated=2)]

    capstone = Course(
        id="TST4001",
        code="TST4001",
        title="Testing Capstone",
        total_credits=6,
        duration_semesters=2,
        recommended_semester=7,
        type="CAPSTONE",
        prerequisite_rule={"type": "COURSE", "courseId": "TST1101"},
        corequisites=[],
        offered_semesters=["BOTH"],
        contact_hours={},
    )
    capstone.credit_distribution = [
        CreditDistribution(semester_index=7, credits_allocated=3),
        CreditDistribution(semester_index=8, credits_allocated=3),
    ]
    capstone.prerequisite_rule_record = PrerequisiteRule(
        course_id="TST4001", rule_type="COURSE", expression=capstone.prerequisite_rule
    )

    program.courses.extend([intro, lab, capstone])
    short_program.courses.append(lab)  # shared course: must also fit the 6-semester program
    db_session.add_all([program, short_program])
    db_session.commit()
    return db_session


def put_body(**overrides) -> dict:
    """Valid PUT payload for TST1101 with optional field overrides."""
    body = {
        "title": "Intro to Testing (Revised)",
        "description": "Revised description.",
        "totalCredits": 3,
        "durationSemesters": 1,
        "recommendedSemester": 1,
        "type": "CORE",
        "offeredSemesters": ["FALL", "SPRING"],
        "corequisites": [],
        "syllabusObjectives": ["Learn testing", "Write tests"],
        "contactHours": {"lecture": 30, "lab": 15, "tutorial": 5},
    }
    body.update(overrides)
    return body


def create_body(**overrides) -> dict:
    """Valid POST payload creating TST2201 in test-eng."""
    body = put_body(title="Advanced Testing", recommendedSemester=3)
    body.update({"programId": "test-eng", "code": "TST2201"})
    body.update(overrides)
    return body


def reload(db: Session, course_id: str) -> Course:
    db.expire_all()
    course = db.get(Course, course_id)
    assert course is not None
    return course


def error_text(response) -> str:
    """Flatten a 422/409 body into searchable text."""
    detail = response.json()["detail"]
    return " ".join(item["msg"] for item in detail) if isinstance(detail, list) else str(detail)


# ==========================================
# Authentication & authorization
# ==========================================


def test_every_course_route_requires_authentication(db_client: TestClient):
    """Covers routes added later too: every /courses operation must reject anonymous callers."""
    operations = [
        (method.upper(), path)
        for path, item in app.openapi()["paths"].items()
        if "/courses" in path
        for method in item
    ]
    assert len(operations) >= 6  # POST, PUT, PATCH on both mounts
    for method, path in operations:
        response = db_client.request(method, path.replace("{course_id}", "TST1101"), json={})
        assert response.status_code == 401, f"{method} {path} is not protected"


def test_authentication_is_checked_before_body_validation(db_client: TestClient):
    assert db_client.put("/api/v1/courses/TST1101", json={"totalCredits": 999}).status_code == 401


def test_reviewer_cannot_edit_courses(catalog: Session, db_client: TestClient, reviewer_headers: dict[str, str]):
    response = db_client.put("/api/v1/courses/TST1101", json=put_body(), headers=reviewer_headers)
    assert response.status_code == 403
    assert reload(catalog, "TST1101").title == "Intro to Testing"


def test_tampered_token_is_rejected(catalog: Session, db_client: TestClient):
    response = db_client.patch(
        "/api/v1/courses/TST1101", json={"description": "x"}, headers={"Authorization": "Bearer abc.def.ghi"}
    )
    assert response.status_code == 401


# ==========================================
# PUT /courses/{id}
# ==========================================


def test_put_updates_course_and_persists(catalog: Session, db_client: TestClient, admin_headers: dict[str, str]):
    response = db_client.put("/api/v1/courses/TST1101", json=put_body(), headers=admin_headers)
    assert response.status_code == 200

    body = response.json()
    assert body["success"] is True
    data = body["data"]
    assert data["id"] == "TST1101"
    assert data["title"] == "Intro to Testing (Revised)"
    assert data["offeredSemesters"] == ["FALL", "SPRING"]
    assert data["contactHours"] == {"lecture": 30, "lab": 15, "tutorial": 5}
    assert data["creditDistribution"] == [{"semesterIndex": 1, "creditsAllocated": 3}]
    assert datetime.fromisoformat(data["updatedAt"]).year > 2020

    stored = reload(catalog, "TST1101")
    assert stored.title == "Intro to Testing (Revised)"
    assert stored.description == "Revised description."
    assert stored.syllabus_objectives == ["Learn testing", "Write tests"]
    assert stored.contact_hours == {"lecture": 30, "lab": 15, "tutorial": 5}
    assert stored.updated_at > OLD_TIMESTAMP


def test_put_works_on_unversioned_prefix_too(catalog: Session, db_client: TestClient, admin_headers: dict[str, str]):
    assert db_client.put("/api/courses/TST1101", json=put_body(), headers=admin_headers).status_code == 200


def test_put_leaves_prerequisites_and_program_membership_alone(
    catalog: Session, db_client: TestClient, admin_headers: dict[str, str]
):
    response = db_client.put("/api/v1/courses/TST4001", json=put_body(
        title="Testing Capstone II",
        totalCredits=6,
        durationSemesters=2,
        recommendedSemester=7,
        type="CAPSTONE",
    ), headers=admin_headers)
    assert response.status_code == 200
    assert response.json()["data"]["prerequisiteRule"] == {"type": "COURSE", "courseId": "TST1101"}

    stored = reload(catalog, "TST4001")
    assert stored.prerequisite_rule == {"type": "COURSE", "courseId": "TST1101"}
    assert stored.prerequisite_rule_record.expression == stored.prerequisite_rule
    assert [p.id for p in stored.programs] == ["test-eng"]


def test_put_single_semester_distribution_follows_credits_and_semester(
    catalog: Session, db_client: TestClient, admin_headers: dict[str, str]
):
    response = db_client.put(
        "/api/v1/courses/TST1101", json=put_body(totalCredits=4, recommendedSemester=2), headers=admin_headers
    )
    assert response.status_code == 200
    assert response.json()["data"]["creditDistribution"] == [{"semesterIndex": 2, "creditsAllocated": 4}]
    stored = reload(catalog, "TST1101")
    assert [(d.semester_index, d.credits_allocated) for d in stored.credit_distribution] == [(2, 4)]


def test_put_without_contact_hours_clears_them(catalog: Session, db_client: TestClient, admin_headers: dict[str, str]):
    body = put_body()
    del body["contactHours"]
    response = db_client.put("/api/v1/courses/TST1101", json=body, headers=admin_headers)
    assert response.status_code == 200
    assert response.json()["data"]["contactHours"] is None
    assert reload(catalog, "TST1101").contact_hours == {}


def test_put_unknown_course_returns_404(catalog: Session, db_client: TestClient, admin_headers: dict[str, str]):
    response = db_client.put("/api/v1/courses/NOPE9999", json=put_body(), headers=admin_headers)
    assert response.status_code == 404
    assert "NOPE9999" in response.json()["detail"]


@pytest.mark.parametrize(
    ("overrides", "field"),
    [
        ({"totalCredits": 0}, "totalCredits"),
        ({"totalCredits": 13}, "totalCredits"),
        ({"recommendedSemester": 0}, "recommendedSemester"),
        ({"recommendedSemester": 9}, "recommendedSemester"),
        ({"durationSemesters": 0}, "durationSemesters"),
        ({"title": ""}, "title"),
        ({"title": "   "}, "title"),
        ({"type": "SEMINAR"}, "type"),
        ({"offeredSemesters": ["WINTER"]}, "offeredSemesters"),
        ({"contactHours": {"lecture": -1, "lab": 0, "tutorial": 0}}, "contactHours"),
    ],
)
def test_put_rejects_invalid_fields_with_descriptive_422(
    catalog: Session, db_client: TestClient, admin_headers: dict[str, str], overrides: dict, field: str
):
    response = db_client.put("/api/v1/courses/TST1101", json=put_body(**overrides), headers=admin_headers)
    assert response.status_code == 422
    assert any(field in item["loc"] for item in response.json()["detail"])
    assert reload(catalog, "TST1101").title == "Intro to Testing"


def test_credit_bounds_are_inclusive(catalog: Session, db_client: TestClient, admin_headers: dict[str, str]):
    for credits in (1, 12):
        response = db_client.put(
            "/api/v1/courses/TST1101", json=put_body(totalCredits=credits), headers=admin_headers
        )
        assert response.status_code == 200, credits


def test_title_is_trimmed_when_saved(catalog: Session, db_client: TestClient, admin_headers: dict[str, str]):
    response = db_client.put("/api/v1/courses/TST1101", json=put_body(title="  Padded Title  "), headers=admin_headers)
    assert response.status_code == 200
    assert response.json()["data"]["title"] == "Padded Title"


def test_put_rejects_fields_owned_by_other_endpoints(
    catalog: Session, db_client: TestClient, admin_headers: dict[str, str]
):
    """prerequisiteRule must not be silently dropped; it has its own endpoint (CF-203)."""
    body = put_body(prerequisiteRule={"type": "COURSE", "courseId": "TST1102"}, id="TST1101")
    response = db_client.put("/api/v1/courses/TST1101", json=body, headers=admin_headers)
    assert response.status_code == 422
    assert reload(catalog, "TST1101").prerequisite_rule is None


def test_course_code_is_immutable(catalog: Session, db_client: TestClient, admin_headers: dict[str, str]):
    response = db_client.put("/api/v1/courses/TST1101", json=put_body(code="TST9999"), headers=admin_headers)
    assert response.status_code == 409
    assert "cannot change" in response.json()["detail"]
    assert reload(catalog, "TST1101").code == "TST1101"


def test_echoing_the_same_code_is_allowed_in_any_case(
    catalog: Session, db_client: TestClient, admin_headers: dict[str, str]
):
    response = db_client.put("/api/v1/courses/TST1101", json=put_body(code=" tst1101 "), headers=admin_headers)
    assert response.status_code == 200


def test_semester_window_must_fit_every_owning_program(
    catalog: Session, db_client: TestClient, admin_headers: dict[str, str]
):
    """TST1102 also belongs to a 6-semester program, so semester 7 is out of range for it."""
    body = put_body(title="Testing Lab", totalCredits=2, type="LAB", recommendedSemester=7)
    response = db_client.put("/api/v1/courses/TST1102", json=body, headers=admin_headers)
    assert response.status_code == 422
    assert "6 semesters" in error_text(response)


def test_course_cannot_run_past_the_last_semester(
    catalog: Session, db_client: TestClient, admin_headers: dict[str, str]
):
    body = put_body(durationSemesters=2, recommendedSemester=8, totalCredits=4)
    response = db_client.put("/api/v1/courses/TST1101", json=body, headers=admin_headers)
    assert response.status_code == 422
    assert "semester 9" in error_text(response)


@pytest.mark.parametrize(
    ("corequisites", "message"),
    [(["TST1101"], "own corequisite"), (["GHOST1"], "GHOST1")],
)
def test_corequisites_must_exist_and_not_be_self(
    catalog: Session, db_client: TestClient, admin_headers: dict[str, str], corequisites: list[str], message: str
):
    response = db_client.put("/api/v1/courses/TST1101", json=put_body(corequisites=corequisites), headers=admin_headers)
    assert response.status_code == 422
    assert message in error_text(response)


def test_valid_corequisites_are_saved_deduplicated(
    catalog: Session, db_client: TestClient, admin_headers: dict[str, str]
):
    response = db_client.put(
        "/api/v1/courses/TST1101", json=put_body(corequisites=["TST1102", "TST1102"]), headers=admin_headers
    )
    assert response.status_code == 200
    assert reload(catalog, "TST1101").corequisites == ["TST1102"]


# ---- multi-semester credit distribution rules ----


def capstone_put(**overrides) -> dict:
    return put_body(
        title="Testing Capstone",
        totalCredits=6,
        durationSemesters=2,
        recommendedSemester=7,
        type="CAPSTONE",
        **overrides,
    )


def test_multi_semester_course_keeps_split_when_nothing_relevant_changes(
    catalog: Session, db_client: TestClient, admin_headers: dict[str, str]
):
    response = db_client.put("/api/v1/courses/TST4001", json=capstone_put(), headers=admin_headers)
    assert response.status_code == 200
    assert response.json()["data"]["creditDistribution"] == [
        {"semesterIndex": 7, "creditsAllocated": 3},
        {"semesterIndex": 8, "creditsAllocated": 3},
    ]


def test_changing_multi_semester_credits_requires_a_new_distribution(
    catalog: Session, db_client: TestClient, admin_headers: dict[str, str]
):
    body = capstone_put()
    body["totalCredits"] = 8
    response = db_client.put("/api/v1/courses/TST4001", json=body, headers=admin_headers)
    assert response.status_code == 422
    assert "creditDistribution" in response.json()["detail"][0]["loc"]
    stored = reload(catalog, "TST4001")
    assert stored.total_credits == 6
    assert [(d.semester_index, d.credits_allocated) for d in stored.credit_distribution] == [(7, 3), (8, 3)]


def test_changing_multi_semester_credits_with_matching_distribution_succeeds(
    catalog: Session, db_client: TestClient, admin_headers: dict[str, str]
):
    body = capstone_put(creditDistribution=[
        {"semesterIndex": 8, "creditsAllocated": 5},
        {"semesterIndex": 7, "creditsAllocated": 3},
    ])
    body["totalCredits"] = 8
    response = db_client.put("/api/v1/courses/TST4001", json=body, headers=admin_headers)
    assert response.status_code == 200
    assert response.json()["data"]["creditDistribution"] == [
        {"semesterIndex": 7, "creditsAllocated": 3},
        {"semesterIndex": 8, "creditsAllocated": 5},
    ]
    stored = reload(catalog, "TST4001")
    assert stored.total_credits == 8
    assert [(d.semester_index, d.credits_allocated) for d in stored.credit_distribution] == [(7, 3), (8, 5)]


@pytest.mark.parametrize(
    ("distribution", "message"),
    [
        ([{"semesterIndex": 7, "creditsAllocated": 3}, {"semesterIndex": 8, "creditsAllocated": 4}], "sum to 7"),
        ([{"semesterIndex": 7, "creditsAllocated": 6}], "one entry per semester"),
        ([{"semesterIndex": 6, "creditsAllocated": 3}, {"semesterIndex": 7, "creditsAllocated": 3}], "semesters 7 to 8"),
        ([{"semesterIndex": 7, "creditsAllocated": 3}, {"semesterIndex": 7, "creditsAllocated": 3}], "semesters 7 to 8"),
    ],
)
def test_invalid_distributions_are_rejected_atomically(
    catalog: Session,
    db_client: TestClient,
    admin_headers: dict[str, str],
    distribution: list[dict],
    message: str,
):
    response = db_client.put(
        "/api/v1/courses/TST4001", json=capstone_put(creditDistribution=distribution), headers=admin_headers
    )
    assert response.status_code == 422
    assert message in error_text(response)
    assert reload(catalog, "TST4001").title == "Testing Capstone"  # unchanged


# ==========================================
# PATCH /courses/{id}
# ==========================================


def test_patch_changes_only_the_supplied_fields(catalog: Session, db_client: TestClient, admin_headers: dict[str, str]):
    response = db_client.patch(
        "/api/v1/courses/TST1101", json={"description": "Patched description."}, headers=admin_headers
    )
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["description"] == "Patched description."
    assert data["title"] == "Intro to Testing"
    assert data["contactHours"] == {"lecture": 28, "lab": 14, "tutorial": 7}

    stored = reload(catalog, "TST1101")
    assert stored.syllabus_objectives == ["Learn testing"]
    assert stored.updated_at > OLD_TIMESTAMP


def test_patch_contact_hours_merges_per_field(catalog: Session, db_client: TestClient, admin_headers: dict[str, str]):
    response = db_client.patch("/api/v1/courses/TST1101", json={"contactHours": {"lab": 21}}, headers=admin_headers)
    assert response.status_code == 200
    assert response.json()["data"]["contactHours"] == {"lecture": 28, "lab": 21, "tutorial": 7}


def test_patch_contact_hours_on_a_course_without_any(
    catalog: Session, db_client: TestClient, admin_headers: dict[str, str]
):
    response = db_client.patch("/api/v1/courses/TST1102", json={"contactHours": {"lecture": 14}}, headers=admin_headers)
    assert response.status_code == 200
    assert response.json()["data"]["contactHours"] == {"lecture": 14, "lab": 0, "tutorial": 0}


def test_patch_credits_rederives_single_semester_distribution(
    catalog: Session, db_client: TestClient, admin_headers: dict[str, str]
):
    response = db_client.patch("/api/v1/courses/TST1101", json={"totalCredits": 5}, headers=admin_headers)
    assert response.status_code == 200
    assert response.json()["data"]["creditDistribution"] == [{"semesterIndex": 1, "creditsAllocated": 5}]


def test_patch_multi_semester_credits_requires_distribution(
    catalog: Session, db_client: TestClient, admin_headers: dict[str, str]
):
    rejected = db_client.patch("/api/v1/courses/TST4001", json={"totalCredits": 8}, headers=admin_headers)
    assert rejected.status_code == 422

    accepted = db_client.patch(
        "/api/v1/courses/TST4001",
        json={
            "totalCredits": 8,
            "creditDistribution": [
                {"semesterIndex": 7, "creditsAllocated": 4},
                {"semesterIndex": 8, "creditsAllocated": 4},
            ],
        },
        headers=admin_headers,
    )
    assert accepted.status_code == 200
    assert accepted.json()["data"]["totalCredits"] == 8


def test_patch_distribution_alone_still_advances_updated_at(
    catalog: Session, db_client: TestClient, admin_headers: dict[str, str]
):
    """A change that only touches child rows must still be tracked."""
    capstone = reload(catalog, "TST4001")
    capstone.updated_at = OLD_TIMESTAMP
    catalog.commit()

    response = db_client.patch(
        "/api/v1/courses/TST4001",
        json={
            "creditDistribution": [
                {"semesterIndex": 7, "creditsAllocated": 2},
                {"semesterIndex": 8, "creditsAllocated": 4},
            ]
        },
        headers=admin_headers,
    )
    assert response.status_code == 200
    assert reload(catalog, "TST4001").updated_at > OLD_TIMESTAMP


@pytest.mark.parametrize(
    "body",
    [
        {},
        {"title": None},
        {"description": None},
        {"contactHours": {"lab": None}},
        {"totalCredits": 13},
        {"unknownField": 1},
        {"prerequisiteRule": None},
    ],
)
def test_patch_rejects_empty_null_and_unknown_bodies(
    catalog: Session, db_client: TestClient, admin_headers: dict[str, str], body: dict
):
    response = db_client.patch("/api/v1/courses/TST1101", json=body, headers=admin_headers)
    assert response.status_code == 422


def test_patch_unknown_course_and_code_change(catalog: Session, db_client: TestClient, admin_headers: dict[str, str]):
    assert db_client.patch("/api/v1/courses/NOPE9999", json={"title": "x"}, headers=admin_headers).status_code == 404
    assert db_client.patch("/api/v1/courses/TST1101", json={"code": "TST7777"}, headers=admin_headers).status_code == 409


def test_failed_patch_changes_nothing(catalog: Session, db_client: TestClient, admin_headers: dict[str, str]):
    response = db_client.patch(
        "/api/v1/courses/TST1101", json={"title": "Should not stick", "corequisites": ["GHOST1"]}, headers=admin_headers
    )
    assert response.status_code == 422
    assert reload(catalog, "TST1101").title == "Intro to Testing"


# ==========================================
# POST /courses
# ==========================================


def test_post_creates_course_in_program(catalog: Session, db_client: TestClient, admin_headers: dict[str, str]):
    response = db_client.post("/api/v1/courses", json=create_body(), headers=admin_headers)
    assert response.status_code == 201

    data = response.json()["data"]
    assert response.json()["success"] is True
    assert data["id"] == data["code"] == "TST2201"
    assert data["prerequisiteRule"] is None
    assert data["creditDistribution"] == [{"semesterIndex": 3, "creditsAllocated": 3}]

    stored = reload(catalog, "TST2201")
    assert [p.id for p in stored.programs] == ["test-eng"]
    assert stored.updated_at is not None
    program = catalog.get(DegreeProgram, "test-eng")
    assert "TST2201" in {c.id for c in program.courses}


def test_post_normalizes_code_case_and_whitespace(catalog: Session, db_client: TestClient, admin_headers: dict[str, str]):
    response = db_client.post("/api/v1/courses", json=create_body(code="  tst2202 "), headers=admin_headers)
    assert response.status_code == 201
    assert response.json()["data"]["id"] == "TST2202"


def test_post_multi_semester_course_with_distribution(
    catalog: Session, db_client: TestClient, admin_headers: dict[str, str]
):
    body = create_body(
        code="TST4002",
        totalCredits=4,
        durationSemesters=2,
        recommendedSemester=7,
        type="CAPSTONE",
        creditDistribution=[
            {"semesterIndex": 7, "creditsAllocated": 1},
            {"semesterIndex": 8, "creditsAllocated": 3},
        ],
    )
    response = db_client.post("/api/v1/courses", json=body, headers=admin_headers)
    assert response.status_code == 201
    assert response.json()["data"]["creditDistribution"][1] == {"semesterIndex": 8, "creditsAllocated": 3}


def test_post_multi_semester_course_requires_distribution(
    catalog: Session, db_client: TestClient, admin_headers: dict[str, str]
):
    body = create_body(code="TST4003", totalCredits=4, durationSemesters=2, recommendedSemester=7, type="CAPSTONE")
    response = db_client.post("/api/v1/courses", json=body, headers=admin_headers)
    assert response.status_code == 422
    assert catalog.get(Course, "TST4003") is None


def test_post_duplicate_code_returns_409_and_creates_nothing(
    catalog: Session, db_client: TestClient, admin_headers: dict[str, str]
):
    response = db_client.post("/api/v1/courses", json=create_body(code="tst1101"), headers=admin_headers)
    assert response.status_code == 409
    assert "TST1101" in response.json()["detail"]
    assert catalog.query(Course).count() == 3


def test_post_code_used_in_another_program_is_still_a_conflict(
    catalog: Session, db_client: TestClient, admin_headers: dict[str, str]
):
    """Codes are unique catalog-wide, so a code owned by another program cannot be reused."""
    response = db_client.post(
        "/api/v1/courses", json=create_body(programId="short-eng", code="TST1101"), headers=admin_headers
    )
    assert response.status_code == 409


def test_post_unknown_program_returns_404(catalog: Session, db_client: TestClient, admin_headers: dict[str, str]):
    response = db_client.post("/api/v1/courses", json=create_body(programId="ghost-eng"), headers=admin_headers)
    assert response.status_code == 404
    assert catalog.get(Course, "TST2201") is None


def test_post_semester_must_fit_the_program(catalog: Session, db_client: TestClient, admin_headers: dict[str, str]):
    response = db_client.post(
        "/api/v1/courses", json=create_body(programId="short-eng", recommendedSemester=7), headers=admin_headers
    )
    assert response.status_code == 422
    assert "6 semesters" in error_text(response)


@pytest.mark.parametrize(
    "overrides",
    [
        {"code": "bad code!"},
        {"code": "T1"},
        {"code": ""},
        {"totalCredits": 0},
        {"totalCredits": 13},
        {"recommendedSemester": 9},
        {"title": "   "},
        {"programId": ""},
    ],
)
def test_post_rejects_invalid_payloads(
    catalog: Session, db_client: TestClient, admin_headers: dict[str, str], overrides: dict
):
    response = db_client.post("/api/v1/courses", json=create_body(**overrides), headers=admin_headers)
    assert response.status_code == 422
    assert catalog.query(Course).count() == 3


def test_post_requires_program_and_code(catalog: Session, db_client: TestClient, admin_headers: dict[str, str]):
    body = create_body()
    del body["programId"]
    assert db_client.post("/api/v1/courses", json=body, headers=admin_headers).status_code == 422


# ==========================================
# Real catalog data
# ==========================================


def test_every_seeded_course_can_be_resaved_unchanged(db_session: Session):
    """Guards the model/contract mapping against the real catalog: no seeded course may fail validation."""
    seed_database(db_session)
    courses = db_session.query(Course).all()
    assert len(courses) == 143

    for course in courses:
        before = to_admin_course(course)
        payload = CourseUpdate(
            title=before.title,
            description=before.description,
            total_credits=before.total_credits,
            duration_semesters=before.duration_semesters,
            recommended_semester=before.recommended_semester,
            type=before.type,
            offered_semesters=before.offered_semesters,
            corequisites=before.corequisites,
            syllabus_objectives=before.syllabus_objectives,
            contact_hours=before.contact_hours,
            credit_distribution=before.credit_distribution,
        )
        after = replace_course(db_session, course.id, payload)
        assert after.model_dump(exclude={"updated_at"}) == before.model_dump(exclude={"updated_at"}), course.id


def test_seeded_prerequisites_survive_course_edits(db_session: Session, db_client: TestClient, admin_headers: dict[str, str]):
    seed_database(db_session)
    # Filter in Python: a stored JSON null is not a SQL NULL, so a column filter would match every row.
    course = next(c for c in db_session.query(Course) if c.prerequisite_rule)
    rule_before = course.prerequisite_rule

    response = db_client.patch(f"/api/v1/courses/{course.id}", json={"description": "Edited."}, headers=admin_headers)
    assert response.status_code == 200
    assert response.json()["data"]["prerequisiteRule"] is not None
    assert reload(db_session, course.id).prerequisite_rule == rule_before


# ==========================================
# Public routes unaffected
# ==========================================


def test_student_routes_still_public_with_database_dependency_overridden(db_client: TestClient):
    assert db_client.get("/api/v1/programs").status_code == 200
