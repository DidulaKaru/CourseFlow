"""CF-123 regression locks for the local pre-commit quality hooks."""

import json
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
PACKAGE_JSON = REPO_ROOT / "package.json"

pytestmark = pytest.mark.skipif(
    not PACKAGE_JSON.exists(), reason="repo root not mounted (e.g. inside backend container)"
)


def test_lint_staged_covers_ts_json_and_python():
    config = json.loads(PACKAGE_JSON.read_text(encoding="utf-8"))["lint-staged"]
    patterns = " ".join(config)
    assert "ts" in patterns and "json" in patterns and "backend/**/*.py" in config
    assert config["backend/**/*.py"] == ["python -m ruff check"]


def test_pre_commit_hook_runs_lint_staged_and_typecheck():
    hook = (REPO_ROOT / ".husky" / "pre-commit").read_text(encoding="utf-8")
    assert "npx lint-staged" in hook
    assert "npm run typecheck" in hook


def test_curriculum_data_is_never_reformatted():
    ignore = (REPO_ROOT / ".prettierignore").read_text(encoding="utf-8").splitlines()
    assert "backend/data" in ignore and "frontend/src/data" in ignore
