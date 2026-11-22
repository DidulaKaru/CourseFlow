"""Tests for admin prerequisite-rule and credit-distribution endpoints (CF-203)."""

from datetime import datetime
from typing import Any

import pytest
from app.core.ast_evaluator import find_rule_issues
from app.models.curriculum import (
    Course,
    CreditDistribution,
    DegreeProgram,
    PrerequisiteRule,
)
from app.schemas.curriculum import PrerequisiteRule as PrerequisiteRuleSchema
from fastapi.testclient import TestClient
from pydantic import TypeAdapter
from scripts.seed_db import seed_database
from sqlalchemy.orm import Session

OLD_TIMESTAMP = datetime(2020, 1, 1, 12, 0, 0)
PREREQ_URL = "/api/v1/courses/{}/prerequisites"
CREDIT_URL = "/api/v1/courses/{}/credit-distribution"


def make_course(course_id: str, **overrides: Any) -> Course:
    """Build a single-semester course row with sensible defaults."""
    values: dict[str, Any] = {
        "id": course_id,
        "code": course_id,
        "title": f"Course {course_id}",
        "total_credits": 3,
        "duration_semesters": 1,
        "recommended_semester": 1,
        "type": "CORE",
        "corequisites": [],
        "offered_semesters": ["FALL"],
        "contact_hours": {},
        "updated_at": OLD_TIMESTAMP,
    }
    values.update(overrides)
    course = Course(**values)
    if "prerequisite_rule" in overrides and overrides["prerequisite_rule"] is not None:
        rule = overrides["prerequisite_rule"]
        course.prerequisite_rule_record = PrerequisiteRule(course_id=course_id, rule_type=rule["type"], expression=rule)
    if values["duration_semesters"] == 1:
        course.credit_distribution = [
            CreditDistribution(semester_index=values["recommended_semester"], credits_allocated=values["total_credits"])
        ]
    return course


@pytest.fixture
def catalog(db_session: Session) -> Session:
    """Catalog with a dependency chain C -> B -> A, a ruled capstone and a 2-semester capstone."""
    program = DegreeProgram(id="test-eng", name="Test Engineering", department="Testing", semesters_count=8)
    chain_a = make_course("TST1101")
    chain_b = make_course(
        "TST2101", recommended_semester=3, prerequisite_rule={"type": "COURSE", "courseId": "TST1101"}
    )
    chain_c = make_course(
        "TST3101", recommended_semester=5, prerequisite_rule={"type": "COURSE", "courseId": "TST2101"}
    )
    free = make_course("TST1102", total_credits=2, type="LAB")
    capstone = make_course(
        "TST4001",
        total_credits=6,
        duration_semesters=2,
        recommended_semester=7,
        type="CAPSTONE",
        offered_semesters=["BOTH"],
        prerequisite_rule={
            "type": "AND",
            "children": [
                {"type": "COURSE", "courseId": "TST3101"},
                {"type": "CREDIT_THRESHOLD", "minCredits": 90},
            ],
        },
    )
    capstone.credit_distribution = [
        CreditDistribution(semester_index=7, credits_allocated=3),
        CreditDistribution(semester_index=8, credits_allocated=3),
    ]
    program.courses.extend([chain_a, chain_b, chain_c, free, capstone])
    db_session.add(program)
    db_session.commit()
    return db_session


def course_leaf(course_id: str) -> dict[str, Any]:
    """A COURSE leaf node."""
    return {"type": "COURSE", "courseId": course_id}


def reload(db: Session, course_id: str) -> Course:
    """Re-read a course from the database, bypassing the identity map."""
    db.expire_all()
    course = db.get(Course, course_id)
    assert course is not None
    return course


def rule_rows(db: Session, course_id: str) -> list[PrerequisiteRule]:
    """Rows of the relational prerequisite_rules table for a course."""
    db.expire_all()
    return db.query(PrerequisiteRule).filter_by(course_id=course_id).all()


def snapshot(db: Session) -> dict[str, Any]:
    """Everything the endpoints may touch, for before/after equality checks."""
    db.expire_all()
    return {
        "courses": {
            c.id: (
                c.prerequisite_rule,
                c.updated_at,
                sorted((d.semester_index, d.credits_allocated) for d in c.credit_distribution),
            )
            for c in db.query(Course)
        },
        "rules": sorted((r.course_id, r.rule_type, str(r.expression)) for r in db.query(PrerequisiteRule)),
    }


