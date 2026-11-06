"""Pydantic schemas and DTOs."""

from app.schemas.curriculum import (
    Course,
    CourseRuleNode,
    CourseType,
    CreditDistribution,
    CreditThresholdRuleNode,
    DegreeProgram,
    DegreeProgramSummary,
    LogicalRuleNode,
    PrerequisiteRule,
    RuleType,
    SemesterTerm,
)
from app.schemas.plans import (
    PlanValidationRequest,
    PlanValidationResponse,
    PrerequisiteValidationDetail,
    SemesterValidationDetail,
)

__all__ = [
    "Course",
    "CourseRuleNode",
    "CourseType",
    "CreditDistribution",
    "CreditThresholdRuleNode",
    "DegreeProgram",
    "DegreeProgramSummary",
    "LogicalRuleNode",
    "PlanValidationRequest",
    "PlanValidationResponse",
    "PrerequisiteRule",
    "PrerequisiteValidationDetail",
    "RuleType",
    "SemesterTerm",
    "SemesterValidationDetail",
]
