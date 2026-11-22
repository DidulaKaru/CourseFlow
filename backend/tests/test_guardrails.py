"""CF-GUARD regression locks for the AI guardrails.

Covers scripts/check_invariants.py (the executable form of agents.md), the Claude Code
hooks in .claude/hooks/cf_guard.py, and the wiring that makes CI, pre-commit and Claude
Code actually run them.
"""

import importlib.util
import json
import sys
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
CHECKER_PATH = REPO_ROOT / "scripts" / "check_invariants.py"
HOOK_PATH = REPO_ROOT / ".claude" / "hooks" / "cf_guard.py"

pytestmark = pytest.mark.skipif(
    not (CHECKER_PATH.exists() and HOOK_PATH.exists()),
    reason="repo root not mounted (e.g. inside backend container)",
)


def _load(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module  # @dataclass resolves its module through sys.modules
    spec.loader.exec_module(module)
    return module


@pytest.fixture(scope="module")
def checker():
    return _load("cf_check_invariants", CHECKER_PATH)


@pytest.fixture(scope="module")
def guard():
    return _load("cf_guard_hook", HOOK_PATH)


def _course(code, credits=3, dist=None, rule=None, coreqs=None):
    return {
        "id": code,
        "code": code,
        "title": f"Title {code}",
        "totalCredits": credits,
        "creditDistribution": dist or [{"semesterIndex": 1, "creditsAllocated": credits}],
        "prerequisiteRule": rule,
        "corequisites": coreqs or [],
    }


def _program(*courses):
    return {"semestersCount": 8, "courses": list(courses)}


# --------------------------------------------------------------------------- checker: repo state


def test_current_repo_satisfies_every_static_invariant(checker):
    assert checker.main(["--only", "catalog,ui,canvas,imports,store,tests", "--quiet"]) == 0


# --------------------------------------------------------------------------- checker: catalog


def test_valid_catalog_has_no_problems(checker):
    rule = {"type": "AND", "children": [
        {"type": "COURSE", "courseId": "CE1001"},
        {"type": "CREDIT_THRESHOLD", "minCredits": 30},
    ]}
    program = _program(
        _course("CE1001"),
        _course("CE2001", credits=4, dist=[{"semesterIndex": 3, "creditsAllocated": 2},
                                           {"semesterIndex": 4, "creditsAllocated": 2}], rule=rule),
    )
    assert checker.catalog_problems(program) == []


@pytest.mark.parametrize(
    ("course", "fragment"),
    [
        (_course("CE1001", credits=3, dist=[{"semesterIndex": 1, "creditsAllocated": 2}]), "sums to 2"),
        (_course("CE1001", credits=13), "outside 1..12"),
        (_course("CE4001_A"), "split course code"),
        (_course("CE1001", dist=[{"semesterIndex": 9, "creditsAllocated": 3}]), "semesterIndex 9"),
        (_course("CE1001", rule={"type": "COURSE", "courseId": "NOPE"}), "unknown course 'NOPE'"),
        (_course("CE1001", rule={"type": "CREDIT_THRESHOLD", "minCredits": -1}), "minCredits must be >= 0"),
        (_course("CE1001", rule={"type": "XOR", "children": []}), "unknown AST node type"),
        (_course("CE1001", rule={"type": "OR", "children": []}), "non-empty children"),
        (_course("CE1001", rule={"type": "COURSE", "courseId": "CE1001"}), "lists itself"),
        (_course("CE1001", coreqs=["GHOST"]), "corequisite 'GHOST'"),
    ],
)
def test_catalog_rule_violations_are_reported(checker, course, fragment):
    problems = checker.catalog_problems(_program(course))
    assert any(fragment in p for p in problems), problems


def test_ast_depth_guard_matches_evaluators(checker):
    rule = {"type": "COURSE", "courseId": "CE1001"}
    for _ in range(21):
        rule = {"type": "AND", "children": [rule]}
    problems = checker.catalog_problems(_program(_course("CE1001"), _course("CE2001", rule=rule)))
    assert any("deeper than 20" in p for p in problems)


def test_prerequisite_cycle_is_detected(checker):
    program = _program(
        _course("A1", rule={"type": "COURSE", "courseId": "B1"}),
        _course("B1", rule={"type": "COURSE", "courseId": "C1"}),
        _course("C1", rule={"type": "COURSE", "courseId": "A1"}),
    )
    assert any("prerequisite cycle: A1 -> B1 -> C1 -> A1" in p for p in checker.catalog_problems(program))


def test_duplicate_codes_and_id_mismatch_are_reported(checker):
    bad = _course("CE1001")
    bad["id"] = "ce1001"
    problems = checker.catalog_problems(_program(_course("CE1001"), bad))
    assert any("duplicate course code CE1001" in p for p in problems)
    assert any("must equal code" in p for p in problems)


def test_immutable_catalog_fields_are_diffed(checker):
    old = _program(_course("CE1001"), _course("CE1002"))
    new = _program({**_course("CE1001"), "title": "Renamed", "description": "free to change"})
    changes = checker.immutable_field_changes(old, new)
    assert "course CE1002 was removed" in changes
    assert any(c.startswith("CE1001.title") for c in changes)
    assert not any("description" in c for c in changes)


# --------------------------------------------------------------------------- checker: frontend


def test_emoji_is_flagged_on_any_line(checker):
    assert checker.ui_problems("<h1>\U0001f680 Launch</h1>")
    assert checker.ui_problems("<p>⚠️ warning</p>")
    assert checker.ui_problems("<Text>✓ Completed</Text>") == []  # typographic mark, not emoji
    assert checker.ui_problems("<p>\U0001f389 done</p> {/* cf-allow: user-entered note */}") == []


@pytest.mark.parametrize(
    "line",
    [
        '<div className="bg-[#070B12]/85 backdrop-blur-sm">',  # raw hex (legacy glass)
        '<p className="text-[10px] uppercase">',  # sub-12px text
        '<h2 className="font-serif tracking-[0.2em]">',  # Cinzel heading
        '<span className="bg-[var(--star-pip)]" />',  # legacy token
        "stroke: 'var(--constellation-beam)',",  # legacy token in TS
        '<div className="bg-black">',  # dark surface
        '<div className="bg-slate-950">',
        '<span className="text-purple-400">',  # off-palette
        '<div className="h-screen">',  # breaks mobile browsers
        '<div className="backdrop-blur-xl">',  # heavy blur on phones
    ],
)
def test_legacy_or_mobile_hostile_styling_is_flagged_on_new_lines(checker, line):
    assert checker.migration_problems(line), line


@pytest.mark.parametrize(
    "line",
    [
        '<article className="rounded-2xl bg-surface border border-line shadow-sm p-4">',
        '<span className="rounded-full bg-accent-soft text-accent-strong text-sm px-3">',
        '<button className="min-h-11 rounded-xl bg-accent text-white">',
        '<div className="min-h-dvh bg-canvas text-ink">',
        '<p className="text-xs text-ink-subtle tabular-nums">',
        '<div className="bg-[#123456]"> {/* cf-allow: third-party widget override */}',
    ],
)
def test_design_system_styling_passes(checker, line):
    assert checker.migration_problems(line) == []


def test_viewport_must_allow_pinch_zoom(checker):
    good = '<meta name="viewport" content="width=device-width, initial-scale=1.0" />'
    assert checker.viewport_problems(good) == []
    assert checker.viewport_problems(good.replace("1.0", "1.0, maximum-scale=1"))
    assert checker.viewport_problems(good.replace("1.0", "1.0, user-scalable=no"))
    assert checker.viewport_problems("<head></head>") == ["index.html has no viewport meta tag"]


def test_only_added_lines_are_held_to_the_new_design(checker):
    diff = (
        "diff --git a/frontend/src/A.tsx b/frontend/src/A.tsx\n"
        "--- a/frontend/src/A.tsx\n"
        "+++ b/frontend/src/A.tsx\n"
        "@@ -10,2 +10,3 @@\n"
        "-<div className=\"old\">\n"
        "+<div className=\"text-[9px]\">\n"
        "+<p>new</p>\r\n"
        "@@ -40 +41 @@\n"
        "+<span />\n"
        "diff --git a/frontend/src/gone.tsx b/frontend/src/gone.tsx\n"
        "--- a/frontend/src/gone.tsx\n"
        "+++ /dev/null\n"
        "@@ -1 +0,0 @@\n"
        "-removed\n"
    )
    added = checker.parse_added_lines(diff)
    assert added == {"frontend/src/A.tsx": [(10, '<div className="text-[9px]">'), (11, "<p>new</p>"), (41, "<span />")]}


def test_ui_file_scope(checker):
    assert checker.is_ui_file("frontend/src/features/canvas/components/CourseNode.tsx")
    assert checker.is_ui_file("frontend/src/index.css")
    assert checker.is_ui_file("frontend/index.html")
    assert not checker.is_ui_file("frontend/src/types/api.ts")
    assert not checker.is_ui_file("frontend/src/core/__tests__/layout.test.ts")
    assert not checker.is_ui_file("backend/app/main.py")


def test_edited_file_maps_to_relevant_fast_checks(checker):
    assert checker.checks_for_file("frontend/src/data/programs/computer_engineering.json") == ["catalog"]
    assert checker.checks_for_file("frontend/src/features/canvas/CurriculumCanvas.tsx") == ["canvas"]
    assert checker.checks_for_file("frontend/src/core/store.ts") == ["store"]
    assert checker.checks_for_file("frontend/src/core/__tests__/layout.test.ts") == ["tests"]
    assert checker.checks_for_file("backend/tests/test_ast.py") == []
    assert checker.checks_for_file("frontend/src/App.tsx") == ["imports"]
    assert checker.checks_for_file("README.md") == []


def test_focused_tests_are_detected(checker):
    assert checker.FOCUSED_TEST.search("it.only('x', () => {})")
    assert checker.FOCUSED_TEST.search("describe.only('x', () => {})")
    assert not checker.FOCUSED_TEST.search("it('only works when', () => {})")


# --------------------------------------------------------------------------- Claude Code bash hook


@pytest.mark.parametrize(
    ("command", "branch", "verdict"),
    [
        ('git commit --no-verify -m "x"', "feature/cf-1-x", "deny"),
        ('git commit -nm "x"', "feature/cf-1-x", "deny"),
        ("HUSKY=0 git commit -m x", "feature/cf-1-x", "deny"),
        ('git commit -m "x"', "dev", "deny"),
        ("git push origin dev", "feature/cf-1-x", "deny"),
        ("git push origin HEAD:main", "feature/cf-1-x", "deny"),
        ("git push origin HEAD", "dev", "deny"),
        ("git push", "main", "deny"),
        ("git push --force origin feature/cf-1-x", "feature/cf-1-x", "deny"),
        ("git reset --hard HEAD~1", "feature/cf-1-x", "deny"),
        ("git clean -fd", "feature/cf-1-x", "deny"),
        ("rm -rf backend", "feature/cf-1-x", "deny"),
        ("cat .env", "feature/cf-1-x", "deny"),
    ],
)
def test_bash_guard_blocks_risky_commands(guard, command, branch, verdict):
    result = guard.review_bash(command, branch)
    assert result is not None and result[0] == verdict, result


@pytest.mark.parametrize(
    "command",
    [
        'git commit -m "fix: handle -n flag in parser (CF-9)"',
        "git push -u origin feature/cf-1-x",
        "npm test",
        "npm install",
        "pip install -r backend/requirements.txt",
        "cat .env.example",
        "python -m pytest backend/tests -q",
        "git diff dev...HEAD",
        "git push --force-with-lease origin feature/cf-1-x",
        "npm install left-pad",
        "pip install requests",
        "sed -i 's/85/50/' .github/workflows/ci.yml",
    ],
)
def test_bash_guard_allows_normal_work(guard, command):
    assert guard.review_bash(command, "feature/cf-1-x") is None


# --------------------------------------------------------------------------- Claude Code edit hook


def test_edit_guard_protects_secrets_and_generated_files(guard):
    assert guard.review_edit("Write", {"file_path": ".env", "content": "X=1"})[0] == "deny"
    assert guard.review_edit("Edit", {"file_path": ".env.production"})[0] == "deny"
    assert guard.review_edit("Edit", {"file_path": ".env.example", "old_string": "a", "new_string": "b"}) is None
    assert guard.review_edit("Edit", {"file_path": "frontend/src/types/api.ts"})[0] == "deny"


@pytest.mark.parametrize(
    "path",
    [".claude/settings.json", ".claude/hooks/cf_guard.py", "scripts/check_invariants.py",
     ".husky/pre-commit", ".github/workflows/ci.yml", "CLAUDE.md", "backend/tests/test_ci_workflow.py"],
)
def test_guardrail_files_are_editable_without_prompting(guard, path):
    assert guard.review_edit("Edit", {"file_path": path, "old_string": "a", "new_string": "b"}) is None


def test_catalog_fact_edits_need_confirmation_but_descriptions_do_not(guard):
    path = "frontend/src/data/programs/computer_engineering.json"
    title_edit = {"file_path": path, "old_string": '    "title": "Old",\n', "new_string": '    "title": "New",\n'}
    desc_edit = {"file_path": path, "old_string": '    "description": "a",\n', "new_string": '    "description": "b",\n'}
    assert guard.review_edit("Edit", title_edit)[0] == "deny"
    assert guard.review_edit("Edit", desc_edit) is None


def test_weakening_test_assertions_needs_confirmation(guard):
    path = "frontend/src/core/__tests__/layout.test.ts"
    weaker = {"file_path": path, "old_string": "expect(a).toBe(1);\nexpect(b).toBe(2);",
              "new_string": "expect(a).toBe(1);"}
    stronger = {"file_path": path, "old_string": "expect(a).toBe(1);",
                "new_string": "expect(a).toBe(1);\nexpect(b).toBe(2);"}
    assert guard.review_edit("Edit", weaker)[0] == "deny"
    assert guard.review_edit("Edit", stronger) is None


def test_existing_migrations_are_immutable_but_new_ones_are_free(guard):
    existing = next((REPO_ROOT / "backend" / "alembic" / "versions").glob("0001*.py"))
    rel_existing = existing.relative_to(REPO_ROOT).as_posix()
    assert guard.review_edit("Edit", {"file_path": rel_existing, "old_string": "a", "new_string": "b"})[0] == "deny"
    new = {"file_path": "backend/alembic/versions/0999_new.py", "content": "revision = '0999'"}
    assert guard.review_edit("Write", new) is None


def test_stop_gate_never_loops(guard):
    assert guard.stop_gate({"stop_hook_active": True}) is None


# --------------------------------------------------------------------------- wiring


def test_ci_runs_invariants_against_the_pr_base():
    ci = (REPO_ROOT / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8")
    assert "python scripts/check_invariants.py" in ci
    assert "fetch-depth: 0" in ci
    assert "CF_BASE_REF: origin/${{ github.base_ref || 'dev' }}" in ci


def test_pre_commit_runs_invariants():
    hook = (REPO_ROOT / ".husky" / "pre-commit").read_text(encoding="utf-8")
    assert "python scripts/check_invariants.py" in hook


def test_claude_hooks_are_wired_for_every_event():
    settings = json.loads((REPO_ROOT / ".claude" / "settings.json").read_text(encoding="utf-8"))
    hooks = settings["hooks"]
    commands = json.dumps(hooks)
    for mode in ("session-start", "bash", "edit", "post-edit", "stop"):
        assert f'cf_guard.py\\" {mode}' in commands, mode
    assert any("Bash" in h["matcher"] for h in hooks["PreToolUse"])
    assert any("Edit" in h["matcher"] for h in hooks["PreToolUse"])
    assert "Bash(git commit --no-verify:*)" in settings["permissions"]["deny"]


def test_ruff_targets_ci_python_version():
    assert 'target-version = "py311"' in (REPO_ROOT / "ruff.toml").read_text(encoding="utf-8")


def test_hooks_never_prompt_so_sessions_can_run_unattended():
    hook_source = (REPO_ROOT / ".claude" / "hooks" / "cf_guard.py").read_text(encoding="utf-8")
    assert '"ask"' not in hook_source