def assert_in_sync(db: Session, course_id: str) -> None:
    """The JSONB column and the relational row must hold the identical rule (or both be empty)."""
    course = reload(db, course_id)
    rows = rule_rows(db, course_id)
    if course.prerequisite_rule is None:
        assert rows == []
    else:
        assert len(rows) == 1
        assert rows[0].expression == course.prerequisite_rule
        assert rows[0].rule_type == course.prerequisite_rule["type"]


def nested_text(depth: int) -> str:
    """JSON text of an AND chain nested ``depth`` levels with a valid leaf (built without recursion)."""
    return '{"type":"AND","children":[' * depth + '{"type":"COURSE","courseId":"TST1101"}' + "]}" * depth


def put_raw(client: TestClient, url: str, text: str, headers: dict[str, str]) -> Any:
    """PUT pre-serialised JSON text."""
    return client.put(url, content=text, headers={**headers, "Content-Type": "application/json"})


def locs(response: Any) -> list[list[str | int]]:
    """The ``loc`` of every error in a 422 body."""
    return [item["loc"] for item in response.json()["detail"]]


def messages(response: Any) -> str:
    """All 422 messages flattened into one string."""
    return " ".join(item["msg"] for item in response.json()["detail"])


# ==========================================
# Authentication & authorization
# ==========================================


@pytest.mark.parametrize(
    ("method", "url", "body"),
    [
        ("PUT", PREREQ_URL, course_leaf("TST1101")),
        ("DELETE", PREREQ_URL, None),
        ("PUT", CREDIT_URL, [{"semesterIndex": 7, "creditsAllocated": 6}]),
    ],
)
def test_anonymous_requests_are_rejected(catalog: Session, db_client: TestClient, method: str, url: str, body: Any):
    before = snapshot(catalog)
    response = db_client.request(method, url.format("TST4001"), json=body)
    assert response.status_code == 401
    assert snapshot(catalog) == before


@pytest.mark.parametrize(
    ("method", "url", "body"),
    [
        ("PUT", PREREQ_URL, course_leaf("TST1101")),
        ("DELETE", PREREQ_URL, None),
        ("PUT", CREDIT_URL, [{"semesterIndex": 7, "creditsAllocated": 3}, {"semesterIndex": 8, "creditsAllocated": 3}]),
    ],
)
def test_reviewer_is_forbidden(
    catalog: Session, db_client: TestClient, reviewer_headers: dict[str, str], method: str, url: str, body: Any
):
    before = snapshot(catalog)
    response = db_client.request(method, url.format("TST4001"), json=body, headers=reviewer_headers)
    assert response.status_code == 403
    assert snapshot(catalog) == before


def test_authentication_is_checked_before_body_validation(catalog: Session, db_client: TestClient):
    assert db_client.put(PREREQ_URL.format("TST4001"), json={"type": "NOPE"}).status_code == 401


def test_unversioned_prefix_is_also_served(catalog: Session, db_client: TestClient, admin_headers: dict[str, str]):
    response = db_client.put("/api/courses/TST1102/prerequisites", json=course_leaf("TST1101"), headers=admin_headers)
    assert response.status_code == 200


# ==========================================
# 404 for unknown courses
# ==========================================


def test_unknown_course_returns_404_on_every_route(
    catalog: Session, db_client: TestClient, admin_headers: dict[str, str]
):
    before = snapshot(catalog)
    put = db_client.put(PREREQ_URL.format("NOPE9999"), json=course_leaf("TST1101"), headers=admin_headers)
    delete = db_client.delete(PREREQ_URL.format("NOPE9999"), headers=admin_headers)
    credit = db_client.put(
        CREDIT_URL.format("NOPE9999"), json=[{"semesterIndex": 1, "creditsAllocated": 3}], headers=admin_headers
    )
    assert (put.status_code, delete.status_code, credit.status_code) == (404, 404, 404)
    assert snapshot(catalog) == before


# ==========================================
# PUT /courses/{id}/prerequisites: success paths
# ==========================================


