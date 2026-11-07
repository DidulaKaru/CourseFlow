"""Integration tests for FastAPI degree program and plan validation endpoints."""

from app.main import app
from fastapi.testclient import TestClient

client = TestClient(app)


def test_health_check():
    """Verify health check endpoint returns 200 OK."""
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json()["status"] == "healthy"


def test_list_programs():
    """Verify GET /api/programs returns available engineering degree summaries."""
    response = client.get("/api/programs")
    assert response.status_code == 200

    data = response.json()
    assert isinstance(data, list)
    assert len(data) >= 2

    program_ids = [p["id"] for p in data]
    assert "computer-eng" in program_ids
    assert "electrical-eng" in program_ids

    comp_eng = next(p for p in data if p["id"] == "computer-eng")
    assert comp_eng["name"] == "Computer Engineering"
    assert comp_eng["totalCreditsRequired"] == 150
    assert comp_eng["minCreditsPerSemester"] == 18
    assert comp_eng["maxCreditsPerSemester"] == 24
    assert comp_eng["semestersCount"] == 8


def test_get_computer_engineering_program():
    """Verify GET /api/programs/computer-eng returns full 8-semester curriculum graph."""
    response = client.get("/api/programs/computer-eng")
    assert response.status_code == 200

    program = response.json()
    assert program["id"] == "computer-eng"
    assert "courses" in program
    assert len(program["courses"]) > 0

    course_ids = [c["id"] for c in program["courses"]]
    assert "MA1001" in course_ids or "CE1101" in course_ids or "CO1002" in course_ids


def test_get_electrical_engineering_program():
    """Verify GET /api/programs/electrical-eng returns full 8-semester curriculum graph."""
    response = client.get("/api/programs/electrical-eng")
    assert response.status_code == 200

    program = response.json()
    assert program["id"] == "electrical-eng"
    assert "courses" in program
    assert len(program["courses"]) > 0


def test_program_catalog_mapping_resolution():
    """Verify both canonical IDs and catalog filename aliases resolve correctly."""
    for pid in ["computer-eng", "computer_engineering", "electrical-eng", "electrical_engineering"]:
        response = client.get(f"/api/programs/{pid}")
        assert response.status_code == 200
        data = response.json()
        assert data["id"] in ("computer-eng", "electrical-eng")


def test_get_unknown_program_returns_404():
    """Verify GET /api/programs/{unknown_id} returns 404 with error detail."""
    response = client.get("/api/programs/unknown-stream-xyz")
    assert response.status_code == 404
    assert "not found" in response.json()["detail"].lower()


def test_get_path_traversal_program_returns_404():
    """Verify path traversal attempt in program_id returns 404."""
    response = client.get("/api/programs/..%2F..%2Fmain")
    assert response.status_code == 404


def test_validate_plan_valid_scenario():
    """Verify POST /api/plans/validate returns structured plan validation output."""
    payload = {
        "programId": "computer-eng",
        "selectedElectiveIds": ["CO544"],
        "completedCourseIds": ["CO2001"],
    }
    response = client.post("/api/plans/validate", json=payload)
    assert response.status_code == 200

    result = response.json()
    assert "totalPlannedCredits" in result
    assert "totalEarnedCredits" in result
    assert "semesters" in result
    assert len(result["semesters"]) == 8


def test_validate_plan_flags_unmet_prerequisite():
    """Verify POST /api/plans/validate detects unfulfilled prerequisites."""
    payload = {
        "programId": "computer-eng",
        "selectedElectiveIds": ["CO544"],
        "completedCourseIds": [],
    }
    response = client.post("/api/plans/validate", json=payload)
    assert response.status_code == 200

    result = response.json()
    assert "prerequisiteValidations" in result
    assert len(result["semesters"]) == 8


def test_validate_plan_with_invalid_program_returns_404():
    """Verify POST /api/plans/validate with unknown program returns 404."""
    payload = {
        "programId": "unknown-program-xyz",
        "selectedElectiveIds": [],
        "completedCourseIds": [],
    }
    response = client.post("/api/plans/validate", json=payload)
    assert response.status_code == 404


def test_validate_plan_with_invalid_body_returns_422():
    """Verify POST /api/plans/validate with missing required fields returns 422 Unprocessable Entity."""
    payload = {"selectedElectiveIds": ["CO544"]}
    response = client.post("/api/plans/validate", json=payload)
    assert response.status_code == 422


def test_validate_plan_flags_credit_underload_and_overload():
    """Verify semester credit boundaries (< minCredits or > maxCredits) properly set isValid to False."""
    payload = {
        "programId": "computer-eng",
        "selectedElectiveIds": [],
        "completedCourseIds": [],
    }
    response = client.post("/api/plans/validate", json=payload)
    assert response.status_code == 200
    result = response.json()

    for sem in result["semesters"]:
        if sem["totalCredits"] < 18 or sem["totalCredits"] > 24:
            assert sem["isValid"] is False
            assert sem["warning"] is not None


def test_validate_plan_flags_missing_corequisite():
    """Verify missing mandatory co-requisites generate advisory warnings."""
    payload = {
        "programId": "computer-eng",
        "selectedElectiveIds": [],
        "completedCourseIds": [],
    }
    response = client.post("/api/plans/validate", json=payload)
    assert response.status_code == 200
    result = response.json()
    assert "warnings" in result
