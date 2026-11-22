"""Unit tests for Python recursive AST evaluator."""

from app.core.ast_evaluator import (
    MAX_AST_RECURSION_DEPTH,
    evaluate_prerequisite,
    evaluate_prerequisite_with_diagnostics,
    find_rule_issues,
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


def test_deeply_nested_compound_ast():
    """Verify 4-level deep nested AST expression evaluates correctly."""
    # (A AND (B OR (C AND (Credits >= 60))))
    rule: PrerequisiteRule = LogicalRuleNode(
        type="AND",
        children=[
            CourseRuleNode(course_id="A"),
            LogicalRuleNode(
                type="OR",
                children=[
                    CourseRuleNode(course_id="B"),
                    LogicalRuleNode(
                        type="AND",
                        children=[
                            CourseRuleNode(course_id="C"),
                            CreditThresholdRuleNode(min_credits=60),
                        ],
                    ),
                ],
            ),
        ],
    )

    assert evaluate_prerequisite(rule, {"A", "B"}, 0) is True
    assert evaluate_prerequisite(rule, {"A", "C"}, 60) is True
    assert evaluate_prerequisite(rule, {"A", "C"}, 59) is False
    assert evaluate_prerequisite(rule, {"B", "C"}, 100) is False


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


def test_diagnostics_fully_satisfied():
    """Verify diagnostic properties when all prerequisite criteria are met."""
    rule: PrerequisiteRule = LogicalRuleNode(
        type="AND",
        children=[
            CourseRuleNode(course_id="MA1001"),
            CreditThresholdRuleNode(min_credits=30),
        ],
    )

    diag = evaluate_prerequisite_with_diagnostics(rule, {"MA1001"}, 30)
    assert diag.is_satisfied is True
    assert len(diag.missing_course_ids) == 0
    assert diag.credit_deficit == 0
    assert "Prerequisites satisfied" in diag.summary


def _chain(depth: int, leaf: PrerequisiteRule) -> PrerequisiteRule:
    """Build a single-child AND chain that places ``leaf`` at exactly ``depth`` (root is 0)."""
    node = leaf
    for _ in range(depth):
        node = LogicalRuleNode(type="AND", children=[node])
    return node


def _chain_path(depth: int) -> tuple[str | int, ...]:
    """Path to a node sitting ``depth`` levels down a single-child chain."""
    return ("children", 0) * depth


def test_find_rule_issues_valid_tree():
    """Verify a well-formed tree yields no issues."""
    rule: PrerequisiteRule = LogicalRuleNode(
        type="AND",
        children=[
            CourseRuleNode(course_id="CE1001"),
            LogicalRuleNode(
                type="OR",
                children=[
                    CourseRuleNode(course_id="MA1001"),
                    CreditThresholdRuleNode(min_credits=30),
                ],
            ),
        ],
    )
    assert find_rule_issues(rule) == []
    assert find_rule_issues(rule, course_id="CE2001", known_course_ids={"CE1001", "MA1001"}) == []


def test_find_rule_issues_single_leaf_valid():
    """Verify a lone course leaf is valid."""
    assert find_rule_issues(CourseRuleNode(course_id="CE1001")) == []


def test_find_rule_issues_depth_20_passes():
    """Verify a leaf at exactly MAX_AST_RECURSION_DEPTH is accepted."""
    rule = _chain(MAX_AST_RECURSION_DEPTH, CourseRuleNode(course_id="CE1001"))
    assert find_rule_issues(rule) == []


def test_find_rule_issues_depth_21_single_issue():
    """Verify a node at depth 21 yields exactly one issue at the right path."""
    rule = _chain(MAX_AST_RECURSION_DEPTH + 1, CourseRuleNode(course_id="CE1001"))
    issues = find_rule_issues(rule)
    assert len(issues) == 1
    assert issues[0].path == _chain_path(MAX_AST_RECURSION_DEPTH + 1)
    assert "20" in issues[0].message


def test_find_rule_issues_stops_descending_past_limit():
    """Verify nodes below the first too-deep node are not reported (no descent)."""
    # The OR sits at depth 21; its blank leaf and empty AND child (depth 22) must stay unreported.
    too_deep = LogicalRuleNode(
        type="AND",
        children=[
            LogicalRuleNode(
                type="OR",
                children=[
                    CourseRuleNode(course_id=" "),
                    LogicalRuleNode(type="AND", children=[]),
                ],
            )
        ],
    )
    issues = find_rule_issues(_chain(MAX_AST_RECURSION_DEPTH, too_deep))
    assert [i.path for i in issues] == [_chain_path(MAX_AST_RECURSION_DEPTH + 1)]


def test_find_rule_issues_deep_chain_no_recursion_error():
    """Verify a 25-level chain is reported without blowing the recursion limit."""
    rule = _chain(25, CourseRuleNode(course_id="CE1001"))
    issues = find_rule_issues(rule)
    assert [i.path for i in issues] == [_chain_path(MAX_AST_RECURSION_DEPTH + 1)]


def test_find_rule_issues_empty_and():
    """Verify an empty AND is rejected at its children path."""
    issues = find_rule_issues(LogicalRuleNode(type="AND", children=[]))
    assert len(issues) == 1
    assert issues[0].path == ("children",)
    assert "AND" in issues[0].message


def test_find_rule_issues_empty_or_nested():
    """Verify a nested empty OR is rejected at its children path."""
    rule: PrerequisiteRule = LogicalRuleNode(
        type="AND",
        children=[CourseRuleNode(course_id="CE1001"), LogicalRuleNode(type="OR", children=[])],
    )
    issues = find_rule_issues(rule)
    assert len(issues) == 1
    assert issues[0].path == ("children", 1, "children")
    assert "OR" in issues[0].message


def test_find_rule_issues_blank_course_id():
    """Verify empty and whitespace-only courseIds are flagged."""
    for blank in ("", "   ", "\t\n"):
        issues = find_rule_issues(CourseRuleNode(course_id=blank))
        assert [i.path for i in issues] == [("courseId",)]
        assert "blank" in issues[0].message


def test_find_rule_issues_blank_takes_precedence_over_unknown():
    """Verify a blank courseId reports once, not also as unknown."""
    issues = find_rule_issues(CourseRuleNode(course_id=" "), known_course_ids={"CE1001"})
    assert len(issues) == 1
    assert "blank" in issues[0].message


def test_find_rule_issues_self_reference_root_leaf():
    """Verify a root leaf referencing the course itself is flagged."""
    issues = find_rule_issues(CourseRuleNode(course_id="CE2001"), course_id="CE2001")
    assert [i.path for i in issues] == [("courseId",)]
    assert "CE2001" in issues[0].message


def test_find_rule_issues_self_reference_nested():
    """Verify a nested self-reference is flagged with the full path."""
    rule: PrerequisiteRule = LogicalRuleNode(
        type="OR",
        children=[
            CourseRuleNode(course_id="CE1001"),
            LogicalRuleNode(type="AND", children=[CourseRuleNode(course_id="CE2001")]),
        ],
    )
    issues = find_rule_issues(rule, course_id="CE2001")
    assert [i.path for i in issues] == [("children", 1, "children", 0, "courseId")]


def test_find_rule_issues_course_id_none_skips_self_check():
    """Verify self-reference is not checked when course_id is None."""
    assert find_rule_issues(CourseRuleNode(course_id="CE2001"), course_id=None) == []


def test_find_rule_issues_unknown_course_collection_types():
    """Verify known_course_ids works as a set, list, tuple and dict key view."""
    rule: PrerequisiteRule = LogicalRuleNode(
        type="AND",
        children=[CourseRuleNode(course_id="CE1001"), CourseRuleNode(course_id="ZZ9999")],
    )
    known_variants = [
        {"CE1001"},
        ["CE1001"],
        ("CE1001",),
        {"CE1001": 1}.keys(),
    ]
    for known in known_variants:
        issues = find_rule_issues(rule, known_course_ids=known)
        assert [i.path for i in issues] == [("children", 1, "courseId")]
        assert "ZZ9999" in issues[0].message


def test_find_rule_issues_known_course_ids_none_skips_existence_check():
    """Verify unknown courses are accepted when known_course_ids is None."""
    assert find_rule_issues(CourseRuleNode(course_id="ZZ9999"), known_course_ids=None) == []


def test_find_rule_issues_empty_known_set_flags_everything():
    """Verify an empty (not None) known set treats every course as unknown."""
    issues = find_rule_issues(CourseRuleNode(course_id="CE1001"), known_course_ids=set())
    assert [i.path for i in issues] == [("courseId",)]


def test_find_rule_issues_self_reference_takes_precedence_over_unknown():
    """Verify a self-reference is reported once even if the course is also unknown."""
    issues = find_rule_issues(
        CourseRuleNode(course_id="CE2001"), course_id="CE2001", known_course_ids=set()
    )
    assert len(issues) == 1
    assert "own prerequisite" in issues[0].message


def test_find_rule_issues_reports_multiple_issues_with_paths():
    """Verify every problem is reported, in traversal order, with correct paths."""
    rule: PrerequisiteRule = LogicalRuleNode(
        type="AND",
        children=[
            CourseRuleNode(course_id="CE2001"),
            CourseRuleNode(course_id=""),
            LogicalRuleNode(
                type="OR",
                children=[
                    LogicalRuleNode(type="AND", children=[]),
                    CourseRuleNode(course_id="ZZ9999"),
                ],
            ),
            CreditThresholdRuleNode(min_credits=10),
        ],
    )
    issues = find_rule_issues(rule, course_id="CE2001", known_course_ids={"CE1001"})
    assert [i.path for i in issues] == [
        ("children", 0, "courseId"),
        ("children", 1, "courseId"),
        ("children", 2, "children", 0, "children"),
        ("children", 2, "children", 1, "courseId"),
    ]


def test_find_rule_issues_credit_threshold_never_flagged():
    """Verify CREDIT_THRESHOLD leaves never produce issues, whatever the options."""
    leaf = CreditThresholdRuleNode(min_credits=0)
    assert find_rule_issues(leaf) == []
    assert find_rule_issues(leaf, course_id="CE2001", known_course_ids=set()) == []
    rule = _chain(MAX_AST_RECURSION_DEPTH, CreditThresholdRuleNode(min_credits=120))
    assert find_rule_issues(rule, course_id="CE2001", known_course_ids=set()) == []


def test_validator_and_evaluator_agree_on_depth_limit():
    """Verify the validator's depth limit matches where the evaluator's guard trips."""
    completed = {"CE1001"}
    leaf = CourseRuleNode(course_id="CE1001")

    at_limit = _chain(MAX_AST_RECURSION_DEPTH, leaf)
    assert find_rule_issues(at_limit) == []
    assert evaluate_prerequisite(at_limit, completed, 0) is True
    assert evaluate_prerequisite(at_limit, set(), 0) is False  # evaluated normally, not guarded

    over_limit = _chain(MAX_AST_RECURSION_DEPTH + 1, leaf)
    assert len(find_rule_issues(over_limit)) == 1
    assert evaluate_prerequisite(over_limit, completed, 0) is False  # depth guard trips