def test_put_rule_on_course_without_one_creates_row_and_syncs(
    catalog: Session, db_client: TestClient, admin_headers: dict[str, str]
):
    assert rule_rows(catalog, "TST1102") == []
    rule = {"type": "AND", "children": [course_leaf("TST1101"), {"type": "CREDIT_THRESHOLD", "minCredits": 30}]}

    response = db_client.put(PREREQ_URL.format("TST1102"), json=rule, headers=admin_headers)

    assert response.status_code == 200
    body = response.json()
    assert body["success"] is True
    assert body["data"]["id"] == "TST1102"
    assert body["data"]["prerequisiteRule"] == rule
    assert datetime.fromisoformat(body["data"]["updatedAt"]).year > 2020
    assert reload(catalog, "TST1102").prerequisite_rule == rule
    assert reload(catalog, "TST1102").updated_at > OLD_TIMESTAMP
    assert_in_sync(catalog, "TST1102")
    assert rule_rows(catalog, "TST1102")[0].rule_type == "AND"


def test_put_replaces_existing_rule_in_both_stores(
    catalog: Session, db_client: TestClient, admin_headers: dict[str, str]
):
    rule = {"type": "OR", "children": [course_leaf("TST1101"), course_leaf("TST1102")]}

    response = db_client.put(PREREQ_URL.format("TST4001"), json=rule, headers=admin_headers)

    assert response.status_code == 200
    assert response.json()["data"]["prerequisiteRule"] == rule
    assert reload(catalog, "TST4001").prerequisite_rule == rule
    assert reload(catalog, "TST4001").updated_at > OLD_TIMESTAMP
    assert_in_sync(catalog, "TST4001")
    assert len(rule_rows(catalog, "TST4001")) == 1


def test_put_does_not_touch_other_courses_or_credit_distribution(
    catalog: Session, db_client: TestClient, admin_headers: dict[str, str]
):
    before = snapshot(catalog)
    response = db_client.put(PREREQ_URL.format("TST4001"), json=course_leaf("TST1102"), headers=admin_headers)
    assert response.status_code == 200
    after = snapshot(catalog)
    for course_id, state in before["courses"].items():
        if course_id != "TST4001":
            assert after["courses"][course_id] == state
    assert after["courses"]["TST4001"][2] == before["courses"]["TST4001"][2]
    assert response.json()["data"]["creditDistribution"] == [
        {"semesterIndex": 7, "creditsAllocated": 3},
        {"semesterIndex": 8, "creditsAllocated": 3},
    ]


def test_credit_threshold_only_rule_is_accepted(catalog: Session, db_client: TestClient, admin_headers: dict[str, str]):
    rule = {"type": "CREDIT_THRESHOLD", "minCredits": 0}
    assert db_client.put(PREREQ_URL.format("TST1102"), json=rule, headers=admin_headers).status_code == 200
    assert rule_rows(catalog, "TST1102")[0].rule_type == "CREDIT_THRESHOLD"
    assert_in_sync(catalog, "TST1102")


def test_put_identical_rule_twice_is_idempotent(catalog: Session, db_client: TestClient, admin_headers: dict[str, str]):
    rule = {"type": "AND", "children": [course_leaf("TST1101"), course_leaf("TST1102")]}

    first = db_client.put(PREREQ_URL.format("TST3101"), json=rule, headers=admin_headers)
    second = db_client.put(PREREQ_URL.format("TST3101"), json=rule, headers=admin_headers)

    assert first.status_code == second.status_code == 200
    assert first.json()["data"]["prerequisiteRule"] == second.json()["data"]["prerequisiteRule"] == rule
    assert len(rule_rows(catalog, "TST3101")) == 1
    assert catalog.query(PrerequisiteRule).count() == 3  # TST2101, TST3101, TST4001: nothing duplicated
    assert_in_sync(catalog, "TST3101")


def test_putting_an_existing_rule_unchanged_is_accepted(
    catalog: Session, db_client: TestClient, admin_headers: dict[str, str]
):
    stored = reload(catalog, "TST4001").prerequisite_rule
    response = db_client.put(PREREQ_URL.format("TST4001"), json=stored, headers=admin_headers)
    assert response.status_code == 200
    assert reload(catalog, "TST4001").prerequisite_rule == stored
    assert_in_sync(catalog, "TST4001")


