"""Tests verifying curriculum DAG layout mathematics and semester sequencing constraints."""

import networkx as nx
import pytest
from app.core.config import settings
from app.schemas.curriculum import (
    CourseRuleNode,
    DegreeProgram,
    LogicalRuleNode,
    PrerequisiteRule,
)


def _extract_prerequisite_course_ids(rule: PrerequisiteRule | None) -> list[str]:
    """Recursively collect all course ID prerequisite leaves from an AST."""
    if not rule:
        return []
    if isinstance(rule, CourseRuleNode):
        return [rule.course_id]
    if isinstance(rule, LogicalRuleNode):
        results: list[str] = []
        for child in rule.children:
            results.extend(_extract_prerequisite_course_ids(child))
        return results
    return []


@pytest.mark.parametrize("program_key", ["computer_eng_data", "electrical_eng_data"])
def test_curriculum_dag_acyclicity(program_key: str, request: pytest.FixtureRequest):
    """Verify the prerequisite graph contains strictly zero cycles (DAG invariant)."""
    raw_data = request.getfixturevalue(program_key)
    program = DegreeProgram.model_validate(raw_data)

    graph = nx.DiGraph()
    for course in program.courses:
        graph.add_node(course.id, semester=course.recommended_semester)

    for course in program.courses:
        prereq_ids = _extract_prerequisite_course_ids(course.prerequisite_rule)
        for prereq_id in prereq_ids:
            if graph.has_node(prereq_id):
                graph.add_edge(prereq_id, course.id)

    assert nx.is_directed_acyclic_graph(graph), f"Cycle detected in {program.name} curriculum graph!"


@pytest.mark.parametrize("program_key", ["computer_eng_data", "electrical_eng_data"])
def test_curriculum_semester_bounds(program_key: str, request: pytest.FixtureRequest):
    """Verify all courses are mapped strictly within semesters 1 through 8."""
    raw_data = request.getfixturevalue(program_key)
    program = DegreeProgram.model_validate(raw_data)

    assert program.semesters_count == settings.DEFAULT_SEMESTERS_COUNT

    for course in program.courses:
        assert 1 <= course.recommended_semester <= program.semesters_count, (
            f"Course {course.id} has invalid recommended semester {course.recommended_semester}"
        )


@pytest.mark.parametrize("program_key", ["computer_eng_data", "electrical_eng_data"])
def test_multi_semester_credit_distributions(program_key: str, request: pytest.FixtureRequest):
    """Verify multi-semester capstone courses have valid semester allocations matching totalCredits."""
    raw_data = request.getfixturevalue(program_key)
    program = DegreeProgram.model_validate(raw_data)

    for course in program.courses:
        if course.duration_semesters > 1:
            assert len(course.credit_distribution) == course.duration_semesters, (
                f"Course {course.id} duration {course.duration_semesters} does not match credit distribution length"
            )
            allocated_sum = sum(d.credits_allocated for d in course.credit_distribution)
            assert allocated_sum == course.total_credits, (
                f"Course {course.id} allocated credits {allocated_sum} != total credits {course.total_credits}"
            )
            for d in course.credit_distribution:
                assert 1 <= d.semester_index <= program.semesters_count


@pytest.mark.parametrize("program_key", ["computer_eng_data", "electrical_eng_data"])
def test_feedforward_topological_sequencing(program_key: str, request: pytest.FixtureRequest):
    """Verify prerequisites are positioned in earlier or concurrent semesters, never in future semesters."""
    raw_data = request.getfixturevalue(program_key)
    program = DegreeProgram.model_validate(raw_data)

    course_semesters = {c.id: c.recommended_semester for c in program.courses}

    for course in program.courses:
        prereqs = _extract_prerequisite_course_ids(course.prerequisite_rule)
        for prereq_id in prereqs:
            if prereq_id in course_semesters:
                prereq_sem = course_semesters[prereq_id]
                assert prereq_sem <= course.recommended_semester, (
                    f"Temporal inversion: Prerequisite {prereq_id} (Sem {prereq_sem}) "
                    f"is scheduled after {course.id} (Sem {course.recommended_semester})"
                )


@pytest.mark.parametrize("program_key", ["computer_eng_data", "electrical_eng_data"])
def test_graduation_total_credit_threshold(program_key: str, request: pytest.FixtureRequest):
    """Verify the curriculum satisfies the required 150 total credit graduation minimum."""
    raw_data = request.getfixturevalue(program_key)
    program = DegreeProgram.model_validate(raw_data)

    assert program.total_credits_required >= settings.TOTAL_CREDITS_REQUIRED

    total_offered_credits = sum(c.total_credits for c in program.courses)
    assert total_offered_credits >= program.total_credits_required, (
        f"{program.name} offers only {total_offered_credits} credits, less than required {program.total_credits_required}"
    )
