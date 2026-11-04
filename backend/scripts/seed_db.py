"""Automated Database Seeder Script (CF-135).

Reads validated JSON curriculum datasets (computer_engineering.json, electrical_engineering.json)
and idempotently populates the PostgreSQL database.
"""

import json
import sys
from pathlib import Path
from typing import Any

# Ensure backend root is on sys.path
backend_dir = Path(__file__).resolve().parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from app.core.config import settings
from app.core.database import SessionLocal, engine
from app.models.curriculum import (
    Base,
    Course,
    CreditDistribution,
    DegreeProgram,
    PrerequisiteRule,
    program_courses,
)
from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session


def extract_referenced_course_ids(rule: dict[str, Any] | None) -> set[str]:
    """Recursively extract all course IDs referenced within a prerequisite AST."""
    if not rule:
        return set()
    node_type = rule.get("type")
    if node_type == "COURSE":
        course_id = rule.get("courseId")
        return {course_id} if course_id else set()
    if node_type in ("AND", "OR"):
        ids: set[str] = set()
        for child in rule.get("children", []):
            ids |= extract_referenced_course_ids(child)
        return ids
    return set()


def validate_curriculum_integrity(programs_data: list[dict[str, Any]]) -> None:
    """Validate that there are no dangling prerequisite references across all programs."""
    all_catalog_course_ids: set[str] = set()
    for prog in programs_data:
        for course in prog.get("courses", []):
            all_catalog_course_ids.add(course["id"])
            all_catalog_course_ids.add(course["code"])

    dangling_errors: list[str] = []
    for prog in programs_data:
        prog_id = prog.get("id")
        for course in prog.get("courses", []):
            referenced = extract_referenced_course_ids(course.get("prerequisiteRule"))
            unresolved = referenced - all_catalog_course_ids
            if unresolved:
                dangling_errors.append(
                    f"Program '{prog_id}', Course '{course['id']}': dangling prerequisite(s) {unresolved}"
                )

    if dangling_errors:
        raise ValueError("Integrity validation failed with dangling prerequisites:\n" + "\n".join(dangling_errors))


