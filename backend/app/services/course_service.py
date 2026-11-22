"""Admin course mutation service (CF-202).

Owns every business rule for creating and editing courses so the endpoints stay thin:
credit and semester bounds, code immutability and uniqueness, corequisite integrity,
credit-distribution consistency, ``updated_at`` tracking and transactional commits.

CF-203 adds the prerequisite-rule and credit-distribution mutations at the bottom of this module;
they reuse the same helpers, so they cannot disagree with the CF-202 course edits.
"""

from typing import Any

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.ast_evaluator import RuleIssue, find_rule_issues
from app.models.curriculum import Course as CourseRecord
from app.models.curriculum import CreditDistribution as CreditDistributionRecord
from app.models.curriculum import DegreeProgram as DegreeProgramRecord
from app.models.curriculum import PrerequisiteRule as PrerequisiteRuleRecord
from app.schemas.curriculum import (
    AdminCourse,
    CourseCreate,
    CoursePatch,
    CourseUpdate,
    CreditDistribution,
    PrerequisiteRule,
)

DEFAULT_SEMESTER_COUNT = 8

Distribution = list[tuple[int, int]]  # (semester_index, credits_allocated)


class CourseServiceError(Exception):
    """Base class for expected, client-facing course errors."""


class CourseNotFoundError(CourseServiceError):
    """The requested course or degree program does not exist."""


class CourseConflictError(CourseServiceError):
    """The change collides with existing data (e.g. duplicate or immutable course code)."""


class CourseValidationError(CourseServiceError):
    """A business rule failed; ``field`` is the camelCase request field at fault."""

    def __init__(self, field: str, message: str) -> None:
        super().__init__(message)
        self.field = field
        self.message = message


class RuleValidationError(CourseServiceError):
    """A prerequisite tree broke one or more structural or referential rules (CF-203)."""

    def __init__(self, issues: list[RuleIssue]) -> None:
        super().__init__("; ".join(issue.message for issue in issues))
        self.issues = issues


# ==========================================
# Serialization
# ==========================================


def to_admin_course(course: CourseRecord) -> AdminCourse:
    """Convert an ORM course row into the admin response contract."""
    return AdminCourse.model_validate(
        {
            "id": course.id,
            "code": course.code,
            "title": course.title,
            "description": course.description or "",
            "totalCredits": course.total_credits,
            "durationSemesters": course.duration_semesters,
            "recommendedSemester": course.recommended_semester,
            "creditDistribution": [
                {"semesterIndex": d.semester_index, "creditsAllocated": d.credits_allocated}
                for d in course.credit_distribution
            ],
            "type": course.type,
            "prerequisiteRule": course.prerequisite_rule,
            "corequisites": course.corequisites or [],
            "offeredSemesters": course.offered_semesters or [],
            "syllabusObjectives": course.syllabus_objectives or [],
            # Seeded courses without hours store {}; the public contract models that as null.
            "contactHours": course.contact_hours or None,
            "updatedAt": course.updated_at,
        }
    )


# ==========================================
# Validation helpers
# ==========================================


def _validate_semester_window(start: int, duration: int, semester_count: int) -> None:
    last = start + duration - 1
    if last > semester_count:
        raise CourseValidationError(
            "durationSemesters",
            f"A {duration}-semester course starting in semester {start} would end in semester {last}, "
            f"beyond the program's {semester_count} semesters.",
        )


def _clean_corequisites(db: Session, course_id: str, corequisites: list[str]) -> list[str]:
    cleaned = list(dict.fromkeys(item.strip() for item in corequisites))
    if course_id in cleaned:
        raise CourseValidationError("corequisites", "A course cannot be its own corequisite.")
    if cleaned:
        known = set(db.scalars(select(CourseRecord.id).where(CourseRecord.id.in_(cleaned))))
        unknown = [item for item in cleaned if item not in known]
        if unknown:
            raise CourseValidationError("corequisites", f"Unknown corequisite course(s): {', '.join(unknown)}.")
    return cleaned


def check_distribution(entries: Distribution, total: int, duration: int, start: int) -> Distribution:
    """Validate a credit split (one entry per semester from ``start``, summing to ``total``); return it sorted.

    Public so CF-203 (credit-distribution endpoint) and CF-235 (ingestion) enforce the identical rule.
    """
    ordered = sorted(entries)
    expected = list(range(start, start + duration))
    if [index for index, _ in ordered] != expected:
        raise CourseValidationError(
            "creditDistribution",
            f"Must contain exactly one entry per semester for semesters {expected[0]} to {expected[-1]} "
            f"(the course starts in semester {start} and lasts {duration}).",
        )
    allocated = sum(credits for _, credits in ordered)
    if allocated != total:
        raise CourseValidationError(
            "creditDistribution",
            f"Allocated credits sum to {allocated} but totalCredits is {total}.",
        )
    return ordered


