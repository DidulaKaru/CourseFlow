"""Degree Program curriculum metadata endpoints."""

import json
from pathlib import Path

from fastapi import APIRouter, HTTPException, status

from app.core.config import settings
from app.schemas.curriculum import (
    Course,
    CourseType,
    CreditDistribution,
    DegreeProgram,
    DegreeProgramSummary,
    SemesterTerm,
)

router = APIRouter()


def _get_fallback_computer_eng() -> DegreeProgram:
    """Generate in-memory Computer Engineering curriculum graph."""
    # Attempt to load mock course to ensure exact identity fidelity
    repo_root = Path(__file__).resolve().parent.parent.parent.parent.parent
    mock_course_file = repo_root / "src" / "data" / "mock_course.json"
    capstone_course: Course | None = None

    if mock_course_file.exists():
        try:
            with open(mock_course_file, encoding="utf-8") as f:
                capstone_course = Course.model_validate(json.load(f))
        except (OSError, json.JSONDecodeError, ValueError):
            capstone_course = None

    if not capstone_course:
        capstone_course = Course(
            id="CE4001",
            code="CE4001",
            title="Comprehensive Engineering Design Project",
            description="Two-semester capstone research and hardware prototyping project.",
            total_credits=6,
            duration_semesters=2,
            recommended_semester=7,
            credit_distribution=[
                CreditDistribution(semester_index=7, credits_allocated=3),
                CreditDistribution(semester_index=8, credits_allocated=3),
            ],
            type=CourseType.CAPSTONE,
            offered_semesters=[SemesterTerm.BOTH],
        )

    courses: list[Course] = [
        Course(
            id="MA1001",
            code="MA1001",
            title="Calculus I",
            description="Single-variable calculus, differentiation, and integration.",
            total_credits=3,
            recommended_semester=1,
            credit_distribution=[CreditDistribution(semester_index=1, credits_allocated=3)],
            type=CourseType.CORE,
            offered_semesters=[SemesterTerm.FALL],
        ),
        Course(
            id="CO1001",
            code="CO1001",
            title="Introduction to Computer Engineering",
            description="Basic discrete math, logic gates, and computing history.",
            total_credits=3,
            recommended_semester=1,
            credit_distribution=[CreditDistribution(semester_index=1, credits_allocated=3)],
            type=CourseType.CORE,
            offered_semesters=[SemesterTerm.FALL],
        ),
        Course(
            id="CO1002",
            code="CO1002",
            title="Programming Methodology",
            description="Imperative and object-oriented programming fundamentals.",
            total_credits=3,
            recommended_semester=1,
            credit_distribution=[CreditDistribution(semester_index=1, credits_allocated=3)],
            type=CourseType.CORE,
            offered_semesters=[SemesterTerm.FALL],
        ),
        Course(
            id="CO1003L",
            code="CO1003L",
            title="Computing Laboratory I",
            description="Practical programming and software debugging lab.",
            total_credits=2,
            recommended_semester=1,
            credit_distribution=[CreditDistribution(semester_index=1, credits_allocated=2)],
            type=CourseType.LAB,
            corequisites=["CO1002"],
            offered_semesters=[SemesterTerm.FALL],
        ),
        Course(
            id="MA1002",
            code="MA1002",
            title="Calculus II",
            description="Multivariable calculus and linear differential equations.",
            total_credits=3,
            recommended_semester=2,
            credit_distribution=[CreditDistribution(semester_index=2, credits_allocated=3)],
            type=CourseType.CORE,
            prerequisite_rule={"type": "COURSE", "courseId": "MA1001"},
            offered_semesters=[SemesterTerm.SPRING],
        ),
        Course(
            id="CO2001",
            code="CO2001",
            title="Data Structures & Algorithms",
            description="Linear and non-linear data structures, trees, graphs, and sorting.",
            total_credits=3,
            recommended_semester=3,
            credit_distribution=[CreditDistribution(semester_index=3, credits_allocated=3)],
            type=CourseType.CORE,
            prerequisite_rule={"type": "COURSE", "courseId": "CO1002"},
            offered_semesters=[SemesterTerm.FALL],
        ),
        Course(
            id="CO3001",
            code="CO3001",
            title="Operating Systems",
            description="Process concurrency, memory management, and file systems.",
            total_credits=3,
            recommended_semester=5,
            credit_distribution=[CreditDistribution(semester_index=5, credits_allocated=3)],
            type=CourseType.CORE,
            prerequisite_rule={"type": "COURSE", "courseId": "CO2001"},
            offered_semesters=[SemesterTerm.FALL],
        ),
        Course(
            id="CO544",
            code="CO544",
            title="Machine Learning",
            description="Supervised, unsupervised, and deep learning paradigms.",
            total_credits=3,
            recommended_semester=7,
            credit_distribution=[CreditDistribution(semester_index=7, credits_allocated=3)],
            type=CourseType.ELECTIVE,
            prerequisite_rule={"type": "COURSE", "courseId": "CO2001"},
            offered_semesters=[SemesterTerm.FALL],
        ),
        capstone_course,
    ]

    return DegreeProgram(
        id="computer-eng",
        name="Computer Engineering",
        department="Department of Computer Engineering",
        total_credits_required=settings.TOTAL_CREDITS_REQUIRED,
        min_credits_per_semester=settings.MIN_CREDITS_PER_SEMESTER,
        max_credits_per_semester=settings.MAX_CREDITS_PER_SEMESTER,
        semesters_count=settings.DEFAULT_SEMESTERS_COUNT,
        courses=courses,
    )


