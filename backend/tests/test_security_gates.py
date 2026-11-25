"""CF-225 regression locks: secret scanning, the DOCX DTD hardening a Bandit scan led to, and the CI security gates."""

import importlib.util
import io
import shutil
import subprocess
import sys
import zipfile
from pathlib import Path
from types import ModuleType

import pytest
from app.services.docx_parser import read_docx
from app.services.extraction_contract import ExtractionError

from tests.document_factory import make_docx

REPO_ROOT = Path(__file__).resolve().parents[2]
SCANNER = REPO_ROOT / "scripts" / "check_secrets.py"
SECURITY_WORKFLOW = REPO_ROOT / ".github" / "workflows" / "security.yml"
CI_WORKFLOW = REPO_ROOT / ".github" / "workflows" / "ci.yml"
PRE_COMMIT = REPO_ROOT / ".husky" / "pre-commit"

needs_repo = pytest.mark.skipif(not SCANNER.exists(), reason="repo root not mounted (e.g. inside backend container)")


def load_scanner() -> ModuleType:
    # backend/scripts is also importable as `scripts`, so load the repo-level script by path.
    spec = importlib.util.spec_from_file_location("check_secrets", SCANNER)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules["check_secrets"] = module
    spec.loader.exec_module(module)
    return module


# Secret-shaped values are assembled at run time so this file does not trip the scanner it tests.
AWS_KEY = "AKIA" + "ABCDEFGHIJKLMNOP"
PRIVATE_KEY = "-----BEGIN " + "RSA PRIVATE KEY-----"
JWT = "eyJhbGciOiJIUzI1NiJ9" + ".eyJzdWIiOiJhZG1pbiJ9" + ".abcdefghijklmnopqrstuvwx"
BCRYPT = "$2b$12$" + "".join(chr(97 + index % 26) for index in range(53))
NEON_URL = "postgresql://neondb_owner:" + "Xk39sLmQ72vB" + "@ep-quiet-dust-1234.us-east-2.aws.neon.tech/neondb"
DB_URL = "postgresql://app:" + "Hq83ksLz02mP" + "@db.internal:5432/courseflow"
LITERAL_KEY = "Zk3p9Xq7" + "LmN2vB8rT5y"


# ==========================================
# Secret scanner
# ==========================================


@needs_repo
@pytest.mark.parametrize(
    ("line", "expected"),
    [
        (f'SECRET_KEY = "{LITERAL_KEY}"', "hardcoded secret"),
        (f"ADMIN_PASSWORD_HASH='{BCRYPT}'", "bcrypt password hash"),
        (f"key: {AWS_KEY}", "AWS access key"),
        (PRIVATE_KEY, "private key block"),
        (f'token = "{JWT}"', "signed JWT"),
        (f"DATABASE_URL={NEON_URL}", "Neon database host"),
        (f"DATABASE_URL={DB_URL}", "database URL with an embedded password"),
    ],
    ids=["literal-secret-key", "bcrypt-hash", "aws-key", "private-key", "jwt", "neon-url", "database-url"],
)
def test_scanner_flags_real_looking_secrets(line: str, expected: str):
    findings = load_scanner().scan_text("backend/app/core/example_module.py", line + "\n")

    assert findings, f"nothing flagged for: {line[:30]}..."
    assert any(expected in finding.rule for finding in findings)


@needs_repo
@pytest.mark.parametrize(
    ("path", "line"),
    [
        (".env.example", "ADMIN_PASSWORD_HASH='replace-with-bcrypt-hash-of-admin-password'"),
        (".env.example", "SECRET_KEY=replace-with-a-long-random-string-at-least-32-characters"),
        (".env.example", "POSTGRES_PASSWORD=CourseFlow5678db"),
        (".env.example", "# DATABASE_URL=postgresql+psycopg://postgres:CourseFlow5678db@localhost:5432/courseflow"),
        ("docker-compose.yml", "DATABASE_URL: postgresql+psycopg://${POSTGRES_USER:-postgres}:${POSTGRES_PASSWORD:-CourseFlow5678db}@db:5432/x"),
        ("backend/app/core/config.py", 'DATABASE_URL: str = "postgresql://postgres:postgres@localhost:5432/courseflow"'),
        ("backend/app/core/security.py", "password = get_password_from_terminal()"),
        ("backend/app/core/security.py", 'SECRET_KEY: str = os.environ["SECRET_KEY"]'),
        ("docs/DEPLOYMENT.md", "postgresql://neondb_owner:npg_password@ep-cool-fog-12345678.aws.neon.tech/neondb"),
        ("backend/tests/conftest.py", 'monkeypatch.setattr(settings, "SECRET_KEY", "conftest-secret-key-long-enough-for-hs256")'),
    ],
    ids=[
        "env-hash-placeholder", "env-secret-placeholder", "local-dev-password", "local-dev-url", "compose-default",
        "config-default", "terminal-prompt", "env-lookup", "docs-neon-example", "test-fixture-secret",
    ],
)
def test_scanner_allows_placeholders_local_dev_defaults_and_code(path: str, line: str):
    assert load_scanner().scan_text(path, line + "\n") == []


@needs_repo
def test_scanner_still_flags_a_provider_key_inside_a_test_file():
    findings = load_scanner().scan_text("backend/tests/test_thing.py", f'KEY = "{AWS_KEY}"\n')

    assert [finding.rule for finding in findings] == ["AWS access key"]


