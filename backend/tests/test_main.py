"""Tests for FastAPI application startup, health, CORS, and root endpoints."""

from app.core.config import settings
from fastapi.testclient import TestClient


def test_health_check_endpoint(client: TestClient):
    """Verify GET /api/health returns operational status."""
    response = client.get("/api/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert data["service"] == settings.PROJECT_NAME
    assert data["version"] == settings.VERSION


def test_cors_headers_present(client: TestClient):
    """Verify CORS middleware headers are sent on preflight requests."""
    response = client.options(
        "/api/health",
        headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "GET",
        },
    )
    assert response.status_code == 200
    assert "access-control-allow-origin" in response.headers


def test_openapi_json_available(client: TestClient):
    """Verify OpenAPI schema is accessible."""
    response = client.get("/openapi.json")
    assert response.status_code == 200
    schema = response.json()
    assert schema["info"]["title"] == settings.PROJECT_NAME
    assert "paths" in schema


def test_docs_ui_available(client: TestClient):
    """Verify Swagger UI docs endpoint loads."""
    response = client.get("/docs")
    assert response.status_code == 200


def test_non_existent_endpoint_returns_404(client: TestClient):
    """Verify arbitrary unknown route returns 404."""
    response = client.get("/api/v1/nonexistent-route-xyz")
    assert response.status_code == 404
