#!/usr/bin/env python3
"""Claude Code hooks for CourseFlow (CF-GUARD).

One entry point, one subcommand per hook event (wired up in .claude/settings.json):

    bash           PreToolUse(Bash)                deny or ask on dangerous or gate-bypassing commands
    edit           PreToolUse(Edit|Write|MultiEdit) protect secrets, generated files, guardrails,
                                                   applied migrations, catalog facts, test assertions
    post-edit      PostToolUse(Edit|Write|MultiEdit) run the fast invariant checks for the edited file
    stop           Stop                            run the quality gate on uncommitted work
    session-start  SessionStart                    orient the agent (branch, baseline, skills)

Decision semantics: "deny" blocks the call outright, while "ask" forces a human
confirmation even in permissive modes. That is how guardrail files stay human-owned
while remaining editable. Hooks fail open on internal errors so a broken hook never
bricks a session, and CI plus the pre-commit hook remain the final backstop.
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

REPO = Path(os.environ.get("CLAUDE_PROJECT_DIR") or Path(__file__).resolve().parents[2]).resolve()
PROTECTED_BRANCHES = ("main", "dev")

# Files that define the guardrails themselves. An agent may not quietly weaken them.
GUARDRAIL_FILES = (
    ".claude/settings.json",
    ".claude/hooks/",
    ".claude/agents/",
    ".claude/skills/",
    "scripts/check_invariants.py",
    ".husky/",
    ".github/workflows/",
    ".github/pull_request_template.md",
    "backend/tests/test_ci_workflow.py",
    "backend/tests/test_precommit_config.py",
    "backend/tests/test_guardrails.py",
    "CLAUDE.md",
    "agents.md",
    "ruff.toml",
    "frontend/.oxlintrc.json",
)
GENERATED_FILES = {
    "frontend/src/types/api.ts": "it is generated from the OpenAPI spec; run "
    "`npm --workspace=frontend run generate-types` with the backend running",
    "package-lock.json": "it is generated; change package.json and run npm install",
}
CATALOG_PREFIXES = ("frontend/src/data/programs/", "backend/data/programs/")
IMMUTABLE_CATALOG_LINE = re.compile(r'^\s*"(?:code|title|totalCredits)"\s*:.*$', re.MULTILINE)
ASSERTION = re.compile(r"\bexpect\s*\(|\bassert\b|\.toThrow|pytest\.raises|\bassert[A-Z]\w*\(")


# --------------------------------------------------------------------------- helpers


def rel(path: str) -> str:
    p = Path(path)
    if not p.is_absolute():
        p = REPO / p
    try:
        return p.resolve().relative_to(REPO).as_posix()
    except ValueError:
        return p.as_posix()


def is_test_path(path: str) -> bool:
    return "/__tests__/" in path or ".test." in path or ".spec." in path or path.startswith("backend/tests/")


def git(*args: str) -> str:
    try:
        return subprocess.run(["git", *args], cwd=REPO, capture_output=True, text=True,
                              encoding="utf-8", errors="replace", check=False).stdout
    except OSError:
        return ""


def current_branch() -> str:
    return git("rev-parse", "--abbrev-ref", "HEAD").strip()


def cache_file() -> Path:
    """Stop-gate cache lives inside the git dir: never committed, no .gitignore entry needed."""
    git_dir = git("rev-parse", "--absolute-git-dir").strip()
    return Path(git_dir or REPO / ".git") / "courseflow_stop_gate.json"


def decision(event: str, verdict: str, reason: str) -> dict:
    return {"hookSpecificOutput": {"hookEventName": event, "permissionDecision": verdict,
                                   "permissionDecisionReason": reason}}


# --------------------------------------------------------------------------- bash


def _segments(command: str) -> list[str]:
    return [s.strip() for s in re.split(r"&&|\|\||;|\||\n", command) if s.strip()]


def review_bash(command: str, branch: str) -> tuple[str, str] | None:
    """Return (verdict, reason) for a shell command, or None to defer to normal permissions."""
    cmd = command.strip()
    for seg in _segments(cmd):
        is_git = re.match(r"^(?:\w+=\S+\s+)*git\b", seg) is not None
        if is_git and re.search(r"\s--no-verify\b|\s-c\s+core\.hooksPath", seg):
            return "deny", ("Bypassing git hooks is forbidden (CLAUDE.md). Fix whatever the "
                            "pre-commit hook reports instead.")
        if re.search(r"\bHUSKY=0\b|\bHUSKY_SKIP_HOOKS\b", seg):
            return "deny", "Disabling Husky bypasses the quality gate. Fix the failing check instead."
        if is_git and re.search(r"\bgit\s+commit\b", seg):
            if re.search(r"\s-[a-zA-Z]*n[a-zA-Z]*(?:\s|$)", seg.split(" -m ")[0]):
                return "deny", "`git commit -n` skips hooks. Commit without it."
            if branch in PROTECTED_BRANCHES:
                return "deny", (f"You are on `{branch}`, which is protected. Create "
                                "`feature/cf-<id>-<desc>` or `fix/cf-<id>-<desc>` first.")
        if is_git and re.search(r"\bgit\s+push\b", seg):
            if re.search(r"\s(?:--force(?!-with-lease)|-f)(?:\s|$)", seg):
                return "deny", "Force-push is forbidden. Use --force-with-lease on your own feature branch if you must."
            positional = [t for t in seg.split("push", 1)[1].split() if not t.startswith("-")]
            refspecs = positional[1:]  # positional[0] is the remote
            targets = [r.lstrip("+").split(":")[-1].removeprefix("refs/heads/") for r in refspecs]
            targets = [branch if t == "HEAD" else t for t in targets]
            if any(t in PROTECTED_BRANCHES for t in targets) or (not refspecs and branch in PROTECTED_BRANCHES):
                return "deny", "Direct pushes to main/dev are blocked. Push a feature branch and open a PR to dev."
            if "--force-with-lease" in seg:
                return "ask", "Force-pushing (with lease) rewrites shared history. Confirm this is your own branch."
        if re.search(r"\bgit\s+(?:reset\s+--hard|clean\s+-[a-zA-Z]*f|checkout\s+--\s+\.|restore\s+(?:--\S+\s+)*\.(?:\s|$)"
                     r"|stash\s+(?:drop|clear)|branch\s+-D)", seg):
            return "ask", "This discards work irreversibly. Confirm nothing uncommitted will be lost."
        if re.search(r"\brm\s+-[a-zA-Z]*r[a-zA-Z]*f?\s+(?:\S*/)?(?:\.git|backend|frontend|scripts|docs|\.claude|~|/)(?:/?\s|/?$)", seg):
            return "deny", "Recursive delete of a top-level directory is not allowed."
        if re.search(r"\balembic\s+downgrade\b|\bDROP\s+(?:TABLE|DATABASE|SCHEMA)\b|\bTRUNCATE\b", seg, re.IGNORECASE):
            return "ask", "This destroys database state. Confirm the target is a disposable local DB."
        if re.search(r"(?:^|[\s<'\"/])\.env(?:\.(?!example)\w+)?(?=\s|$|['\"])", seg) and not re.search(r"\.env\.example", seg):
            return "ask", ".env holds secrets. Confirm you really need to read or modify it (use .env.example for docs)."
        if re.search(r"\b(?:npm|pnpm|yarn)\s+(?:install|i|add)\s+(?!-)(?:\S+)", seg) or \
           re.search(r"\bpip3?\s+install\s+(?!-r\b|-e\b|--upgrade\s+pip|-U\s+pip)\S", seg) or \
           re.search(r"\bpython\s+-m\s+pip\s+install\s+(?!-r\b|-e\b)\S", seg):
            return "ask", ("Adding a dependency is an architectural decision. Confirm it is justified and "
                           "pinned in package.json / requirements.txt.")
        writes = re.search(r"\bsed\s+-i|\s>>?\s*\S|\btee\b|\bmv\b|\brm\b|\bcp\b|Set-Content|Out-File", seg)
        if writes and any(g.rstrip("/") in seg for g in GUARDRAIL_FILES if g not in ("CLAUDE.md", "agents.md")):
            return "ask", "This shell command modifies a guardrail file. Guardrails are human-owned; confirm the change."
    return None


# --------------------------------------------------------------------------- edits


def _old_and_new(tool: str, tool_input: dict, path: Path) -> tuple[str, str]:
    if tool == "Write":
        old = path.read_text(encoding="utf-8", errors="replace") if path.exists() else ""
        return old, tool_input.get("content", "")
    if tool == "MultiEdit":
        edits = tool_input.get("edits") or []
        return ("\n".join(e.get("old_string", "") for e in edits),
                "\n".join(e.get("new_string", "") for e in edits))
    return tool_input.get("old_string", ""), tool_input.get("new_string", "")


def review_edit(tool: str, tool_input: dict) -> tuple[str, str] | None:
    raw = tool_input.get("file_path") or tool_input.get("notebook_path") or ""
    if not raw:
        return None
    r = rel(raw)
    path = REPO / r
    name = Path(r).name

    if re.fullmatch(r"\.env(?:\.(?!example$)[\w.-]+)?", name):
        return "deny", f"{r} holds secrets and must not be edited by an agent. Document new settings in .env.example."
    if r in GENERATED_FILES:
        return "deny", f"Do not hand-edit {r}: {GENERATED_FILES[r]}."
    if any(r == g or (g.endswith("/") and r.startswith(g)) for g in GUARDRAIL_FILES):
        return "ask", (f"{r} is a guardrail (rules, hooks, CI or config locks). Weakening it needs human "
                       "sign-off. Confirm the user asked for this change.")
    if r.startswith("backend/alembic/versions/") and path.exists():
        return "ask", (f"{r} is an existing migration. Applied migrations are immutable; add a new "
                       "revision chained onto the single head instead.")

    old, new = _old_and_new(tool, tool_input, path)
    is_catalog = r.startswith(CATALOG_PREFIXES) and r.endswith(".json")
    if is_catalog and set(IMMUTABLE_CATALOG_LINE.findall(old)) - set(IMMUTABLE_CATALOG_LINE.findall(new)):
        return "ask", ("This edit changes or removes an official course code, title or credit value. "
                       "Catalog facts are immutable without human approval.")
    if is_test_path(r) and old:
        before, after = len(ASSERTION.findall(old)), len(ASSERTION.findall(new))
        if after < before:
            return "ask", (f"This edit reduces assertions in {r} ({before} -> {after}). Existing tests "
                           "are contracts; never weaken one to make a change pass. Confirm it is intentional.")
    return None


# --------------------------------------------------------------------------- post-edit / stop


def run_checker(args: list[str]) -> tuple[int, str]:
    proc = subprocess.run([sys.executable, str(REPO / "scripts" / "check_invariants.py"), *args],
                          cwd=REPO, capture_output=True, text=True, encoding="utf-8", errors="replace", check=False)
    return proc.returncode, (proc.stdout + proc.stderr).strip()


def post_edit(tool_input: dict) -> dict | None:
    raw = tool_input.get("file_path") or ""
    if not raw or Path(rel(raw)).is_absolute() or not (REPO / rel(raw)).exists():
        return None  # nothing to check, or a file outside the repo (e.g. a scratch file)
    code, out = run_checker(["--for-file", str(REPO / rel(raw)), "--quiet"])
    if code == 0:
        return None
    hint = ""
    if rel(raw).startswith(CATALOG_PREFIXES):
        hint = "\nThe catalog exists in two places; mirror the change to the other copy before you finish."
    return {"decision": "block", "reason": f"Invariant check failed after editing {rel(raw)}:\n{out}{hint}"}


def _uncommitted() -> list[str]:
    files = []
    for line in git("status", "--porcelain", "--untracked-files=all").splitlines():
        if len(line) > 3:
            files.append(line[3:].split(" -> ")[-1].strip().strip('"'))
    return files


def _fingerprint(files: list[str]) -> str:
    h = hashlib.sha256(git("diff", "HEAD").encode("utf-8", "replace"))
    for f in sorted(files):
        p = REPO / f
        if p.is_file():
            h.update(f.encode())
            h.update(p.read_bytes())
    return h.hexdigest()


def _run(label: str, cmd: list[str], timeout: int = 420) -> str | None:
    exe = shutil.which(cmd[0]) or cmd[0]
    try:
        proc = subprocess.run([exe, *cmd[1:]], cwd=REPO, capture_output=True, text=True,
                              encoding="utf-8", errors="replace", timeout=timeout, check=False)
    except (OSError, subprocess.TimeoutExpired) as exc:
        return f"## {label}: could not run ({exc})"
    if proc.returncode == 0:
        return None
    tail = "\n".join((proc.stdout + proc.stderr).strip().splitlines()[-40:])
    return f"## {label} FAILED\n{tail}"


def stop_gate(payload: dict) -> dict | None:
    if payload.get("stop_hook_active") or os.environ.get("CF_SKIP_STOP_GATE") == "1":
        return None  # already continuing because of this hook; never loop
    files = _uncommitted()
    code_files = [f for f in files if f.endswith((".ts", ".tsx", ".py", ".json", ".css"))]
    if not code_files:
        return None
    fingerprint = _fingerprint(files)
    cache = cache_file()
    try:
        if json.loads(cache.read_text(encoding="utf-8")).get("passed") == fingerprint:
            return None
    except (OSError, ValueError):
        pass

    failures: list[str] = []
    code, out = run_checker([])
    if code != 0:
        failures.append(f"## Invariants FAILED\n{out}")
    if any(f.startswith("frontend/") for f in code_files):
        for label, cmd in (("Typecheck", ["npm", "run", "typecheck"]),
                           ("Lint (oxlint)", ["npm", "run", "lint"]),
                           ("Vitest (changed files)", ["npm", "test", "--", "--changed"])):
            failure = _run(label, cmd)
            if failure:
                failures.append(failure)
    if any(f.startswith("backend/") and f.endswith(".py") for f in code_files):
        for label, cmd in (("Ruff", [sys.executable, "-m", "ruff", "check", "backend/"]),
                           ("Pytest", [sys.executable, "-m", "pytest", "backend/tests", "-q", "-x", "--ff"])):
            failure = _run(label, cmd)
            if failure:
                failures.append(failure)

    if failures:
        return {"decision": "block", "reason": (
            "The quality gate fails on your uncommitted changes. Fix the root cause (do not weaken "
            "tests or checks), then finish. If a failure predates your change, say so explicitly "
            "to the user instead of hiding it.\n\n" + "\n\n".join(failures))}
    cache.write_text(json.dumps({"passed": fingerprint}), encoding="utf-8")
    return None


def session_start() -> str:
    branch = current_branch()
    lines = [f"CourseFlow session. Branch: `{branch}`."]
    if branch in PROTECTED_BRANCHES:
        lines.append(f"WARNING: `{branch}` is protected. Create a `feature/cf-<id>-<desc>` or "
                     "`fix/cf-<id>-<desc>` branch before changing anything.")
    dirty = _uncommitted()
    if dirty:
        lines.append(f"{len(dirty)} uncommitted file(s) already present. Do not assume they are yours; inspect before editing.")
    lines.append("Workflow skills: /ship-ticket (any ticket end to end), /courseflow-ui (any visual change, mobile-first), "
                 "/curriculum-data (program JSON), /contract-change (schema, AST or evaluator). "
                 "Quick invariant check: `python scripts/check_invariants.py`.")
    return "\n".join(lines)


# --------------------------------------------------------------------------- entry


def main() -> int:
    mode = sys.argv[1] if len(sys.argv) > 1 else ""
    try:
        payload = json.loads(sys.stdin.read() or "{}") if mode != "session-start" else {}
    except ValueError:
        payload = {}
    tool_input = payload.get("tool_input") or {}
    try:
        if mode == "bash":
            verdict = review_bash(tool_input.get("command", ""), current_branch())
            if verdict:
                print(json.dumps(decision("PreToolUse", *verdict)))
        elif mode == "edit":
            verdict = review_edit(payload.get("tool_name", ""), tool_input)
            if verdict:
                print(json.dumps(decision("PreToolUse", *verdict)))
        elif mode == "post-edit":
            result = post_edit(tool_input)
            if result:
                print(json.dumps(result))
        elif mode == "stop":
            result = stop_gate(payload)
            if result:
                print(json.dumps(result))
        elif mode == "session-start":
            print(session_start())
    except Exception as exc:  # noqa: BLE001 - fail open; CI and pre-commit are the backstop
        print(f"cf_guard {mode} hook error (ignored): {exc}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
