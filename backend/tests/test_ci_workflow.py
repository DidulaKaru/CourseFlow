"""CF-122 regression locks for .github/workflows/ci.yml."""

from pathlib import Path

import pytest

CI_FILE = Path(__file__).resolve().parents[2] / ".github" / "workflows" / "ci.yml"

pytestmark = pytest.mark.skipif(
    not CI_FILE.exists(), reason="repo root not mounted (e.g. inside backend container)"
)


def _text() -> str:
    return CI_FILE.read_text(encoding="utf-8")


def test_typecheck_step_really_checks_the_frontend():
    # Root tsconfig.json has `files: []`; bare `tsc --noEmit` passes without checking anything.
    text = _text()
    assert "npm run typecheck" in text
    assert "npx tsc --noEmit" not in text


def test_runs_on_every_pull_request_and_main_dev_pushes():
    text = _text()
    assert "push:\n    branches: [main, dev]" in text
    assert "pull_request:\n" in text
    assert "pull_request:\n    branches" not in text


def test_all_quality_gate_commands_present():
    text = _text()
    for command in ("npm ci", "npm run lint", "npm test", "npm run build",
                    "ruff check backend/", "pytest backend/tests"):
        assert command in text

def test_backend_coverage_threshold_is_enforced():
    # CF-124: CI must fail if backend coverage drops below 85%.
    text = _text()
    assert "--cov=backend/app" in text
    assert "--cov-fail-under=85" in text
