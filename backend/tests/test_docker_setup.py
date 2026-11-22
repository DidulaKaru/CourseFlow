"""CF-121 regression locks for the Docker Compose local stack."""

from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
REPO_ROOT = BACKEND_DIR.parent


def test_entrypoint_uses_lf_line_endings():
    # A CRLF shebang ("#!/bin/sh\r") makes the backend container crash-loop with
    # "exec /app/entrypoint.sh: no such file or directory" on Windows checkouts.
    content = (BACKEND_DIR / "entrypoint.sh").read_bytes()
    assert content.startswith(b"#!/bin/sh\n")
    assert b"\r\n" not in content


def test_gitattributes_forces_lf_for_shell_scripts():
    gitattributes = REPO_ROOT / ".gitattributes"
    if not gitattributes.exists():
        # Backend container only mounts backend/, so the repo root is not visible there.
        return
    rules = gitattributes.read_text().splitlines()
    assert "*.sh text eol=lf" in rules