def test_switching_root_type_updates_rule_type_in_table(
    catalog: Session, db_client: TestClient, admin_headers: dict[str, str]
):
    assert rule_rows(catalog, "TST2101")[0].rule_type == "COURSE"

    to_and = {"type": "AND", "children": [course_leaf("TST1101")]}
    assert db_client.put(PREREQ_URL.format("TST2101"), json=to_and, headers=admin_headers).status_code == 200
    assert rule_rows(catalog, "TST2101")[0].rule_type == "AND"
    assert_in_sync(catalog, "TST2101")

    to_or = {"type": "OR", "children": [course_leaf("TST1101"), course_leaf("TST1102")]}
    assert db_client.put(PREREQ_URL.format("TST2101"), json=to_or, headers=admin_headers).status_code == 200
    assert rule_rows(catalog, "TST2101")[0].rule_type == "OR"

    back = course_leaf("TST1102")
    assert db_client.put(PREREQ_URL.format("TST2101"), json=back, headers=admin_headers).status_code == 200
    assert rule_rows(catalog, "TST2101")[0].rule_type == "COURSE"
    assert len(rule_rows(catalog, "TST2101")) == 1
    assert_in_sync(catalog, "TST2101")


def test_rule_at_exactly_maximum_depth_is_accepted(
    catalog: Session, db_client: TestClient, admin_headers: dict[str, str]
):
    """Depth 20 (root is depth 0) is the deepest allowed level: 20 AND wrappers around a leaf at depth 20."""
    response = put_raw(db_client, PREREQ_URL.format("TST1102"), nested_text(20), admin_headers)
    assert response.status_code == 200
    assert_in_sync(catalog, "TST1102")


# ==========================================
# PUT /courses/{id}/prerequisites: validation failures
# ==========================================


def test_unknown_course_reference_is_422_with_path(
    catalog: Session, db_client: TestClient, admin_headers: dict[str, str]
):
    before = snapshot(catalog)
    rule = {"type": "AND", "children": [course_leaf("TST1101"), course_leaf("GHOST999")]}

    response = db_client.put(PREREQ_URL.format("TST1102"), json=rule, headers=admin_headers)

    assert response.status_code == 422
    assert locs(response) == [["body", "children", 1, "courseId"]]
    assert "GHOST999" in messages(response)
    assert snapshot(catalog) == before


def test_self_reference_is_422(catalog: Session, db_client: TestClient, admin_headers: dict[str, str]):
    before = snapshot(catalog)
    response = db_client.put(PREREQ_URL.format("TST1102"), json=course_leaf("TST1102"), headers=admin_headers)
    assert response.status_code == 422
    assert locs(response) == [["body", "courseId"]]
    assert "own prerequisite" in messages(response)
    assert snapshot(catalog) == before


def test_blank_course_id_is_422(catalog: Session, db_client: TestClient, admin_headers: dict[str, str]):
    before = snapshot(catalog)
    response = db_client.put(PREREQ_URL.format("TST1102"), json=course_leaf("  "), headers=admin_headers)
    assert response.status_code == 422
    assert locs(response) == [["body", "courseId"]]
    assert snapshot(catalog) == before


@pytest.mark.parametrize("node_type", ["AND", "OR"])
def test_empty_logical_node_is_422(
    catalog: Session, db_client: TestClient, admin_headers: dict[str, str], node_type: str
):
    before = snapshot(catalog)
    response = db_client.put(
        PREREQ_URL.format("TST1102"), json={"type": node_type, "children": []}, headers=admin_headers
    )
    assert response.status_code == 422
    assert locs(response) == [["body", "children"]]
    assert "at least one child" in messages(response)
    assert snapshot(catalog) == before


def test_all_issues_are_reported_at_once(catalog: Session, db_client: TestClient, admin_headers: dict[str, str]):
    before = snapshot(catalog)
    rule = {
        "type": "AND",
        "children": [
            course_leaf("GHOST1"),
            course_leaf("TST1102"),
            {"type": "OR", "children": []},
            {"type": "OR", "children": [course_leaf("TST1101"), course_leaf("GHOST2")]},
        ],
    }

    response = db_client.put(PREREQ_URL.format("TST1102"), json=rule, headers=admin_headers)

    assert response.status_code == 422
    assert locs(response) == [
        ["body", "children", 0, "courseId"],
        ["body", "children", 1, "courseId"],
        ["body", "children", 2, "children"],
        ["body", "children", 3, "children", 1, "courseId"],
    ]
    assert all(item["type"] == "value_error" for item in response.json()["detail"])
    assert snapshot(catalog) == before