def _resolve_distribution(
    *,
    total: int,
    duration: int,
    start: int,
    provided: Distribution | None,
    existing: Distribution,
) -> Distribution:
    """Pick the credit distribution that matches the final course values, or explain why none can be."""
    if provided is not None:
        return check_distribution(provided, total, duration, start)
    if duration == 1:
        return [(start, total)]  # Derived: a single-semester course carries all credits in its term.
    try:
        return check_distribution(existing, total, duration, start)
    except CourseValidationError:
        raise CourseValidationError(
            "creditDistribution",
            "This multi-semester course's credits, duration or start semester changed, so the stored split "
            "no longer fits. Send a creditDistribution that matches the new values.",
        ) from None


# ==========================================
# Persistence helpers
# ==========================================


def _existing_distribution(course: CourseRecord) -> Distribution:
    return sorted((d.semester_index, d.credits_allocated) for d in course.credit_distribution)


def _replace_distribution(course: CourseRecord, distribution: Distribution) -> None:
    """Swap the stored credit split only when it actually changed."""
    if distribution != _existing_distribution(course):
        course.credit_distribution = [
            CreditDistributionRecord(semester_index=index, credits_allocated=credits)
            for index, credits in distribution
        ]


def _write_fields(course: CourseRecord, values: dict[str, Any], distribution: Distribution) -> None:
    """Assign validated values. Fresh objects are assigned so JSON column changes are detected."""
    course.title = values["title"]
    course.description = values["description"]
    course.total_credits = values["total_credits"]
    course.duration_semesters = values["duration_semesters"]
    course.recommended_semester = values["recommended_semester"]
    course.type = values["type"]
    course.offered_semesters = values["offered_semesters"]
    course.corequisites = values["corequisites"]
    course.syllabus_objectives = values["syllabus_objectives"]
    course.contact_hours = values["contact_hours"]
    _replace_distribution(course, distribution)
    # Explicit so edits that only touch child rows still advance the timestamp.
    course.updated_at = func.now()


def _commit(db: Session, course: CourseRecord) -> CourseRecord:
    """Commit atomically; any failure leaves the database untouched."""
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise CourseConflictError("The change conflicts with existing course data.") from None
    except Exception:
        db.rollback()
        raise
    db.refresh(course)
    return course


def _get_course(db: Session, course_id: str) -> CourseRecord:
    course = db.get(CourseRecord, course_id)
    if course is None:
        raise CourseNotFoundError(f"Course '{course_id}' was not found.")
    return course


def _semester_count_for(course: CourseRecord) -> int:
    """A shared course must fit every program that owns it."""
    return min((program.semesters_count for program in course.programs), default=DEFAULT_SEMESTER_COUNT)


def _normalize(values: dict[str, Any]) -> dict[str, Any]:
    """Convert request enums and models into the plain JSON-friendly shapes stored in the database."""
    return {
        **values,
        "type": getattr(values["type"], "value", values["type"]),
        "offered_semesters": list(
            dict.fromkeys(getattr(term, "value", term) for term in values["offered_semesters"])
        ),
        "syllabus_objectives": [item.strip() for item in values["syllabus_objectives"]],
    }


def _provided_distribution(payload: CourseUpdate | CoursePatch) -> Distribution | None:
    if payload.credit_distribution is None:
        return None
    return [(d.semester_index, d.credits_allocated) for d in payload.credit_distribution]


def _check_code_echo(course: CourseRecord, code: str | None) -> None:
    if code is not None and code != course.code:
        raise CourseConflictError(
            f"Course codes are permanent identifiers referenced by prerequisite rules and cannot change "
            f"('{course.code}' -> '{code}')."
        )


def _apply_update(db: Session, course: CourseRecord, values: dict[str, Any], provided: Distribution | None) -> None:
    values = _normalize(values)
    _validate_semester_window(
        values["recommended_semester"], values["duration_semesters"], _semester_count_for(course)
    )
    values["corequisites"] = _clean_corequisites(db, course.id, values["corequisites"])
    distribution = _resolve_distribution(
        total=values["total_credits"],
        duration=values["duration_semesters"],
        start=values["recommended_semester"],
        provided=provided,
        existing=_existing_distribution(course),
    )
    _write_fields(course, values, distribution)


# ==========================================
# Public service API
# ==========================================