def _get_fallback_electrical_eng() -> DegreeProgram:
    """Generate in-memory Electrical Engineering curriculum graph."""
    courses: list[Course] = [
        Course(
            id="EE1001",
            code="EE1001",
            title="Circuit Theory",
            description="Mesh and nodal analysis, AC/DC circuit theorems.",
            total_credits=3,
            recommended_semester=1,
            credit_distribution=[CreditDistribution(semester_index=1, credits_allocated=3)],
            type=CourseType.CORE,
            offered_semesters=[SemesterTerm.FALL],
        ),
        Course(
            id="MA1001",
            code="MA1001",
            title="Calculus I",
            description="Differential and integral calculus.",
            total_credits=3,
            recommended_semester=1,
            credit_distribution=[CreditDistribution(semester_index=1, credits_allocated=3)],
            type=CourseType.CORE,
            offered_semesters=[SemesterTerm.FALL],
        ),
        Course(
            id="EE1002L",
            code="EE1002L",
            title="Electrical Measurements Lab",
            description="Oscilloscopes, meters, and basic component characterization.",
            total_credits=2,
            recommended_semester=1,
            credit_distribution=[CreditDistribution(semester_index=1, credits_allocated=2)],
            type=CourseType.LAB,
            corequisites=["EE1001"],
            offered_semesters=[SemesterTerm.FALL],
        ),
        Course(
            id="EE2001",
            code="EE2001",
            title="Electromagnetic Fields",
            description="Maxwell's equations, wave propagation, and transmission lines.",
            total_credits=3,
            recommended_semester=3,
            credit_distribution=[CreditDistribution(semester_index=3, credits_allocated=3)],
            type=CourseType.CORE,
            prerequisite_rule={"type": "COURSE", "courseId": "EE1001"},
            offered_semesters=[SemesterTerm.FALL],
        ),
        Course(
            id="EE2002",
            code="EE2002",
            title="Signals & Systems",
            description="Fourier, Laplace, and Z-transforms for continuous/discrete signals.",
            total_credits=3,
            recommended_semester=3,
            credit_distribution=[CreditDistribution(semester_index=3, credits_allocated=3)],
            type=CourseType.CORE,
            prerequisite_rule={"type": "COURSE", "courseId": "MA1001"},
            offered_semesters=[SemesterTerm.FALL],
        ),
        Course(
            id="EE3001",
            code="EE3001",
            title="Power Systems Analysis",
            description="Load flow analysis, symmetrical components, and grid protection.",
            total_credits=3,
            recommended_semester=5,
            credit_distribution=[CreditDistribution(semester_index=5, credits_allocated=3)],
            type=CourseType.CORE,
            prerequisite_rule={"type": "COURSE", "courseId": "EE2001"},
            offered_semesters=[SemesterTerm.FALL],
        ),
        Course(
            id="EE4001",
            code="EE4001",
            title="Electrical Engineering Capstone",
            description="Two-semester power or communications engineering hardware capstone.",
            total_credits=6,
            duration_semesters=2,
            recommended_semester=7,
            credit_distribution=[
                CreditDistribution(semester_index=7, credits_allocated=3),
                CreditDistribution(semester_index=8, credits_allocated=3),
            ],
            type=CourseType.CAPSTONE,
            offered_semesters=[SemesterTerm.BOTH],
        ),
    ]

    return DegreeProgram(
        id="electrical-eng",
        name="Electrical Engineering",
        department="Department of Electrical and Electronic Engineering",
        total_credits_required=settings.TOTAL_CREDITS_REQUIRED,
        min_credits_per_semester=settings.MIN_CREDITS_PER_SEMESTER,
        max_credits_per_semester=settings.MAX_CREDITS_PER_SEMESTER,
        semesters_count=settings.DEFAULT_SEMESTERS_COUNT,
        courses=courses,
    )


def load_program_by_id(program_id: str) -> DegreeProgram | None:
    """Load a degree program by ID from disk if available, or return fallback mock."""
    # Check disk storage in data/programs/
    variants = [
        f"{program_id}.json",
        f"{program_id.replace('-', '_')}.json",
    ]
    for variant in variants:
        target_path = settings.DATA_PROGRAMS_DIR / variant
        if target_path.exists():
            try:
                with open(target_path, encoding="utf-8") as f:
                    return DegreeProgram.model_validate(json.load(f))
            except (OSError, json.JSONDecodeError, ValueError):
                continue

    if program_id == "computer-eng":
        return _get_fallback_computer_eng()
    if program_id == "electrical-eng":
        return _get_fallback_electrical_eng()

    return None


@router.get(
    "",
    response_model=list[DegreeProgramSummary],
    summary="List Degree Programs",
    description="Retrieve high-level summaries for all available engineering degree programs.",
)
def list_programs() -> list[DegreeProgramSummary]:
    """Retrieve all degree program summaries."""
    programs = [
        _get_fallback_computer_eng(),
        _get_fallback_electrical_eng(),
    ]
    return [
        DegreeProgramSummary(
            id=p.id,
            name=p.name,
            department=p.department,
            total_credits_required=p.total_credits_required,
            min_credits_per_semester=p.min_credits_per_semester,
            max_credits_per_semester=p.max_credits_per_semester,
            semesters_count=p.semesters_count,
        )
        for p in programs
    ]


@router.get(
    "/{program_id}",
    response_model=DegreeProgram,
    summary="Get Degree Program by ID",
    description="Retrieve the complete 8-semester curriculum dependency graph for a specific program.",
)
def get_program(program_id: str) -> DegreeProgram:
    """Retrieve full curriculum graph by program ID."""
    program = load_program_by_id(program_id)
    if not program:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Degree program '{program_id}' was not found.",
        )
    return program