def test_nesting_deeper_than_limit_is_422(catalog: Session, db_client: TestClient, admin_headers: dict[str, str]):
    before = snapshot(catalog)
    response = put_raw(db_client, PREREQ_URL.format("TST1102"), nested_text(21), admin_headers)
    assert response.status_code == 422
    assert "nested more than 20" in messages(response)
    assert snapshot(catalog) == before


def test_moderately_deep_payload_of_30_levels_is_rejected_cleanly(
    catalog: Session, db_client: TestClient, admin_headers: dict[str, str]
):
    before = snapshot(catalog)
    response = put_raw(db_client, PREREQ_URL.format("TST1102"), nested_text(30), admin_headers)
    assert response.status_code == 422
    assert "nested more than 20" in messages(response)
    assert snapshot(catalog) == before


def test_pathologically_deep_payload_is_rejected_with_4xx(
    catalog: Session, db_client: TestClient, admin_headers: dict[str, str]
):
    before = snapshot(catalog)
    try:
        response = put_raw(db_client, PREREQ_URL.format("TST1102"), nested_text(2000), admin_headers)
    except RecursionError:  # TestClient re-raises server exceptions; the desired behaviour is a 4xx instead
        pytest.fail("unhandled RecursionError escaped the endpoint")
    assert 400 <= response.status_code < 500
    assert snapshot(catalog) == before


@pytest.mark.parametrize(
    "body",
    [
        {"type": "NOT_A_TYPE"},
        {"type": "COURSE"},
        {"type": "COURSE", "courseId": 123},
        {"type": "CREDIT_THRESHOLD", "minCredits": -1},
        {"type": "CREDIT_THRESHOLD", "minCredits": "lots"},
        {"type": "AND"},
        {"type": "AND", "children": "TST1101"},
        {"type": "AND", "children": [{"type": "BOGUS"}]},
        {},
        [],
        "TST1101",
    ],
)
def test_malformed_shapes_are_rejected_by_fastapi(
    catalog: Session, db_client: TestClient, admin_headers: dict[str, str], body: Any
):
    before = snapshot(catalog)
    response = db_client.put(PREREQ_URL.format("TST1102"), json=body, headers=admin_headers)
    assert response.status_code == 422
    assert snapshot(catalog) == before


def test_invalid_json_body_is_422(catalog: Session, db_client: TestClient, admin_headers: dict[str, str]):
    assert put_raw(db_client, PREREQ_URL.format("TST1102"), "{not json", admin_headers).status_code == 422


# ==========================================
# Circular dependency detection
# ==========================================


def test_direct_cycle_is_rejected(catalog: Session, db_client: TestClient, admin_headers: dict[str, str]):
    """TST2101 already requires TST1101, so TST1101 may not require TST2101."""
    before = snapshot(catalog)
    response = db_client.put(PREREQ_URL.format("TST1101"), json=course_leaf("TST2101"), headers=admin_headers)
    assert response.status_code == 422
    assert locs(response) == [["body", "prerequisiteRule"]]
    text = messages(response)
    assert "circular" in text
    assert "TST1101 -> TST2101 -> TST1101" in text
    assert snapshot(catalog) == before


def test_indirect_cycle_through_longer_chain_is_rejected(
    catalog: Session, db_client: TestClient, admin_headers: dict[str, str]
):
    """TST3101 -> TST2101 -> TST1101, so TST1101 requiring TST3101 closes a three-course loop."""
    before = snapshot(catalog)
    response = db_client.put(PREREQ_URL.format("TST1101"), json=course_leaf("TST3101"), headers=admin_headers)
    assert response.status_code == 422
    assert locs(response) == [["body", "prerequisiteRule"]]
    text = messages(response)
    assert "TST1101" in text
    assert "TST3101" in text
    assert "TST2101" in text
    assert snapshot(catalog) == before


def test_cycle_through_a_branch_nested_in_or_is_rejected(
    catalog: Session, db_client: TestClient, admin_headers: dict[str, str]
):
    before = snapshot(catalog)
    rule = {
        "type": "AND",
        "children": [
            {"type": "OR", "children": [course_leaf("TST1102"), course_leaf("TST4001")]},
            {"type": "CREDIT_THRESHOLD", "minCredits": 10},
        ],
    }
    # TST4001 requires TST3101 -> TST2101 -> TST1101, so TST1101 may not depend on TST4001.
    response = db_client.put(PREREQ_URL.format("TST1101"), json=rule, headers=admin_headers)
    assert response.status_code == 422
    assert locs(response) == [["body", "prerequisiteRule"]]
    assert snapshot(catalog) == before


