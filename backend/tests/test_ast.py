"""Unit tests for Python recursive AST evaluator."""

from app.core.ast_evaluator import (
    evaluate_prerequisite,
    evaluate_prerequisite_with_diagnostics,
    format_prerequisite_rule,
)
from app.schemas.curriculum import (
    CourseRuleNode,
    CreditThresholdRuleNode,
    LogicalRuleNode,
    PrerequisiteRule,
)


def test_null_prerequisite():
    """Verify null prerequisite evaluates to True unconditionally."""
    assert evaluate_prerequisite(None, set(), 0) is True
    assert evaluate_prerequisite(None, ["EC101"], 45) is True


def test_course_rule_node():
    """Verify CourseRuleNode requires course presence in completed set."""
    rule: PrerequisiteRule = CourseRuleNode(course_id="EC101")
    assert evaluate_prerequisite(rule, {"EC101"}, 0) is True
    assert evaluate_prerequisite(rule, {"EC102"}, 0) is False
    assert evaluate_prerequisite(rule, [], 100) is False


def test_credit_threshold_node():
    """Verify CreditThresholdRuleNode asserts earned credits."""
    rule: PrerequisiteRule = CreditThresholdRuleNode(min_credits=30)
    assert evaluate_prerequisite(rule, set(), 30) is True
    assert evaluate_prerequisite(rule, set(), 35) is True
    assert evaluate_prerequisite(rule, {"EC101"}, 29) is False


def test_compound_logical_rules():
    """Verify (EC101 AND EC102) OR (EC105 AND Credits >= 30)."""
    rule: PrerequisiteRule = LogicalRuleNode(
        type="OR",
        children=[
            LogicalRuleNode(
                type="AND",
                children=[
                    CourseRuleNode(course_id="EC101"),
                    CourseRuleNode(course_id="EC102"),
                ],
            ),
            LogicalRuleNode(
                type="AND",
                children=[
                    CourseRuleNode(course_id="EC105"),
                    CreditThresholdRuleNode(min_credits=30),
                ],
            ),
        ],
    )

    # Branch 1 satisfies
    assert evaluate_prerequisite(rule, {"EC101", "EC102"}, 0) is True
    # Branch 2 satisfies
    assert evaluate_prerequisite(rule, {"EC105"}, 30) is True
    # Branch 2 fails on credits
    assert evaluate_prerequisite(rule, {"EC105"}, 29) is False
    # Fails both
    assert evaluate_prerequisite(rule, {"EC101"}, 30) is False


def test_diagnostics_and_formatting():
    """Verify diagnostic breakdowns and human-readable formatting."""
    rule: PrerequisiteRule = LogicalRuleNode(
        type="AND",
        children=[
            CourseRuleNode(course_id="CE3001"),
            LogicalRuleNode(
                type="OR",
                children=[
                    CourseRuleNode(course_id="MA2001"),
                    CourseRuleNode(course_id="MA2002"),
                ],
            ),
            CreditThresholdRuleNode(min_credits=90),
        ],
    )

    diag = evaluate_prerequisite_with_diagnostics(rule, {"MA2001"}, 75)
    assert diag.is_satisfied is False
    assert "CE3001" in diag.missing_course_ids
    assert diag.credit_deficit == 15

    formatted = format_prerequisite_rule(rule)
    assert formatted == "CE3001 AND (MA2001 OR MA2002) AND ≥ 90 Credits"