@needs_repo
def test_an_allow_marker_silences_one_line_only():
    scanner = load_scanner()
    text = f'A = "{AWS_KEY}"  # secret-scan: allow\nB = "{AWS_KEY}"\n'

    findings = scanner.scan_text("backend/app/x.py", text)

    assert [finding.line for finding in findings] == [2]


@needs_repo
def test_a_real_looking_value_in_env_example_is_reported():
    findings = load_scanner().scan_text(".env.example", f"SECRET_KEY={LITERAL_KEY}\n")

    assert findings and "env.example" in findings[0].rule


@needs_repo
def test_scanner_exits_non_zero_for_a_leaked_secret_and_zero_for_a_clean_file(tmp_path: Path):
    leaked = REPO_ROOT / "scratch_leaked_secret_for_test.py"
    clean = REPO_ROOT / "scratch_clean_file_for_test.py"
    try:
        leaked.write_text(f'AWS = "{AWS_KEY}"\n', encoding="utf-8")
        clean.write_text("VALUE = 1\n", encoding="utf-8")

        bad = subprocess.run([sys.executable, str(SCANNER), str(leaked)], capture_output=True, text=True, check=False)
        good = subprocess.run([sys.executable, str(SCANNER), str(clean)], capture_output=True, text=True, check=False)
    finally:
        leaked.unlink(missing_ok=True)
        clean.unlink(missing_ok=True)

    assert bad.returncode == 1
    assert "scratch_leaked_secret_for_test.py:1" in bad.stderr
    assert AWS_KEY not in bad.stderr + bad.stdout, "findings must never echo the secret itself"
    assert good.returncode == 0


@needs_repo
@pytest.mark.skipif(shutil.which("git") is None, reason="git is not installed")
def test_the_committed_repository_has_no_secrets():
    # Acceptance: an exposed secret fails the pipeline, so the tree it runs on must start clean.
    result = subprocess.run([sys.executable, str(SCANNER)], capture_output=True, text=True, cwd=REPO_ROOT, check=False)

    assert result.returncode == 0, result.stderr


# ==========================================
# DOCX entity-expansion hardening (found by the Bandit gate)
# ==========================================

_BODY = (
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
    "<w:body><w:p><w:r><w:t>&x;</w:t></w:r></w:p></w:body></w:document>"
)
_DTD = '<!DOCTYPE document [<!ENTITY x "EXPANDED">]>'


def docx_with_xml(xml: bytes) -> bytes:
    output = io.BytesIO()
    with zipfile.ZipFile(output, "w") as archive:
        archive.writestr("word/document.xml", xml)
    return output.getvalue()


@pytest.mark.parametrize(
    "xml",
    [
        ('<?xml version="1.0"?>' + _DTD + _BODY).encode("utf-8"),
        ('<?xml version="1.0"?>' + _DTD.replace("DOCTYPE", "doctype") + _BODY).encode("utf-8"),
        ('<?xml version="1.0" encoding="UTF-16"?>' + _DTD + _BODY).encode("utf-16"),
        ('<?xml version="1.0" encoding="UTF-16"?>' + _DTD + _BODY).encode("utf-16-be"),
    ],
    ids=["utf-8", "lowercase", "utf-16-bom", "utf-16-be"],
)
def test_a_docx_that_declares_a_dtd_is_refused_whatever_its_encoding(xml: bytes):
    # CF-225: a byte search for "<!DOCTYPE" missed UTF-16 documents, so the entity was expanded.
    with pytest.raises(ExtractionError, match="could not be read"):
        read_docx(docx_with_xml(xml))


def test_an_ordinary_docx_still_parses_after_the_hardening():
    lines, tables = read_docx(make_docx(["Course Code: CE3301"], tables=[[["Lectures", "28"]]]))

    assert "Course Code: CE3301" in lines
    assert tables == [[["Lectures", "28"]]]


# ==========================================
# Workflow and hook configuration
# ==========================================


@needs_repo
def test_security_workflow_runs_every_scan_on_pull_requests_and_weekly():
    text = SECURITY_WORKFLOW.read_text(encoding="utf-8")

    assert "pull_request:\n" in text
    assert "pull_request:\n    branches" not in text
    assert "schedule:" in text
    for command in (
        "python scripts/check_secrets.py",
        "bandit -r backend/app backend/scripts -ll",
        "pip-audit -r backend/requirements.txt",
        "npm audit --audit-level=high",
    ):
        assert command in text, command
    assert "continue-on-error" not in text, "a security finding must fail the job"


@needs_repo
def test_ci_runs_migrations_and_tests_on_a_real_postgres_service():
    text = CI_WORKFLOW.read_text(encoding="utf-8")

    assert "image: pgvector/pgvector:pg16" in text
    assert "--health-cmd" in text
    assert "alembic upgrade head" in text
    assert "CF_TEST_POSTGRES_URL" in text
    assert "DATABASE_URL: postgresql://" in text


@needs_repo
def test_ci_installs_tesseract_so_the_real_ocr_tests_do_not_skip():
    assert "apt-get install -y tesseract-ocr" in CI_WORKFLOW.read_text(encoding="utf-8")


@needs_repo
def test_pre_commit_scans_staged_files_for_secrets():
    assert "python scripts/check_secrets.py --staged" in PRE_COMMIT.read_text(encoding="utf-8")
