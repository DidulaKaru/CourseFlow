"""Unit tests for SQLAlchemy models, Alembic configuration, and seeder script (CF-131, CF-132, CF-135)."""

import pytest
from app.models.curriculum import (
    Base,
    Course,
    CreditDistribution,
    DegreeProgram,
    PrerequisiteRule,
)
from scripts.seed_db import seed_database
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker


@pytest.fixture
def in_memory_db():
    """Create a fresh in-memory SQLite database for testing schema and seeder."""
    engine = create_engine("sqlite:///:memory:", echo=False)
    Base.metadata.create_all(bind=engine)
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()
        Base.metadata.drop_all(bind=engine)


def test_models_schema_structure(in_memory_db):
    """Test creating DegreeProgram, Course, and CreditDistribution entities with foreign keys."""
    prog = DegreeProgram(
        id="test-prog",
        name="Test Engineering",
        department="Department of Testing",
        total_credits_required=150,
        min_credits_per_semester=18,
        max_credits_per_semester=24,
        semesters_count=8,
    )
    course = Course(
        id="TEST101",
        code="TEST101",
        title="Testing Fundamentals",
        description="Intro to testing.",
        total_credits=3,
        duration_semesters=1,
        recommended_semester=1,
        type="CORE",
        prerequisite_rule=None,
        corequisites=[],
        offered_semesters=["FALL"],
    )
    dist = CreditDistribution(
        course_id="TEST101",
        semester_index=1,
        credits_allocated=3,
    )
    course.credit_distribution.append(dist)
    prog.courses.append(course)

    in_memory_db.add(prog)
    in_memory_db.commit()

    saved_prog = in_memory_db.get(DegreeProgram, "test-prog")
    assert saved_prog is not None
    assert len(saved_prog.courses) == 1
    assert saved_prog.courses[0].code == "TEST101"
    assert len(saved_prog.courses[0].credit_distribution) == 1
    assert saved_prog.courses[0].credit_distribution[0].credits_allocated == 3


def test_seed_database_idempotency(in_memory_db):
    """Test that seed_database populates both degrees and runs idempotently without errors or duplicates."""
    # Run 1: initial seed
    stats_1 = seed_database(in_memory_db)
    assert stats_1["programs_upserted"] == 2
    assert stats_1["courses_upserted"] > 100

    ce_prog = in_memory_db.get(DegreeProgram, "computer-eng")
    ee_prog = in_memory_db.get(DegreeProgram, "electrical-eng")
    assert ce_prog is not None
    assert ee_prog is not None
    assert len(ce_prog.courses) == 80
    assert len(ee_prog.courses) == 95

    # Run 2: idempotent re-seed
    stats_2 = seed_database(in_memory_db)
    assert stats_2["programs_upserted"] == 2

    # Total counts should remain stable
    total_courses = in_memory_db.query(Course).count()
    assert total_courses == 143  # 80 CE + 95 EE - 32 overlap = 143 unique courses
    total_rules = in_memory_db.query(PrerequisiteRule).count()
    assert total_rules > 0
