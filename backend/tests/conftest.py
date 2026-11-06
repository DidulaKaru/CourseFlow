"""Pytest fixtures and configuration for CourseFlow backend tests."""

import json
from collections.abc import Generator
from pathlib import Path

import pytest
from app.core.config import settings
from app.main import app
from app.schemas.curriculum import (
    CourseRuleNode,
    CreditThresholdRuleNode,
    LogicalRuleNode,
)
from fastapi.testclient import TestClient


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
