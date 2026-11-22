"""Alembic migration chain tests (runs the real revisions against a throwaway SQLite file)."""

import os
import sqlite3
import subprocess
import sys
from pathlib import Path

import pytest

BACKEND_DIR = Path(__file__).resolve().parent.parent


def alembic(database_path: Path, *args: str) -> str:
    """Run the alembic CLI in a subprocess so its logging setup cannot leak into other tests."""
    env = {**os.environ, "DATABASE_URL": f"sqlite:///{database_path.as_posix()}"}
    result = subprocess.run(
        [sys.executable, "-m", "alembic", *args],
        cwd=BACKEND_DIR,
        env=env,
        capture_output=True,
        text=True,
        timeout=120,
        check=False,
    )
    assert result.returncode == 0, result.stdout + result.stderr
    return result.stdout + result.stderr


def course_columns(database_path: Path) -> set[str]:
    with sqlite3.connect(database_path) as connection:
        return {row[1] for row in connection.execute("PRAGMA table_info(courses)")}


def test_migration_chain_has_a_single_head(tmp_path: Path):
    """Two heads would make `alembic upgrade head` fail; new migrations must chain onto the latest one."""
    heads = [line for line in alembic(tmp_path / "heads.db", "heads").splitlines() if "(head)" in line]
    assert len(heads) == 1, heads


def test_updated_at_migration_upgrades_and_downgrades(tmp_path: Path):
    database = tmp_path / "migrate.db"

    alembic(database, "upgrade", "0001_initial_curriculum_tables")
    assert "updated_at" not in course_columns(database)
    with sqlite3.connect(database) as connection:
        connection.execute(
            "INSERT INTO courses (id, code, title, description, total_credits, duration_semesters, "
            "recommended_semester, type, corequisites, offered_semesters) "
            "VALUES ('OLD1001', 'OLD1001', 'Pre-existing', '', 3, 1, 1, 'CORE', '[]', '[]')"
        )

    alembic(database, "upgrade", "head")
    assert "updated_at" in course_columns(database)
    with sqlite3.connect(database) as connection:
        stamp = connection.execute("SELECT updated_at FROM courses WHERE id = 'OLD1001'").fetchone()[0]
    assert stamp, "rows that existed before the migration must receive a timestamp"

    alembic(database, "downgrade", "0001_initial_curriculum_tables")
    assert "updated_at" not in course_columns(database)
    with sqlite3.connect(database) as connection:
        assert connection.execute("SELECT COUNT(*) FROM courses").fetchone()[0] == 1


def table_names(database_path: Path) -> set[str]:
    with sqlite3.connect(database_path) as connection:
        return {row[0] for row in connection.execute("SELECT name FROM sqlite_master WHERE type = 'table'")}


def test_extraction_jobs_migration_upgrades_and_downgrades(tmp_path: Path):
    """CF-204: 0003 creates extraction_jobs with a unique file_hash and removes it cleanly."""
    database = tmp_path / "extraction.db"

    alembic(database, "upgrade", "0002_course_updated_at")
    assert "extraction_jobs" not in table_names(database)

    alembic(database, "upgrade", "head")
    assert "extraction_jobs" in table_names(database)
    insert = (
        "INSERT INTO extraction_jobs (id, filename, content_type, file_hash, status) "
        "VALUES (?, 'mis.pdf', 'application/pdf', ?, 'PENDING')"
    )
    with sqlite3.connect(database) as connection:
        connection.execute(insert, ("job-1", "f" * 64))
        stamps = connection.execute("SELECT created_at, updated_at FROM extraction_jobs").fetchone()
        assert all(stamps)
        # file_hash is unique so identical uploads share one job.
        with pytest.raises(sqlite3.IntegrityError):
            connection.execute(insert, ("job-2", "f" * 64))

    alembic(database, "downgrade", "0002_course_updated_at")
    assert "extraction_jobs" not in table_names(database)
    assert "courses" in table_names(database)
