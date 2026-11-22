"""Recursive Boolean AST Prerequisite Evaluator.

Matches src/core/algorithms/ast_evaluator.ts 1:1.
"""

from collections.abc import Collection
from dataclasses import dataclass

from app.schemas.curriculum import (
    CourseRuleNode,
    CreditThresholdRuleNode,
    LogicalRuleNode,
    PrerequisiteRule,
)

MAX_AST_RECURSION_DEPTH = 20


@dataclass(frozen=True)
class RuleIssue:
    """One structural problem in a prerequisite tree, located by its path from the root.

    ``path`` is the JSON path in request-body terms, e.g. ``("children", 1, "courseId")``.
    """

    path: tuple[str | int, ...]
    message: str


@dataclass(frozen=True)
class PrerequisiteEvaluationResult:
    """Detailed diagnostics for prerequisite evaluation."""

    is_satisfied: bool
    missing_course_ids: list[str]
    credit_deficit: int
    summary: str


def _normalize_completed_set(completed: Collection[str]) -> set[str]:
    """Ensure completed courses collection is a set for O(1) membership checks."""
    if isinstance(completed, set):
        return completed
    return set(completed)


def evaluate_prerequisite(
    rule: PrerequisiteRule | None,
    completed_courses: Collection[str],
    earned_credits: int,
    depth: int = 0,
) -> bool:
    """Recursively evaluates a boolean prerequisite AST against completed courses and credits."""
    if rule is None:
        return True

    if depth > MAX_AST_RECURSION_DEPTH:
        return False

    completed_set = _normalize_completed_set(completed_courses)

    if isinstance(rule, CourseRuleNode):
        return rule.course_id in completed_set

    if isinstance(rule, CreditThresholdRuleNode):
        return rule.min_credits >= 0 and earned_credits >= rule.min_credits

    if isinstance(rule, LogicalRuleNode):
        if rule.type == "AND":
            if not rule.children:
                return True
            return all(
                evaluate_prerequisite(child, completed_set, earned_credits, depth + 1)
                for child in rule.children
            )
        if rule.type == "OR":
            if not rule.children:
                return False
            return any(
                evaluate_prerequisite(child, completed_set, earned_credits, depth + 1)
                for child in rule.children
            )

    return False


def evaluate_prerequisite_with_diagnostics(
    rule: PrerequisiteRule | None,
    completed_courses: Collection[str],
    earned_credits: int,
) -> PrerequisiteEvaluationResult:
    """Evaluates an AST rule and gathers diagnostic details on missing courses or credit deficits."""
    if rule is None:
        return PrerequisiteEvaluationResult(
            is_satisfied=True,
            missing_course_ids=[],
            credit_deficit=0,
            summary="No prerequisites required",
        )

    completed_set = _normalize_completed_set(completed_courses)
    is_satisfied = evaluate_prerequisite(rule, completed_set, earned_credits)

    missing_courses: list[str] = []
    credit_deficit = 0

    def collect_unmet(node: PrerequisiteRule, depth: int = 0) -> None:
        nonlocal credit_deficit
        if depth > MAX_AST_RECURSION_DEPTH:
            return

        if isinstance(node, CourseRuleNode):
            if node.course_id not in completed_set:
                missing_courses.append(node.course_id)
        elif isinstance(node, CreditThresholdRuleNode):
            if node.min_credits < 0 or earned_credits < node.min_credits:
                target = max(0, node.min_credits)
                credit_deficit = max(credit_deficit, target - earned_credits)
        elif isinstance(node, LogicalRuleNode) and (
            node.type == "AND"
            or (
                node.type == "OR"
                and not evaluate_prerequisite(node, completed_set, earned_credits, depth)
            )
        ):
            for child in node.children:
                collect_unmet(child, depth + 1)

    if not is_satisfied:
        collect_unmet(rule)

    # Deduplicate while preserving order
    unique_missing: list[str] = list(dict.fromkeys(missing_courses))

    summary = "Prerequisites satisfied"
    if not is_satisfied:
        issues: list[str] = []
        if unique_missing:
            issues.append(f"Requires: {', '.join(unique_missing)}")
        if credit_deficit > 0:
            issues.append(
                f"Requires {credit_deficit} more credit{'s' if credit_deficit > 1 else ''}"
            )
        summary = "; ".join(issues) if issues else "Prerequisites unmet"

    return PrerequisiteEvaluationResult(
        is_satisfied=is_satisfied,
        missing_course_ids=unique_missing,
        credit_deficit=credit_deficit,
        summary=summary,
    )


def find_rule_issues(
    rule: PrerequisiteRule,
    *,
    course_id: str | None = None,
    known_course_ids: Collection[str] | None = None,
) -> list[RuleIssue]:
    """Validate the structure of a prerequisite tree and return every problem found (empty = valid).

    Shared by the admin prerequisite endpoint (CF-203) and the NL-to-AST synthesizer (CF-234) so the
    rules they enforce cannot drift. Pydantic already guarantees node tags and leaf shapes; this adds
    the invariants it cannot express:

    * nesting never exceeds ``MAX_AST_RECURSION_DEPTH`` (the depth the evaluators stop at),
    * AND / OR nodes have at least one child (an empty OR can never be satisfied),
    * no leaf references ``course_id`` itself (when given),
    * every referenced course exists in ``known_course_ids`` (when given).
    """
    issues: list[RuleIssue] = []

    def visit(node: PrerequisiteRule, path: tuple[str | int, ...], depth: int) -> None:
        if depth > MAX_AST_RECURSION_DEPTH:
            issues.append(
                RuleIssue(path, f"Rule is nested more than {MAX_AST_RECURSION_DEPTH} levels deep.")
            )
            return  # Do not descend: deeper nodes would only repeat the same problem.

        if isinstance(node, CourseRuleNode):
            target = node.course_id
            location = (*path, "courseId")
            if not target.strip():
                issues.append(RuleIssue(location, "courseId must not be blank."))
            elif course_id is not None and target == course_id:
                issues.append(RuleIssue(location, f"A course cannot be its own prerequisite ({target})."))
            elif known_course_ids is not None and target not in known_course_ids:
                issues.append(
                    RuleIssue(location, f"Unknown course '{target}': it does not exist in the catalog.")
                )
        elif isinstance(node, LogicalRuleNode):
            if not node.children:
                issues.append(
                    RuleIssue((*path, "children"), f"{node.type} node must have at least one child.")
                )
            for index, child in enumerate(node.children):
                visit(child, (*path, "children", index), depth + 1)

    visit(rule, (), 0)
    return issues


def format_prerequisite_rule(rule: PrerequisiteRule | None) -> str:
    """Formats an AST rule into a human-readable logical formula string."""
    if rule is None:
        return "None"

    if isinstance(rule, CourseRuleNode):
        return rule.course_id

    if isinstance(rule, CreditThresholdRuleNode):
        return f"≥ {rule.min_credits} Credits"

    if isinstance(rule, LogicalRuleNode):
        if not rule.children:
            return "None"
        if rule.type == "AND":
            parts = [
                f"({format_prerequisite_rule(c)})"
                if isinstance(c, LogicalRuleNode) and c.type == "OR"
                else format_prerequisite_rule(c)
                for c in rule.children
            ]
            return " AND ".join(parts)
        if rule.type == "OR":
            parts = [
                f"({format_prerequisite_rule(c)})"
                if isinstance(c, LogicalRuleNode) and c.type == "AND"
                else format_prerequisite_rule(c)
                for c in rule.children
            ]
            return " OR ".join(parts)

    return ""
