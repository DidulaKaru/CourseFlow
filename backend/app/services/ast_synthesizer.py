"""Natural-language prerequisites to a recursive prerequisite AST (CF-234).

The language model maps the wording to a ``PrerequisiteRule``; the tree is then normalized, checked with the same
``find_rule_issues`` the admin API enforces (CF-203) and simplified. An answer that breaks a structural rule is sent
back to the model, so a returned tree is always structurally valid. Courses missing from the catalog only lower the
confidence: the reviewer decides, and the commit rejects them.
"""

import logging
import re
from collections.abc import Collection, Iterator
from dataclasses import dataclass

from pydantic import model_validator

from app.core.ast_evaluator import find_rule_issues
from app.schemas.curriculum import (
    CamelModel,
    CourseRuleNode,
    CreditThresholdRuleNode,
    LogicalRuleNode,
    PrerequisiteRule,
)
from app.services.course_codes import find_course_codes, normalize_course_code
from app.services.extraction_prompts import build_prerequisite_messages
from app.services.llm_client import LLMClient, LLMError
from app.services.structured_output import generate_structured

logger = logging.getLogger(__name__)

_NO_PREREQUISITE = re.compile(r"(?:none|nil|n/?a|not\s+applicable|no\s+pre-?requisites?.{0,20}|[-–—]+)\W*", re.IGNORECASE)
_CREDITS = re.compile(r"(?P<credits>\d{1,3})\s*(?:earned\s+|completed\s+)?credits?\b", re.IGNORECASE)
_OR_WORDING = re.compile(r"\bor\b|\beither\b|\b(?:one|any)\s+of\b", re.IGNORECASE)
_AND_WORDING = re.compile(r"\band\b|\bboth\b|\ball\s+of\b|[,;&+]", re.IGNORECASE)


@dataclass(frozen=True)
class SynthesizedPrerequisite:
    """A prerequisite tree (None when nothing is required) and how well the wording supports it."""

    rule: PrerequisiteRule | None
    confidence: float


class PrerequisiteAnswer(CamelModel):
    """What the language model answers for one prerequisite clause."""

    rule: PrerequisiteRule | None


# ==========================================
# Tree post-processing
# ==========================================


def normalize_rule(rule: PrerequisiteRule) -> PrerequisiteRule:
    """Standardize every course code in a tree."""
    if isinstance(rule, CourseRuleNode):
        return CourseRuleNode(course_id=normalize_course_code(rule.course_id))
    if isinstance(rule, LogicalRuleNode):
        return LogicalRuleNode(type=rule.type, children=[normalize_rule(child) for child in rule.children])
    return rule


def simplify_rule(rule: PrerequisiteRule) -> PrerequisiteRule | None:
    """Return the smallest equivalent tree, or None when the rule is always satisfied.

    Flattens nested gates of the same type, drops duplicates and tautologies (a 0-credit threshold) and collapses
    single-child gates. Expects a tree without empty gates (see ``find_rule_issues``).
    """
    if isinstance(rule, CreditThresholdRuleNode):
        return rule if rule.min_credits > 0 else None
    if not isinstance(rule, LogicalRuleNode):
        return rule

    children: list[PrerequisiteRule] = []
    for child in rule.children:
        simplified = simplify_rule(child)
        if simplified is None:
            if rule.type == "OR":
                return None  # One alternative is always satisfied, so the whole choice is.
            continue
        nested = isinstance(simplified, LogicalRuleNode) and simplified.type == rule.type
        for item in simplified.children if nested else [simplified]:
            if item not in children:
                children.append(item)
    if len(children) > 1:
        return LogicalRuleNode(type=rule.type, children=children)
    return children[0] if children else None


def _nodes(rule: PrerequisiteRule) -> Iterator[PrerequisiteRule]:
    yield rule
    if isinstance(rule, LogicalRuleNode):
        for child in rule.children:
            yield from _nodes(child)


# ==========================================
# Confidence
# ==========================================


def score_rule(rule: PrerequisiteRule | None, text: str, known_course_ids: Collection[str]) -> float:
    """Confidence that a tree says what the wording says: same courses, credit thresholds and connectives."""
    stated_credits = {int(match["credits"]) for match in _CREDITS.finditer(text)} - {0}
    stated_codes = set(find_course_codes(_CREDITS.sub(" ", text)))
    if rule is None:
        return 0.1 if stated_codes or stated_credits else 0.4  # E.g. "Consent of the lecturer" has no AST form.

    nodes = list(_nodes(rule))
    codes = {node.course_id for node in nodes if isinstance(node, CourseRuleNode)}
    thresholds = {node.min_credits for node in nodes if isinstance(node, CreditThresholdRuleNode)}
    gates = {node.type for node in nodes if isinstance(node, LogicalRuleNode)}

    score = 0.95
    if codes - stated_codes or thresholds - stated_credits:
        score = 0.2  # Invented a requirement.
    elif stated_codes - codes or stated_credits - thresholds:
        score = 0.4  # Lost a requirement.
    elif bool(_OR_WORDING.search(text)) != ("OR" in gates) or ("AND" in gates and not _AND_WORDING.search(text)):
        score = 0.6  # Joined the requirements differently.
    if not codes <= set(known_course_ids):
        score = min(score, 0.5)
    return score


# ==========================================
# Synthesis
# ==========================================


def _answer_model(course_id: str | None) -> type[PrerequisiteAnswer]:
    """An answer model that rejects structurally invalid trees, so Instructor asks again with the reasons."""

    class CheckedPrerequisiteAnswer(PrerequisiteAnswer):
        @model_validator(mode="after")
        def check_structure(self) -> "CheckedPrerequisiteAnswer":
            if self.rule is not None:
                issues = find_rule_issues(normalize_rule(self.rule), course_id=course_id)
                if issues:
                    raise ValueError("; ".join(issue.message for issue in issues))
            return self

    return CheckedPrerequisiteAnswer


async def synthesize_prerequisite(
    llm: LLMClient, text: str | None, *, course_id: str | None, known_course_ids: Collection[str]
) -> SynthesizedPrerequisite:
    """Translate a course's prerequisite wording into a valid, simplified rule tree.

    A clause the model cannot translate yields no rule with confidence 0.0 instead of failing the document: the
    reviewer still sees the wording and every other field.
    """
    if not text:
        return SynthesizedPrerequisite(None, 0.5)
    if _NO_PREREQUISITE.fullmatch(text.strip()):
        return SynthesizedPrerequisite(None, 0.95)
    try:
        answer = await generate_structured(llm, build_prerequisite_messages(text), _answer_model(course_id))
    except LLMError as error:
        logger.warning("Prerequisite wording was not translated: %s", error)
        return SynthesizedPrerequisite(None, 0.0)
    rule = None if answer.rule is None else simplify_rule(normalize_rule(answer.rule))
    return SynthesizedPrerequisite(rule, score_rule(rule, text, known_course_ids))
