"""Pytest fixtures and configuration for CourseFlow backend tests."""

import json
from collections.abc import Generator
from pathlib import Path

import pytest
from app.core.config import settings
from app.core.database import Base, get_db, get_session_factory
from app.core.security import create_access_token, get_staff_accounts, hash_password
from app.main import app
from app.schemas.curriculum import (
    CourseRuleNode,
    CreditThresholdRuleNode,
    LogicalRuleNode,
)
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool


@pytest.fixture(scope="session")
def client() -> Generator[TestClient, None, None]:
    """Test client fixture for invoking FastAPI endpoints."""
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture
def sample_compound_ast() -> LogicalRuleNode:
    """Fixture providing a sample compound (AND / OR) AST rule."""
    return LogicalRuleNode(
        type="OR",
        children=[
            LogicalRuleNode(
                type="AND",
                children=[
                    CourseRuleNode(course_id="EC101"),
                    CourseRuleNode(course_id="EC102"),
                ],
            ),
            LogicalRuleNode(
                type="AND",
                children=[
                    CourseRuleNode(course_id="EC105"),
                    CreditThresholdRuleNode(min_credits=30),
                ],
            ),
        ],
    )


@pytest.fixture
def curriculum_data_path() -> Path:
    """Fixture returning the resolved path to curriculum programs."""
    return settings.DATA_PROGRAMS_DIR


@pytest.fixture
def computer_eng_data(curriculum_data_path: Path) -> dict:
    """Load Computer Engineering curriculum JSON dataset."""
    file_path = curriculum_data_path / "computer_engineering.json"
    with open(file_path, encoding="utf-8") as f:
        return json.load(f)


@pytest.fixture
def electrical_eng_data(curriculum_data_path: Path) -> dict:
    """Load Electrical Engineering curriculum JSON dataset."""
    file_path = curriculum_data_path / "electrical_engineering.json"
    with open(file_path, encoding="utf-8") as f:
        return json.load(f)


# ==========================================
# Database-backed endpoint fixtures (CF-202+)
# ==========================================


@pytest.fixture
def session_factory() -> Generator[sessionmaker[Session], None, None]:
    """Fresh in-memory SQLite database per test, shared across threads via StaticPool."""
    import app.models  # noqa: F401  (registers every table on Base.metadata)

    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(bind=engine)
    try:
        yield sessionmaker(autocommit=False, autoflush=False, bind=engine)
    finally:
        Base.metadata.drop_all(bind=engine)
        engine.dispose()


@pytest.fixture
def db_session(session_factory: sessionmaker[Session]) -> Generator[Session, None, None]:
    """A session for arranging and inspecting data, independent of the request sessions."""
    with session_factory() as session:
        yield session


@pytest.fixture
def db_client(session_factory: sessionmaker[Session]) -> Generator[TestClient, None, None]:
    """TestClient whose requests use the in-memory database through the real get_db dependency."""

    def override_get_db() -> Generator[Session, None, None]:
        with session_factory() as session:
            yield session

    app.dependency_overrides[get_db] = override_get_db
    # Background work (CF-204 extraction jobs) opens its own sessions; point it at the same database.
    app.dependency_overrides[get_session_factory] = lambda: session_factory
    try:
        with TestClient(app) as test_client:
            yield test_client
    finally:
        app.dependency_overrides.pop(get_db, None)
        app.dependency_overrides.pop(get_session_factory, None)


@pytest.fixture(scope="session")
def _test_password_hashes() -> dict[str, str]:
    """bcrypt is intentionally slow, so hash once per session."""
    return {"admin": hash_password("admin-test-password"), "reviewer": hash_password("reviewer-test-password")}


def _headers_for(role_key: str, monkeypatch: pytest.MonkeyPatch, hashes: dict[str, str]) -> dict[str, str]:
    monkeypatch.setattr(settings, "ENVIRONMENT", "development")
    monkeypatch.setattr(settings, "SECRET_KEY", "conftest-secret-key-long-enough-for-hs256")
    monkeypatch.setattr(settings, "ADMIN_USERNAME", "admin")
    monkeypatch.setattr(settings, "ADMIN_PASSWORD_HASH", hashes["admin"])
    monkeypatch.setattr(settings, "REVIEWER_USERNAME", "reviewer")
    monkeypatch.setattr(settings, "REVIEWER_PASSWORD_HASH", hashes["reviewer"])
    token, _ = create_access_token(get_staff_accounts()[role_key])
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def admin_headers(monkeypatch: pytest.MonkeyPatch, _test_password_hashes: dict[str, str]) -> dict[str, str]:
    """Authorization header for a configured ADMIN account."""
    return _headers_for("admin", monkeypatch, _test_password_hashes)


@pytest.fixture
def reviewer_headers(monkeypatch: pytest.MonkeyPatch, _test_password_hashes: dict[str, str]) -> dict[str, str]:
    """Authorization header for a configured FACULTY_REVIEWER account."""
    return _headers_for("reviewer", monkeypatch, _test_password_hashes)
