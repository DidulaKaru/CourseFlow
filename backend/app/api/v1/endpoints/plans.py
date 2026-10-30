"""Study plan validation endpoints."""

from fastapi import APIRouter, HTTPException, status

from app.api.v1.endpoints.programs import load_program_by_id
from app.core.ast_evaluator import evaluate_prerequisite_with_diagnostics
from app.schemas.plans import (
    PlanValidationRequest,
    PlanValidationResponse,
    PrerequisiteValidationDetail,
    SemesterValidationDetail,
)

router = APIRouter()


@router.post(
    "/validate",
    response_model=PlanValidationResponse,
    summary="Validate Study Plan Constraints",
    description="Validates per-semester credit minimums (>= 18 credits), term caps, and prerequisite AST satisfiability.",
)
def validate_plan(request: PlanValidationRequest) -> PlanValidationResponse:
    """Validate a student's study plan against the active curriculum rules."""
    program = load_program_by_id(request.program_id)
    if not program:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Degree program '{request.program_id}' was not found.",
        )

    selected_electives_set = set(request.selected_elective_ids)
    completed_courses_set = set(request.completed_course_ids)

    # 1. Identify all planned courses
    planned_courses: list = []
    for course in program.courses:
        if course.type == "ELECTIVE":
            if course.id in selected_electives_set:
                planned_courses.append(course)
        else:
            planned_courses.append(course)

    # 2. Map courses to discrete semester windows and calculate term loads
    semester_courses_map: dict[int, list[str]] = {s: [] for s in range(1, program.semesters_count + 1)}
    semester_credits_map: dict[int, int] = {s: 0 for s in range(1, program.semesters_count + 1)}

    for course in planned_courses:
        if course.credit_distribution:
            for dist in course.credit_distribution:
                sem = dist.semester_index
                if 1 <= sem <= program.semesters_count:
                    semester_credits_map[sem] += dist.credits_allocated
                    if course.id not in semester_courses_map[sem]:
                        semester_courses_map[sem].append(course.id)
        else:
            sem = course.recommended_semester
            if 1 <= sem <= program.semesters_count:
                semester_credits_map[sem] += course.total_credits
                semester_courses_map[sem].append(course.id)

    # 3. Validate semester credit loads
    semester_details: list[SemesterValidationDetail] = []
    warnings: list[str] = []
    errors: list[str] = []
    overall_valid = True

    for sem in range(1, program.semesters_count + 1):
        credits_in_sem = semester_credits_map[sem]
        term_valid = True
        term_warning: str | None = None

        if credits_in_sem < program.min_credits_per_semester:
            term_valid = False
            term_warning = (
                f"Semester {sem} load ({credits_in_sem} cr) falls below the minimum "
                f"{program.min_credits_per_semester} credits requirement."
            )
            warnings.append(term_warning)
        elif credits_in_sem > program.max_credits_per_semester:
            term_warning = (
                f"Semester {sem} load ({credits_in_sem} cr) exceeds term cap of "
                f"{program.max_credits_per_semester} credits."
            )
            warnings.append(term_warning)

        semester_details.append(
            SemesterValidationDetail(
                semester_index=sem,
                total_credits=credits_in_sem,
                is_valid=term_valid,
                warning=term_warning,
                course_ids=semester_courses_map[sem],
            )
        )

    # 4. Validate prerequisite AST satisfiability
    prereq_details: list[PrerequisiteValidationDetail] = []

    # Track courses completed prior to each semester
    courses_prior_to_sem: set[str] = set(completed_courses_set)
    credits_prior_to_sem = 0

    for sem in range(1, program.semesters_count + 1):
        sem_course_ids = semester_courses_map[sem]
        sem_courses = [c for c in planned_courses if c.id in sem_course_ids]

        for course in sem_courses:
            if course.prerequisite_rule:
                diag = evaluate_prerequisite_with_diagnostics(
                    course.prerequisite_rule,
                    courses_prior_to_sem,
                    credits_prior_to_sem,
                )

                if not diag.is_satisfied:
                    overall_valid = False
                    errors.append(
                        f"Unmet prerequisite for {course.code} in Semester {sem}: {diag.summary}"
                    )

                prereq_details.append(
                    PrerequisiteValidationDetail(
                        course_id=course.id,
                        course_title=course.title,
                        is_satisfied=diag.is_satisfied,
                        missing_prerequisite_ids=diag.missing_course_ids,
                        credit_deficit=diag.credit_deficit,
                        summary=diag.summary,
                    )
                )

        # Accumulate courses and credits for subsequent semesters
        for course in sem_courses:
            courses_prior_to_sem.add(course.id)
            credits_prior_to_sem += course.total_credits

    # 5. Calculate cumulative degree totals
    total_planned = sum(c.total_credits for c in planned_courses)
    total_earned = sum(
        c.total_credits for c in program.courses if c.id in completed_courses_set
    )
    is_grad_eligible = total_planned >= program.total_credits_required

    if not is_grad_eligible:
        warnings.append(
            f"Planned credits ({total_planned} cr) fall short of the "
            f"{program.total_credits_required} credits graduation requirement."
        )

    return PlanValidationResponse(
        is_valid=overall_valid,
        total_planned_credits=total_planned,
        total_earned_credits=total_earned,
        total_credits_required=program.total_credits_required,
        is_graduation_eligible=is_grad_eligible,
        semesters=semester_details,
        prerequisite_validations=prereq_details,
        errors=errors,
        warnings=warnings,
    )