def _get_program(db: Session, program_id: str) -> DegreeProgramRecord:
    program = db.get(DegreeProgramRecord, program_id)
    if program is None:
        raise CourseNotFoundError(f"Degree program '{program_id}' was not found.")
    return program


def _check_code_free(db: Session, code: str) -> None:
    # `courses.code` is unique across the catalog, which also guarantees uniqueness within the program.
    taken = db.get(CourseRecord, code) or db.scalar(select(CourseRecord.id).where(CourseRecord.code == code))
    if taken:
        raise CourseConflictError(f"A course with code '{code}' already exists in the catalog.")


def _editable_values(payload: CourseUpdate) -> dict[str, Any]:
    """The editable course fields of a full-replacement payload (code, distribution and rule are handled apart)."""
    values = payload.model_dump(
        include={
            "title", "description", "total_credits", "duration_semesters", "recommended_semester",
            "type", "offered_semesters", "corequisites", "syllabus_objectives",
        }
    )
    values["contact_hours"] = payload.contact_hours.model_dump() if payload.contact_hours else {}
    return values


def create_course(db: Session, payload: CourseCreate) -> AdminCourse:
    """Create a course inside a degree program. The course ID is its code."""
    program = _get_program(db, payload.program_id)
    _check_code_free(db, payload.code)
    course = _stage_new_course(db, program, payload)
    return to_admin_course(_commit(db, course))


def _stage_new_course(db: Session, program: DegreeProgramRecord, payload: CourseCreate) -> CourseRecord:
    """Validate a new course and add it to the session without committing."""
    values = _normalize(_editable_values(payload))
    _validate_semester_window(values["recommended_semester"], values["duration_semesters"], program.semesters_count)
    values["corequisites"] = _clean_corequisites(db, payload.code, values["corequisites"])
    distribution = _resolve_distribution(
        total=values["total_credits"],
        duration=values["duration_semesters"],
        start=values["recommended_semester"],
        provided=_provided_distribution(payload),
        existing=[],
    )

    course = CourseRecord(id=payload.code, code=payload.code, prerequisite_rule=None)
    course.programs.append(program)
    _write_fields(course, values, distribution)
    db.add(course)
    return course


def replace_course(db: Session, course_id: str, payload: CourseUpdate) -> AdminCourse:
    """Full update (PUT) of a course's editable fields."""
    course = _get_course(db, course_id)
    _check_code_echo(course, payload.code)
    return _save_update(db, course, _editable_values(payload), _provided_distribution(payload))


def patch_course(db: Session, course_id: str, payload: CoursePatch) -> AdminCourse:
    """Partial update (PATCH): only the fields present in the request change."""
    course = _get_course(db, course_id)
    _check_code_echo(course, payload.code)
    changes = payload.model_dump(exclude_unset=True, exclude={"code", "credit_distribution", "contact_hours"})

    hours = course.contact_hours
    if payload.contact_hours is not None:
        # Merge only the supplied numbers over what is stored.
        hours = {"lecture": 0, "lab": 0, "tutorial": 0, **(course.contact_hours or {})}
        hours.update(payload.contact_hours.model_dump(exclude_unset=True))

    values: dict[str, Any] = {
        "title": course.title,
        "description": course.description or "",
        "total_credits": course.total_credits,
        "duration_semesters": course.duration_semesters,
        "recommended_semester": course.recommended_semester,
        "type": course.type,
        "offered_semesters": list(course.offered_semesters or []),
        "corequisites": list(course.corequisites or []),
        "syllabus_objectives": list(course.syllabus_objectives or []),
        "contact_hours": hours,
        **changes,
    }
    return _save_update(db, course, values, _provided_distribution(payload))


def _save_update(db: Session, course: CourseRecord, values: dict[str, Any], provided: Distribution | None) -> AdminCourse:
    """Validate and apply an update, discarding every pending change if any rule fails."""
    try:
        _apply_update(db, course, values, provided)
    except CourseServiceError:
        db.rollback()
        raise
    return to_admin_course(_commit(db, course))


# ==========================================
# Prerequisite rules and credit distributions (CF-203)
# ==========================================


def _referenced_course_ids(raw: Any) -> list[str]:
    """Course IDs referenced by a stored (JSON) rule tree, in first-seen order."""
    found: list[str] = []
    stack = [raw]
    while stack:
        node = stack.pop()
        if not isinstance(node, dict):
            continue
        if node.get("type") == "COURSE" and isinstance(node.get("courseId"), str):
            found.append(node["courseId"])
        stack.extend(reversed(node.get("children") or []))
    return list(dict.fromkeys(found))


