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
) -> bool:
    """Recursively evaluates a boolean prerequisite AST against completed courses and credits."""
    if rule is None:
        return True

    completed_set = _normalize_completed_set(completed_courses)

    if isinstance(rule, CourseRuleNode):
        return rule.course_id in completed_set

    if isinstance(rule, CreditThresholdRuleNode):
        return earned_credits >= rule.min_credits

    if isinstance(rule, LogicalRuleNode):
        if rule.type == "AND":
            if not rule.children:
                return True
            return all(
                evaluate_prerequisite(child, completed_set, earned_credits)
                for child in rule.children
            )
        if rule.type == "OR":
            if not rule.children:
                return False
            return any(
                evaluate_prerequisite(child, completed_set, earned_credits)
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

    def collect_unmet(node: PrerequisiteRule) -> None:
        nonlocal credit_deficit
        if isinstance(node, CourseRuleNode):
            if node.course_id not in completed_set:
                missing_courses.append(node.course_id)
        elif isinstance(node, CreditThresholdRuleNode):
            if earned_credits < node.min_credits:
                credit_deficit = max(credit_deficit, node.min_credits - earned_credits)
        elif isinstance(node, LogicalRuleNode) and (
            node.type == "AND"
            or (
                node.type == "OR"
                and not evaluate_prerequisite(node, completed_set, earned_credits)
            )
        ):
            for child in node.children:
                collect_unmet(child)

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