def test_non_cyclic_diamond_dependency_is_accepted(
    catalog: Session, db_client: TestClient, admin_headers: dict[str, str]
):
    """Requiring both a course and its own prerequisite is redundant, not circular."""
    rule = {"type": "AND", "children": [course_leaf("TST2101"), course_leaf("TST1101")]}
    assert db_client.put(PREREQ_URL.format("TST3101"), json=rule, headers=admin_headers).status_code == 200


def test_removing_a_link_unblocks_the_previously_cyclic_rule(
    catalog: Session, db_client: TestClient, admin_headers: dict[str, str]
):
    assert db_client.put(PREREQ_URL.format("TST1101"), json=course_leaf("TST2101"), headers=admin_headers).status_code == 422
    assert db_client.delete(PREREQ_URL.format("TST2101"), headers=admin_headers).status_code == 200
    assert db_client.put(PREREQ_URL.format("TST1101"), json=course_leaf("TST2101"), headers=admin_headers).status_code == 200
    assert_in_sync(catalog, "TST1101")


def test_rewriting_own_rule_does_not_see_itself_as_a_cycle(
    catalog: Session, db_client: TestClient, admin_headers: dict[str, str]
):
    """The course's current rule is ignored when searching for loops, so replacing it can reverse a link."""
    rule = {"type": "OR", "children": [course_leaf("TST1101"), course_leaf("TST1102")]}
    assert db_client.put(PREREQ_URL.format("TST2101"), json=rule, headers=admin_headers).status_code == 200


# ==========================================
# DELETE /courses/{id}/prerequisites
# ==========================================


def test_delete_clears_rule_and_row(catalog: Session, db_client: TestClient, admin_headers: dict[str, str]):
    response = db_client.delete(PREREQ_URL.format("TST4001"), headers=admin_headers)

    assert response.status_code == 200
    body = response.json()
    assert body["success"] is True
    assert body["data"]["prerequisiteRule"] is None
    assert reload(catalog, "TST4001").prerequisite_rule is None
    assert reload(catalog, "TST4001").updated_at > OLD_TIMESTAMP
    assert rule_rows(catalog, "TST4001") == []
    assert_in_sync(catalog, "TST4001")


def test_delete_leaves_other_rules_intact(catalog: Session, db_client: TestClient, admin_headers: dict[str, str]):
    before = snapshot(catalog)
    assert db_client.delete(PREREQ_URL.format("TST4001"), headers=admin_headers).status_code == 200
    after = snapshot(catalog)
    assert after["courses"]["TST2101"] == before["courses"]["TST2101"]
    assert after["courses"]["TST3101"] == before["courses"]["TST3101"]
    assert len(rule_rows(catalog, "TST2101")) == 1


def test_delete_on_course_without_rule_is_idempotent(
    catalog: Session, db_client: TestClient, admin_headers: dict[str, str]
):
    first = db_client.delete(PREREQ_URL.format("TST1102"), headers=admin_headers)
    second = db_client.delete(PREREQ_URL.format("TST1102"), headers=admin_headers)
    assert first.status_code == second.status_code == 200
    assert second.json()["data"]["prerequisiteRule"] is None
    assert_in_sync(catalog, "TST1102")


def test_put_after_delete_recreates_row(catalog: Session, db_client: TestClient, admin_headers: dict[str, str]):
    assert db_client.delete(PREREQ_URL.format("TST4001"), headers=admin_headers).status_code == 200
    rule = {"type": "AND", "children": [course_leaf("TST1101"), course_leaf("TST1102")]}
    assert db_client.put(PREREQ_URL.format("TST4001"), json=rule, headers=admin_headers).status_code == 200
    assert len(rule_rows(catalog, "TST4001")) == 1
    assert_in_sync(catalog, "TST4001")


def test_delete_followed_by_get_shape_has_no_rule_in_program_payload(
    catalog: Session, db_client: TestClient, admin_headers: dict[str, str]
):
    """A cleared rule is serialised as null, never as an empty object."""
    data = db_client.delete(PREREQ_URL.format("TST2101"), headers=admin_headers).json()["data"]
    assert "prerequisiteRule" in data
    assert data["prerequisiteRule"] is None