def _find_dependency_cycle(course_id: str, targets: list[str], graph: dict[str, list[str]]) -> list[str] | None:
    """Return a path ``course -> ... -> course`` if requiring ``targets`` would make the course unreachable.

    ``graph`` maps a course to the courses its stored rule requires. A cycle exists when any new
    target can already reach ``course_id`` through those requirements.
    """
    for target in targets:
        parents: dict[str, str] = {}
        queue = [target]
        seen = {target}
        while queue:
            current = queue.pop(0)
            if current == course_id:
                path = [current]
                while path[-1] != target:
                    path.append(parents[path[-1]])
                return [course_id, *reversed(path)]
            for upstream in graph.get(current, []):
                if upstream not in seen:
                    seen.add(upstream)
                    parents[upstream] = current
                    queue.append(upstream)
    return None


def _check_prerequisite_rule(db: Session, course_id: str, rule: PrerequisiteRule, raw: dict[str, Any]) -> None:
    """Reject trees that are malformed, dangle, reference the course itself or create a cycle."""
    catalog = {
        row.id: row.prerequisite_rule
        for row in db.execute(select(CourseRecord.id, CourseRecord.prerequisite_rule))
    }
    issues = find_rule_issues(rule, course_id=course_id, known_course_ids=catalog.keys())
    if issues:
        raise RuleValidationError(issues)

    graph = {other: _referenced_course_ids(stored) for other, stored in catalog.items() if other != course_id}
    cycle = _find_dependency_cycle(course_id, _referenced_course_ids(raw), graph)
    if cycle:
        raise CourseValidationError(
            "prerequisiteRule",
            f"This rule would create a circular dependency: {' -> '.join(cycle)}.",
        )


def _write_prerequisite_rule(db: Session, course: CourseRecord, raw: dict[str, Any] | None) -> None:
    """Keep ``courses.prerequisite_rule`` and the relational ``prerequisite_rules`` row identical (as the seeder does)."""
    course.prerequisite_rule = raw
    record = course.prerequisite_rule_record
    if raw is None:
        if record is not None:
            db.delete(record)
    elif record is None:
        course.prerequisite_rule_record = PrerequisiteRuleRecord(
            course_id=course.id, rule_type=raw["type"], expression=raw
        )
    else:
        record.rule_type = raw["type"]
        record.expression = raw
    course.updated_at = func.now()


def set_prerequisite_rule(db: Session, course_id: str, rule: PrerequisiteRule | None) -> AdminCourse:
    """Replace a course's prerequisite AST (``None`` clears it) after validating it against the catalog."""
    course = _get_course(db, course_id)
    raw = None if rule is None else rule.model_dump(by_alias=True, mode="json")
    try:
        if rule is not None and raw is not None:
            _check_prerequisite_rule(db, course.id, rule, raw)
        _write_prerequisite_rule(db, course, raw)
    except CourseServiceError:
        db.rollback()
        raise
    return to_admin_course(_commit(db, course))


def set_credit_distribution(db: Session, course_id: str, entries: list[CreditDistribution]) -> AdminCourse:
    """Replace a course's per-semester credit split, enforcing the same rule as CF-202 edits."""
    course = _get_course(db, course_id)
    try:
        distribution = check_distribution(
            [(entry.semester_index, entry.credits_allocated) for entry in entries],
            course.total_credits,
            course.duration_semesters,
            course.recommended_semester,
        )
    except CourseServiceError:
        db.rollback()
        raise
    _replace_distribution(course, distribution)
    course.updated_at = func.now()
    return to_admin_course(_commit(db, course))


# ==========================================
# Reviewed extraction ingestion (CF-204)
# ==========================================


def stage_reviewed_course(db: Session, payload: CourseCreate, rule: PrerequisiteRule | None) -> CourseRecord:
    """Validate a reviewed course and its prerequisite rule and stage them without committing.

    A new code creates the course in ``payload.program_id``; an existing code replaces the course's editable
    fields (it must already belong to that program) and ``rule`` replaces its prerequisite rule. The caller
    commits, so the course can be written in the same transaction as other changes, and must roll back on error.
    """
    program = _get_program(db, payload.program_id)
    course = db.get(CourseRecord, payload.code)
    if course is None:
        _check_code_free(db, payload.code)
        course = _stage_new_course(db, program, payload)
    elif program not in course.programs:
        raise CourseConflictError(
            f"Course '{payload.code}' already exists outside degree program '{payload.program_id}'."
        )
    else:
        _apply_update(db, course, _editable_values(payload), _provided_distribution(payload))

    raw = None if rule is None else rule.model_dump(by_alias=True, mode="json")
    if rule is not None and raw is not None:
        _check_prerequisite_rule(db, course.id, rule, raw)
    _write_prerequisite_rule(db, course, raw)
    return course
