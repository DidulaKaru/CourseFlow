#!/usr/bin/env python3
"""CourseFlow invariant checker (CF-GUARD).

Executable form of the non-negotiable rules in agents.md / CLAUDE.md. Stdlib only,
Python 3.11-compatible, so it runs in the pre-commit hook, in CI and in Claude Code
hooks without installing anything.

    python scripts/check_invariants.py                 # every check
    python scripts/check_invariants.py --only ui,canvas
    python scripts/check_invariants.py --for-file PATH # only checks relevant to PATH
    python scripts/check_invariants.py --list

Errors exit 1. Warnings are printed but never fail the run.

Git-aware checks diff against CF_BASE_REF (default ``origin/dev``) and are skipped when
that ref cannot be resolved. CF_ALLOW_CATALOG_EDIT=1 lets a human-approved ``data(...)``
change touch official catalog fields.

A single line can opt out of a UI rule with a justified marker comment, for example
``{/* cf-allow: rounded-full status dot, not a card */}``.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
from collections.abc import Callable, Iterable
from dataclasses import dataclass, field
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
FRONTEND_SRC = REPO / "frontend" / "src"
CATALOG_DIRS = (REPO / "frontend" / "src" / "data" / "programs", REPO / "backend" / "data" / "programs")
CANVAS_FILE = FRONTEND_SRC / "features" / "canvas" / "CurriculumCanvas.tsx"
VIEWPORT_FILE = FRONTEND_SRC / "features" / "canvas" / "utils" / "viewport.ts"
STORE_FILE = FRONTEND_SRC / "core" / "store.ts"
TS_EVALUATOR = "frontend/src/core/algorithms/ast_evaluator.ts"
PY_EVALUATOR = "backend/app/core/ast_evaluator.py"

AST_TYPES = {"AND", "OR", "COURSE", "CREDIT_THRESHOLD"}
MAX_AST_DEPTH = 20
IMMUTABLE_COURSE_FIELDS = ("code", "title", "totalCredits")
ALLOW_MARKER = "cf-allow:"

# Design system: design-philosophy.md (friendly, light, mobile-first). These rules apply to
# NEW or CHANGED lines only (vs CF_BASE_REF), so legacy Skyrim-styled code migrates as it is touched.
MIGRATION_UI = (
    (re.compile(r"constellation-|star-pip|nebula-core|skyrim-|--accent-primary|\bfont-serif\b|Cinzel|JetBrains"),
     "legacy Skyrim theme token; use the design-philosophy.md tokens (section 10 migration table)"),
    (re.compile(r"-\[#[0-9a-fA-F]{3,8}(?:/\d+)?\]"),
     "raw hex class value; use tokens (bg-surface, text-ink, border-line, bg-accent, ...)"),
    (re.compile(r"\btext-\[(?:[0-9]|1[01])(?:\.\d+)?px\]"), "text below 12px; minimum is text-xs, usually text-sm"),
    (re.compile(r"\bbg-(?:black|(?:slate|gray|zinc|neutral|stone)-9[05]0)\b"),
     "dark surface; CourseFlow is light-first (bg-canvas / bg-surface)"),
    (re.compile(r"\b(?:purple|pink|fuchsia|violet)-\d{2,3}\b"), "off-palette color; use accent or status tokens"),
    (re.compile(r"(?<![\w-])h-screen\b"), "h-screen breaks on mobile browsers; use min-h-dvh / h-dvh"),
    (re.compile(r"\bbackdrop-blur-(?:md|lg|xl|2xl|3xl)\b"), "heavy blur is slow on mid-range phones"),
)
# Pictographic emoji only; typographic marks such as U+2713 (check mark) are allowed.
EMOJI = re.compile("[\U0001f300-\U0001faff☀-⛿✅❌⭐]")
REQUIRED_CANVAS_PROPS = (
    "translateExtent={translateExtent}",
    "panOnScroll={true}",
    "panOnScrollMode={PanOnScrollMode.Vertical}",
    "zoomOnScroll={false}",
    "zoomOnPinch={true}",
    "panOnDrag={true}",
)
FOCUSED_TEST = re.compile(r"\b(?:describe|it|test)\.only\s*\(|\bf(?:it|describe)\s*\(")


@dataclass
class Report:
    errors: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    skipped: list[str] = field(default_factory=list)

    def error(self, check: str, msg: str) -> None:
        self.errors.append(f"[{check}] {msg}")

    def warn(self, check: str, msg: str) -> None:
        self.warnings.append(f"[{check}] {msg}")


def rel(path: Path) -> str:
    try:
        return path.resolve().relative_to(REPO).as_posix()
    except ValueError:
        return path.as_posix()


def is_test_path(path: Path | str) -> bool:
    p = Path(path).as_posix()
    return "/__tests__/" in p or ".test." in p or ".spec." in p or "/tests/" in p


# --------------------------------------------------------------------------- git


def git(*args: str) -> str | None:
    try:
        out = subprocess.run(
            ["git", *args], cwd=REPO, capture_output=True, text=True, encoding="utf-8", check=True
        )
    except (OSError, subprocess.CalledProcessError):
        return None
    return out.stdout


def base_ref() -> str | None:
    ref = os.environ.get("CF_BASE_REF", "origin/dev")
    if git("rev-parse", "--verify", "--quiet", ref) is None:
        return None
    return (git("merge-base", ref, "HEAD") or "").strip() or None


def changed_files(base: str) -> set[str]:
    """Files changed vs base, including staged, unstaged and untracked work."""
    files: set[str] = set()
    for out in (
        git("diff", "--name-only", base),
        git("ls-files", "--others", "--exclude-standard"),
    ):
        files.update(line.strip() for line in (out or "").splitlines() if line.strip())
    return files


def current_branch() -> str:
    return os.environ.get("GITHUB_HEAD_REF") or (git("rev-parse", "--abbrev-ref", "HEAD") or "").strip()


# --------------------------------------------------------------------------- catalog


def ast_problems(rule: object, known_codes: set[str], depth: int = 0) -> Iterable[str]:
    """Yield human-readable problems in one prerequisite AST (mirrors both evaluators)."""
    if rule is None:
        return
    if depth > MAX_AST_DEPTH:
        yield f"AST deeper than {MAX_AST_DEPTH} levels"
        return
    if not isinstance(rule, dict):
        yield f"AST node is not an object: {rule!r}"
        return
    kind = rule.get("type")
    if kind not in AST_TYPES:
        yield f"unknown AST node type {kind!r} (allowed: {sorted(AST_TYPES)})"
    elif kind == "COURSE":
        if rule.get("courseId") not in known_codes:
            yield f"COURSE references unknown course {rule.get('courseId')!r}"
    elif kind == "CREDIT_THRESHOLD":
        min_credits = rule.get("minCredits")
        if not isinstance(min_credits, int | float) or min_credits < 0:
            yield f"CREDIT_THRESHOLD.minCredits must be >= 0, got {min_credits!r}"
    else:
        children = rule.get("children")
        if not isinstance(children, list) or not children:
            yield f"{kind} node needs a non-empty children list"
        else:
            for child in children:
                yield from ast_problems(child, known_codes, depth + 1)


def ast_course_refs(rule: object) -> Iterable[str]:
    if isinstance(rule, dict):
        if rule.get("type") == "COURSE" and isinstance(rule.get("courseId"), str):
            yield rule["courseId"]
        for child in rule.get("children") or []:
            yield from ast_course_refs(child)


def find_cycle(edges: dict[str, set[str]]) -> list[str] | None:
    """Return one prerequisite cycle as a path, or None if the graph is a DAG."""
    white, grey, black = 0, 1, 2
    color = dict.fromkeys(edges, white)
    stack: list[str] = []

    def visit(node: str) -> list[str] | None:
        color[node] = grey
        stack.append(node)
        for nxt in sorted(edges.get(node, ())):
            if color.get(nxt, white) == grey:
                return [*stack[stack.index(nxt):], nxt]
            if color.get(nxt, white) == white and nxt in edges:
                found = visit(nxt)
                if found:
                    return found
        stack.pop()
        color[node] = black
        return None

    for start in sorted(edges):
        if color[start] == white:
            found = visit(start)
            if found:
                return found
    return None


def catalog_problems(program: dict) -> list[str]:
    """Structural rules every program catalog must satisfy."""
    problems: list[str] = []
    courses = program.get("courses")
    if not isinstance(courses, list):
        return ["catalog has no 'courses' list"]
    semesters = program.get("semestersCount") or 8
    codes = [c.get("code") for c in courses]
    seen: set[str] = set()
    for code in codes:
        if code in seen:
            problems.append(f"duplicate course code {code}")
        seen.add(code)
    known = set(codes)
    edges: dict[str, set[str]] = {}
    for c in courses:
        code = c.get("code", "?")
        if re.search(r"_[A-Z]$", str(code)):
            problems.append(f"{code}: split course code; use one entity with creditDistribution")
        if c.get("id") != code:
            problems.append(f"{code}: id {c.get('id')!r} must equal code")
        total = c.get("totalCredits")
        if not isinstance(total, int | float) or not 1 <= total <= 12:
            problems.append(f"{code}: totalCredits {total!r} outside 1..12")
        dist = c.get("creditDistribution") or []
        if not dist:
            problems.append(f"{code}: empty creditDistribution")
        elif sum(d.get("creditsAllocated", 0) for d in dist) != total:
            problems.append(f"{code}: creditDistribution sums to "
                            f"{sum(d.get('creditsAllocated', 0) for d in dist)}, totalCredits is {total}")
        for d in dist:
            if not 1 <= d.get("semesterIndex", 0) <= semesters:
                problems.append(f"{code}: semesterIndex {d.get('semesterIndex')} outside 1..{semesters}")
        rule = c.get("prerequisiteRule")
        problems.extend(f"{code}: {p}" for p in ast_problems(rule, known))
        refs = set(ast_course_refs(rule))
        if code in refs:
            problems.append(f"{code}: lists itself as a prerequisite")
        edges[code] = refs & known
        for coreq in c.get("corequisites") or []:
            if coreq not in known:
                problems.append(f"{code}: corequisite {coreq!r} is not in the catalog")
    cycle = find_cycle(edges)
    if cycle:
        problems.append("prerequisite cycle: " + " -> ".join(cycle))
    return problems


def check_catalog(report: Report) -> None:
    front, back = CATALOG_DIRS
    front_files = {p.name for p in front.glob("*.json")}
    back_files = {p.name for p in back.glob("*.json")}
    for name in sorted(front_files ^ back_files):
        report.error("catalog", f"{name} exists in only one of frontend/src/data/programs and "
                     "backend/data/programs; the two copies must match")
    for name in sorted(front_files & back_files):
        if (front / name).read_bytes() != (back / name).read_bytes():
            report.error("catalog", f"{name} differs between frontend/src/data/programs and "
                         "backend/data/programs; copy the edited file over the other one")
    for path in sorted(front.glob("*.json")):
        try:
            program = json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as exc:
            report.error("catalog", f"{rel(path)}: invalid JSON ({exc})")
            continue
        for problem in catalog_problems(program):
            report.error("catalog", f"{rel(path)}: {problem}")


def immutable_field_changes(old: dict, new: dict) -> list[str]:
    old_by_code = {c.get("code"): c for c in old.get("courses", [])}
    new_by_code = {c.get("code"): c for c in new.get("courses", [])}
    changes = [f"course {code} was removed" for code in sorted(old_by_code.keys() - new_by_code.keys())]
    for code in sorted(old_by_code.keys() & new_by_code.keys()):
        for fld in IMMUTABLE_COURSE_FIELDS:
            if old_by_code[code].get(fld) != new_by_code[code].get(fld):
                changes.append(f"{code}.{fld}: {old_by_code[code].get(fld)!r} -> "
                               f"{new_by_code[code].get(fld)!r}")
    return changes


def check_catalog_immutable(report: Report) -> None:
    base = base_ref()
    if base is None:
        report.skipped.append("catalog-immutable (no CF_BASE_REF / origin/dev to diff against)")
        return
    allowed = os.environ.get("CF_ALLOW_CATALOG_EDIT") == "1"
    for path in sorted(CATALOG_DIRS[0].glob("*.json")) + sorted(CATALOG_DIRS[1].glob("*.json")):
        old_text = git("show", f"{base}:{rel(path)}")
        if old_text is None:
            continue
        try:
            changes = immutable_field_changes(json.loads(old_text), json.loads(path.read_text(encoding="utf-8")))
        except json.JSONDecodeError:
            continue  # reported by the catalog check
        for change in changes:
            msg = (f"{rel(path)}: {change}. Course codes, titles and credits are official catalog "
                   "data. Only a human can approve this (re-run with CF_ALLOW_CATALOG_EDIT=1).")
            (report.warn if allowed else report.error)("catalog-immutable", msg)


# --------------------------------------------------------------------------- frontend


def ui_problems(text: str) -> list[tuple[int, str]]:
    """Always-on UI rules, applied to whole files."""
    return [(lineno, "emoji in UI; use a Lucide icon (emoji render differently on every phone)")
            for lineno, line in enumerate(text.splitlines(), 1)
            if ALLOW_MARKER not in line and EMOJI.search(line)]


def migration_problems(line: str) -> list[str]:
    """Design-system rules for one new or changed line."""
    if ALLOW_MARKER in line:
        return []
    found = []
    for pattern, why in MIGRATION_UI:
        match = pattern.search(line)
        if match:
            found.append(f"'{match.group(0)}': {why}")
    return found


def viewport_problems(html: str) -> list[str]:
    meta = re.search(r"<meta[^>]+name=[\"']viewport[\"'][^>]*>", html, re.IGNORECASE)
    if not meta:
        return ["index.html has no viewport meta tag"]
    content = meta.group(0)
    problems = []
    if "width=device-width" not in content:
        problems.append("viewport meta must include width=device-width")
    if re.search(r"user-scalable\s*=\s*(?:no|0)|maximum-scale\s*=\s*1(?:\.0)?(?![\d.])", content):
        problems.append("viewport meta disables pinch zoom (an accessibility failure on mobile)")
    return problems


def frontend_sources(suffixes: tuple[str, ...] = (".tsx", ".ts", ".css")) -> list[Path]:
    return [p for p in sorted(FRONTEND_SRC.rglob("*"))
            if p.suffix in suffixes and not is_test_path(rel(p)) and "types/api.ts" not in rel(p)]


def is_ui_file(path: str) -> bool:
    return ((path.startswith("frontend/src/") and path.endswith((".tsx", ".ts", ".css"))
             and not is_test_path(path) and path != "frontend/src/types/api.ts")
            or path == "frontend/index.html")


def check_ui(report: Report, files: list[Path] | None = None) -> None:
    hint = f"(justified exception: add '{ALLOW_MARKER} <reason>' on the line)"
    for path in files if files is not None else frontend_sources():
        for lineno, problem in ui_problems(path.read_text(encoding="utf-8")):
            report.error("ui", f"{rel(path)}:{lineno}: {problem} {hint}")
    index_html = REPO / "frontend" / "index.html"
    if files is None or index_html.resolve() in [f.resolve() for f in files]:
        for problem in viewport_problems(index_html.read_text(encoding="utf-8")):
            report.error("ui", f"frontend/index.html: {problem}")


def parse_added_lines(diff: str) -> dict[str, list[tuple[int, str]]]:
    """Map file -> [(new line number, text)] for every added line in a unified diff."""
    added: dict[str, list[tuple[int, str]]] = {}
    current: str | None = None
    lineno = 0
    for raw in diff.splitlines():
        line = raw.rstrip("\r")
        if line.startswith("+++ "):
            current = line[6:] if line.startswith("+++ b/") else None
            continue
        hunk = re.match(r"@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@", line)
        if hunk:
            lineno = int(hunk.group(1))
            continue
        if current is None or line.startswith(("--- ", "\\")):
            continue
        if line.startswith("+"):
            added.setdefault(current, []).append((lineno, line[1:]))
            lineno += 1
        elif not line.startswith("-"):
            lineno += 1
    return added


def check_ui_migration(report: Report, files: list[Path] | None = None) -> None:
    base = base_ref()
    if base is None:
        report.skipped.append("ui-migration (no CF_BASE_REF / origin/dev to diff against)")
        return
    paths = [rel(f) for f in files] if files is not None else ["frontend/src", "frontend/index.html"]
    added = parse_added_lines(git("diff", "-U0", "--no-color", "--no-ext-diff", base, "--", *paths) or "")
    untracked = (git("ls-files", "--others", "--exclude-standard", "--", *paths) or "").splitlines()
    for path in untracked:
        full = REPO / path
        if full.is_file():
            added[path] = list(enumerate(full.read_text(encoding="utf-8", errors="replace").splitlines(), 1))
    for path, lines in sorted(added.items()):
        if not is_ui_file(path):
            continue
        for lineno, text in lines:
            for problem in migration_problems(text):
                report.error("ui-migration", f"{path}:{lineno}: {problem}. New or changed lines must follow "
                             f"design-philosophy.md ({ALLOW_MARKER} <reason> for a real exception)")


def check_canvas(report: Report) -> None:
    if not CANVAS_FILE.exists():
        report.error("canvas", f"{rel(CANVAS_FILE)} is missing")
        return
    text = CANVAS_FILE.read_text(encoding="utf-8")
    for prop in REQUIRED_CANVAS_PROPS:
        if prop not in text:
            report.error("canvas", f"{rel(CANVAS_FILE)}: <ReactFlow> must keep `{prop}` (agents.md section 2)")
    if not re.search(r"useMemo\(\s*\(\)\s*=>\s*\{?\s*(?:return\s+)?calculateCanvasTranslateExtent\(layout\)", text):
        report.error("canvas", f"{rel(CANVAS_FILE)}: translateExtent must be "
                     "useMemo(() => calculateCanvasTranslateExtent(layout), [layout])")
    for path in (CANVAS_FILE, VIEWPORT_FILE):
        if not path.exists():
            continue
        for lineno, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
            if line.lstrip().startswith(("//", "*", "/*")):
                continue  # prose about the rule, not code
            if re.search(r"\bInfinity\b", line):
                report.error("canvas", f"{rel(path)}:{lineno}: Infinity found; the camera extent must stay finite")


def check_imports(report: Report) -> None:
    import_re = re.compile(r"import\s*(?:type\s*)?\{[^}]*\bmockCourses\b[^}]*\}", re.DOTALL)
    for path in frontend_sources((".ts", ".tsx")):
        if path.name == "mockCourses.ts":
            continue
        if import_re.search(path.read_text(encoding="utf-8")):
            report.error("imports", f"{rel(path)}: imports the CE-only `mockCourses`; use "
                         "getProgramCourses(activeProgramId) instead")


def check_store(report: Report) -> None:
    if not STORE_FILE.exists():
        report.error("store", f"{rel(STORE_FILE)} is missing")
        return
    text = STORE_FILE.read_text(encoding="utf-8")
    if "'courseflow-local-planner'" not in text and '"courseflow-local-planner"' not in text:
        report.error("store", "persist key 'courseflow-local-planner' must not change (it would wipe student plans)")
    version = re.search(r"^\s*version:\s*(\d+)\s*,", text, re.MULTILINE)
    if not version or "migrate:" not in text:
        report.error("store", "persisted store needs a numeric `version` and a `migrate()`")
        return
    base = base_ref()
    if base is None:
        return
    old = git("show", f"{base}:{rel(STORE_FILE)}") or ""
    old_version = re.search(r"^\s*version:\s*(\d+)\s*,", old, re.MULTILINE)
    if old_version and int(version.group(1)) < int(old_version.group(1)):
        report.error("store", f"persist version went down ({old_version.group(1)} -> {version.group(1)})")
    elif old and old != text and old_version and old_version.group(1) == version.group(1):
        report.warn("store", "store.ts changed but the persist version did not. If the persisted shape "
                    "changed, bump `version` and add a migrate() branch with a test.")


# --------------------------------------------------------------------------- cross-cutting


def check_tests(report: Report) -> None:
    # `.only` / `fit` are Vitest concepts; pytest has no equivalent, so only TS tests are scanned.
    for path in sorted(FRONTEND_SRC.rglob("*")):
        if path.suffix not in (".ts", ".tsx") or not is_test_path(rel(path)):
            continue
        for lineno, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
            if FOCUSED_TEST.search(line):
                report.error("tests", f"{rel(path)}:{lineno}: focused test silently skips the rest of the suite")


def check_change_coupling(report: Report) -> None:
    base = base_ref()
    if base is None:
        report.skipped.append("coupling (no CF_BASE_REF / origin/dev to diff against)")
        return
    changed = changed_files(base)
    if (TS_EVALUATOR in changed) != (PY_EVALUATOR in changed):
        report.warn("coupling", f"only one of {TS_EVALUATOR} / {PY_EVALUATOR} changed; the two "
                    "evaluators must stay behaviorally identical")
    if any(f.startswith("backend/app/schemas/") for f in changed) and "frontend/src/types/api.ts" not in changed:
        report.warn("coupling", "backend schemas changed but frontend/src/types/api.ts did not; "
                    "run `npm --workspace=frontend run generate-types` if the API contract moved")
    branch = current_branch()
    if branch.startswith("fix/"):
        source = [f for f in changed if f.endswith((".ts", ".tsx", ".py")) and not is_test_path(f)]
        tests = [f for f in changed if is_test_path(f)]
        if source and not tests:
            report.error("coupling", f"branch {branch} changes code but adds no test. Every bug fix "
                         "ships with a regression test (agents.md section 1).")


CHECKS: dict[str, Callable[[Report], None]] = {
    "catalog": check_catalog,
    "catalog-immutable": check_catalog_immutable,
    "ui": check_ui,
    "ui-migration": check_ui_migration,
    "canvas": check_canvas,
    "imports": check_imports,
    "store": check_store,
    "tests": check_tests,
    "coupling": check_change_coupling,
}


def checks_for_file(path: str) -> list[str]:
    """Fast checks relevant to a single edited file (used by editor hooks); UI checks are added by main()."""
    p = Path(path).resolve()
    r = rel(p)
    if r.startswith(("frontend/src/data/programs/", "backend/data/programs/")):
        return ["catalog"]
    if r == rel(CANVAS_FILE) or r == rel(VIEWPORT_FILE):
        return ["canvas"]
    if r == rel(STORE_FILE):
        return ["store"]
    if is_test_path(r) and p.suffix in (".ts", ".tsx"):
        return ["tests"]
    if r.startswith("frontend/src/") and p.suffix in (".ts", ".tsx"):
        return ["imports"]
    return []


def run(names: Iterable[str], report: Report, for_file: str | None = None) -> Report:
    for name in names:
        if name in ("ui", "ui-migration") and for_file is not None:
            p = Path(for_file).resolve()
            if p.exists() and is_ui_file(rel(p)):
                (check_ui if name == "ui" else check_ui_migration)(report, [p])
            continue
        CHECKS[name](report)
    return report


def main(argv: list[str] | None = None) -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--only", help="comma-separated check names")
    parser.add_argument("--for-file", help="run only the fast checks relevant to this file")
    parser.add_argument("--list", action="store_true", help="list check names")
    parser.add_argument("--quiet", action="store_true", help="print nothing when everything passes")
    args = parser.parse_args(argv)

    if args.list:
        print("\n".join(CHECKS))
        return 0
    if args.for_file:
        names = checks_for_file(args.for_file)
        rp = Path(args.for_file).resolve()
        if is_ui_file(rel(rp)):
            names += ["ui", "ui-migration"]
    elif args.only:
        names = [n.strip() for n in args.only.split(",") if n.strip()]
        unknown = [n for n in names if n not in CHECKS]
        if unknown:
            parser.error(f"unknown check(s): {', '.join(unknown)}")
    else:
        names = list(CHECKS)

    report = run(names, Report(), for_file=args.for_file)
    for line in report.warnings:
        print(f"WARN  {line}")
    for line in report.errors:
        print(f"FAIL  {line}")
    if report.errors:
        print(f"\n{len(report.errors)} invariant violation(s). See agents.md / CLAUDE.md for the rule behind each.")
        return 1
    if not args.quiet:
        skipped = f" (skipped: {'; '.join(report.skipped)})" if report.skipped else ""
        print(f"Invariants OK: {', '.join(names) or 'nothing to check'}{skipped}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