# ==========================================
# PUT /courses/{id}/credit-distribution
# ==========================================


def test_credit_distribution_replaces_rows_and_bumps_timestamp(
    catalog: Session, db_client: TestClient, admin_headers: dict[str, str]
):
    entries = [{"semesterIndex": 7, "creditsAllocated": 4}, {"semesterIndex": 8, "creditsAllocated": 2}]

    response = db_client.put(CREDIT_URL.format("TST4001"), json=entries, headers=admin_headers)

    assert response.status_code == 200
    body = response.json()
    assert body["success"] is True
    assert body["data"]["creditDistribution"] == entries
    stored = reload(catalog, "TST4001")
    assert sorted((d.semester_index, d.credits_allocated) for d in stored.credit_distribution) == [(7, 4), (8, 2)]
    assert catalog.query(CreditDistribution).filter_by(course_id="TST4001").count() == 2
    assert stored.updated_at > OLD_TIMESTAMP


def test_credit_distribution_accepts_unordered_entries(
    catalog: Session, db_client: TestClient, admin_headers: dict[str, str]
):
    entries = [{"semesterIndex": 8, "creditsAllocated": 5}, {"semesterIndex": 7, "creditsAllocated": 1}]
    response = db_client.put(CREDIT_URL.format("TST4001"), json=entries, headers=admin_headers)
    assert response.status_code == 200
    assert response.json()["data"]["creditDistribution"] == [
        {"semesterIndex": 7, "creditsAllocated": 1},
        {"semesterIndex": 8, "creditsAllocated": 5},
    ]


def test_credit_distribution_leaves_prerequisite_rule_alone(
    catalog: Session, db_client: TestClient, admin_headers: dict[str, str]
):
    stored = reload(catalog, "TST4001").prerequisite_rule
    entries = [{"semesterIndex": 7, "creditsAllocated": 2}, {"semesterIndex": 8, "creditsAllocated": 4}]
    assert db_client.put(CREDIT_URL.format("TST4001"), json=entries, headers=admin_headers).status_code == 200
    assert reload(catalog, "TST4001").prerequisite_rule == stored
    assert_in_sync(catalog, "TST4001")


def test_single_semester_course_distribution(catalog: Session, db_client: TestClient, admin_headers: dict[str, str]):
    ok = db_client.put(
        CREDIT_URL.format("TST1101"), json=[{"semesterIndex": 1, "creditsAllocated": 3}], headers=admin_headers
    )
    assert ok.status_code == 200
    assert ok.json()["data"]["creditDistribution"] == [{"semesterIndex": 1, "creditsAllocated": 3}]


@pytest.mark.parametrize(
    "entries",
    [
        [],
        [{"semesterIndex": 7, "creditsAllocated": 6}],  # missing semester 8
        [{"semesterIndex": 7, "creditsAllocated": 3}, {"semesterIndex": 8, "creditsAllocated": 2}],  # sums to 5
        [{"semesterIndex": 7, "creditsAllocated": 4}, {"semesterIndex": 8, "creditsAllocated": 4}],  # sums to 8
        [{"semesterIndex": 6, "creditsAllocated": 3}, {"semesterIndex": 7, "creditsAllocated": 3}],  # wrong window
        [{"semesterIndex": 7, "creditsAllocated": 3}, {"semesterIndex": 9, "creditsAllocated": 3}],  # gap
        [
            {"semesterIndex": 7, "creditsAllocated": 2},
            {"semesterIndex": 7, "creditsAllocated": 4},
            {"semesterIndex": 8, "creditsAllocated": 0},
        ],  # duplicate semester
        [
            {"semesterIndex": 7, "creditsAllocated": 2},
            {"semesterIndex": 8, "creditsAllocated": 2},
            {"semesterIndex": 9, "creditsAllocated": 2},
        ],  # too many
    ],
)
def test_invalid_credit_distribution_is_422_and_leaves_rows_untouched(
    catalog: Session, db_client: TestClient, admin_headers: dict[str, str], entries: list[dict[str, int]]
):
    before = snapshot(catalog)
    response = db_client.put(CREDIT_URL.format("TST4001"), json=entries, headers=admin_headers)
    assert response.status_code == 422
    if response.json()["detail"][0]["type"] == "value_error":
        assert locs(response) == [["body", "creditDistribution"]]
    assert snapshot(catalog) == before


