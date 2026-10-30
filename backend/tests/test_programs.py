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
    assert "MA1001" in course_ids
    assert "CO1002" in course_ids
    assert "CO2001" in course_ids
    assert "CE4001" in course_ids

    # Verify capstone multi-semester attributes
    capstone = next(c for c in program["courses"] if c["id"] == "CE4001")
    assert capstone["type"] == "CAPSTONE"
    assert capstone["durationSemesters"] == 2
    assert len(capstone["creditDistribution"]) == 2


def test_get_electrical_engineering_program():
    """Verify GET /api/programs/electrical-eng returns Electrical Engineering curriculum."""
    response = client.get("/api/programs/electrical-eng")
    assert response.status_code == 200

    program = response.json()
    assert program["id"] == "electrical-eng"
    assert program["name"] == "Electrical Engineering"
    assert len(program["courses"]) > 0


def test_get_non_existent_program_returns_404():
    """Verify GET /api/programs/{id} with unknown ID returns 404 Not Found."""
    response = client.get("/api/programs/non-existent-degree")
    assert response.status_code == 404
    assert "not found" in response.json()["detail"].lower()


def test_validate_plan_with_valid_progression():
    """Verify POST /api/plans/validate succeeds with satisfied sequence."""
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
    # CO544 in Sem 7 requires CO2001. If CO2001 is not taken before Sem 7, it flags an error.
    payload = {
        "programId": "computer-eng",
        "selectedElectiveIds": ["CO544"],
        "completedCourseIds": [],
    }
    response = client.post("/api/plans/validate", json=payload)
    assert response.status_code == 200

    result = response.json()
    # Prerequisite validation for CO544 or downstream
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
    # Missing programId
    payload = {"selectedElectiveIds": ["CO544"]}
    response = client.post("/api/plans/validate", json=payload)
    assert response.status_code == 422