def seed_database(db: Session, programs_dir: Path | None = None) -> dict[str, int]:
    """Populate database idempotently from curriculum JSON files."""
    if programs_dir is None:
        programs_dir = settings.DATA_PROGRAMS_DIR

    program_files = [
        programs_dir / "computer_engineering.json",
        programs_dir / "electrical_engineering.json",
    ]

    programs_data: list[dict[str, Any]] = []
    for p_file in program_files:
        if not p_file.exists():
            raise FileNotFoundError(f"Curriculum file not found: {p_file}")
        with open(p_file, encoding="utf-8") as f:
            programs_data.append(json.load(f))

    # 1. Validate data integrity
    validate_curriculum_integrity(programs_data)
    print("[OK] Data integrity validated: 0 dangling prerequisite references.")

    stats = {
        "programs_upserted": 0,
        "courses_upserted": 0,
        "credit_distributions_upserted": 0,
        "prerequisite_rules_upserted": 0,
    }

    # 2. Upsert Degree Programs and Courses
    for p_data in programs_data:
        prog_id = p_data["id"]
        degree_prog = db.get(DegreeProgram, prog_id)
        if not degree_prog:
            degree_prog = DegreeProgram(
                id=prog_id,
                name=p_data["name"],
                department=p_data["department"],
                total_credits_required=p_data.get("totalCreditsRequired", 150),
                min_credits_per_semester=p_data.get("minCreditsPerSemester", 18),
                max_credits_per_semester=p_data.get("maxCreditsPerSemester", 24),
                semesters_count=p_data.get("semestersCount", 8),
            )
            db.add(degree_prog)
        else:
            degree_prog.name = p_data["name"]
            degree_prog.department = p_data["department"]
            degree_prog.total_credits_required = p_data.get("totalCreditsRequired", 150)
            degree_prog.min_credits_per_semester = p_data.get("minCreditsPerSemester", 18)
            degree_prog.max_credits_per_semester = p_data.get("maxCreditsPerSemester", 24)
            degree_prog.semesters_count = p_data.get("semestersCount", 8)
        db.flush()
        stats["programs_upserted"] += 1

        for c_data in p_data.get("courses", []):
            course_id = c_data["id"]
            course = db.get(Course, course_id)
            if not course:
                course = Course(
                    id=course_id,
                    code=c_data["code"],
                    title=c_data["title"],
                    description=c_data.get("description", ""),
                    total_credits=c_data["totalCredits"],
                    duration_semesters=c_data.get("durationSemesters", 1),
                    recommended_semester=c_data["recommendedSemester"],
                    type=c_data["type"],
                    prerequisite_rule=c_data.get("prerequisiteRule"),
                    corequisites=c_data.get("corequisites", []),
                    offered_semesters=c_data.get("offeredSemesters", []),
                    syllabus_objectives=c_data.get("syllabusObjectives", []),
                    contact_hours=c_data.get("contactHours", {}),
                )
                db.add(course)
                db.flush()
                stats["courses_upserted"] += 1
            else:
                course.code = c_data["code"]
                course.title = c_data["title"]
                course.description = c_data.get("description", "")
                course.total_credits = c_data["totalCredits"]
                course.duration_semesters = c_data.get("durationSemesters", 1)
                course.recommended_semester = c_data["recommendedSemester"]
                course.type = c_data["type"]
                course.prerequisite_rule = c_data.get("prerequisiteRule")
                course.corequisites = c_data.get("corequisites", [])
                course.offered_semesters = c_data.get("offeredSemesters", [])
                course.syllabus_objectives = c_data.get("syllabusObjectives", [])
                course.contact_hours = c_data.get("contactHours", {})
                db.flush()

            # Ensure many-to-many program association exists
            assoc_stmt = select(program_courses).where(
                program_courses.c.program_id == prog_id,
                program_courses.c.course_id == course_id,
            )
            if not db.execute(assoc_stmt).first():
                db.execute(
                    program_courses.insert().values(
                        program_id=prog_id,
                        course_id=course_id,
                    )
                )

            # Re-sync credit distributions idempotently
            db.query(CreditDistribution).filter_by(course_id=course_id).delete()
            for dist in c_data.get("creditDistribution", []):
                cd = CreditDistribution(
                    course_id=course_id,
                    semester_index=dist["semesterIndex"],
                    credits_allocated=dist["creditsAllocated"],
                )
                db.add(cd)
                stats["credit_distributions_upserted"] += 1

            # Sync explicit prerequisite_rules table record if present
            pr_rule = c_data.get("prerequisiteRule")
            db.query(PrerequisiteRule).filter_by(course_id=course_id).delete()
            if pr_rule:
                rule_record = PrerequisiteRule(
                    course_id=course_id,
                    rule_type=pr_rule.get("type", "UNKNOWN"),
                    expression=pr_rule,
                )
                db.add(rule_record)
                stats["prerequisite_rules_upserted"] += 1

    db.commit()
    return stats


def main() -> None:
    """CLI execution for database seeding."""
    print("CourseFlow Database Seeder (CF-135)")
    print(f"Connecting to database: {settings.DATABASE_URL}")

    # Ensure tables exist (creates if not present)
    Base.metadata.create_all(bind=engine)

    with SessionLocal() as session:
        try:
            results = seed_database(session)
            print("[OK] Database seeded successfully:")
            for key, count in results.items():
                print(f"  - {key}: {count}")
        except (SQLAlchemyError, OSError, ValueError) as e:
            session.rollback()
            print(f"[ERROR] Seeding failed: {e}", file=sys.stderr)
            sys.exit(1)


if __name__ == "__main__":
    main()