def test_credit_distribution_error_messages_explain_the_problem(
    catalog: Session, db_client: TestClient, admin_headers: dict[str, str]
):
    sums_wrong = db_client.put(
        CREDIT_URL.format("TST4001"),
        json=[{"semesterIndex": 7, "creditsAllocated": 1}, {"semesterIndex": 8, "creditsAllocated": 1}],
        headers=admin_headers,
    )
    assert "sum to 2" in messages(sums_wrong)
    wrong_window = db_client.put(
        CREDIT_URL.format("TST4001"), json=[{"semesterIndex": 7, "creditsAllocated": 6}], headers=admin_headers
    )
    assert "semesters 7 to 8" in messages(wrong_window)


@pytest.mark.parametrize(
    "body",
    [
        {"semesterIndex": 7, "creditsAllocated": 6},  # object instead of array
        [{"semesterIndex": 7}],
        [{"creditsAllocated": 3}],
        [{"semesterIndex": "seven", "creditsAllocated": 3}],
        "nope",
    ],
)
def test_malformed_credit_distribution_shapes_are_rejected(
    catalog: Session, db_client: TestClient, admin_headers: dict[str, str], body: Any
):
    before = snapshot(catalog)
    assert db_client.put(CREDIT_URL.format("TST4001"), json=body, headers=admin_headers).status_code == 422
    assert snapshot(catalog) == before


# ==========================================
# Real catalogs
# ==========================================


def test_real_catalog_rules_are_valid_and_round_trip_through_put(
    db_session: Session, db_client: TestClient, admin_headers: dict[str, str]
):
    """Every seeded rule (both programs) passes find_rule_issues and re-PUTs unchanged without error."""
    seed_database(db_session)
    known = {course.id for course in db_session.query(Course)}
    adapter = TypeAdapter(PrerequisiteRuleSchema)
    # Filter in Python: a stored JSON null is not SQL NULL.
    ruled = [(c.id, c.prerequisite_rule) for c in db_session.query(Course) if c.prerequisite_rule]
    assert len(ruled) > 20

    for course_id, stored in ruled:
        issues = find_rule_issues(adapter.validate_python(stored), course_id=course_id, known_course_ids=known)
        assert issues == [], f"{course_id}: {issues}"

    for course_id, stored in ruled:
        response = db_client.put(PREREQ_URL.format(course_id), json=stored, headers=admin_headers)
        assert response.status_code == 200, f"{course_id}: {response.text}"
        assert response.json()["data"]["prerequisiteRule"] == stored, course_id
        assert reload(db_session, course_id).prerequisite_rule == stored
        assert_in_sync(db_session, course_id)


def test_real_catalog_cycle_is_still_detected(db_session: Session, db_client: TestClient, admin_headers: dict[str, str]):
    """Reversing any real single-course dependency must be rejected as circular."""
    seed_database(db_session)
    pair = next(
        (c.id, c.prerequisite_rule["courseId"])
        for c in db_session.query(Course)
        if c.prerequisite_rule and c.prerequisite_rule["type"] == "COURSE"
    )
    course_id, requires = pair
    before = snapshot(db_session)
    response = db_client.put(PREREQ_URL.format(requires), json=course_leaf(course_id), headers=admin_headers)
    assert response.status_code == 422
    assert locs(response) == [["body", "prerequisiteRule"]]
    assert snapshot(db_session) == before


def test_real_multi_semester_distribution_round_trips(
    db_session: Session, db_client: TestClient, admin_headers: dict[str, str]
):
    """Re-PUTting every real multi-semester course's own distribution is accepted unchanged."""
    seed_database(db_session)
    multi = [c.id for c in db_session.query(Course) if c.duration_semesters > 1]
    assert multi
    for course_id in multi:
        stored = sorted(
            (d.semester_index, d.credits_allocated) for d in reload(db_session, course_id).credit_distribution
        )
        body = [{"semesterIndex": i, "creditsAllocated": c} for i, c in stored]
        response = db_client.put(CREDIT_URL.format(course_id), json=body, headers=admin_headers)
        assert response.status_code == 200, f"{course_id}: {response.text}"
        assert response.json()["data"]["creditDistribution"] == body
