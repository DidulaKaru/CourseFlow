#!/usr/bin/env python3
"""Secret scan for CourseFlow (CF-225): blocks committed JWT secrets, database passwords and API keys.

Runs from the pre-commit hook on the staged files and from CI on every tracked file, so the two cannot
disagree. It is dependency-free on purpose: the same command works on a student laptop and on a runner.

    python scripts/check_secrets.py            # every tracked file (CI)
    python scripts/check_secrets.py --staged   # files in the index (pre-commit)
    python scripts/check_secrets.py PATH...    # explicit files

A line can be allowed on purpose by ending it with ``secret-scan: allow``. Placeholders such as
``replace-with-bcrypt-hash-of-admin-password`` in ``.env.example`` are recognised and never reported.
"""

from __future__ import annotations

import argparse
import re
import subprocess
import sys
from collections.abc import Iterable, Iterator
from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MAX_FILE_BYTES = 1_000_000
ALLOW_MARKER = "secret-scan: allow"

SKIPPED_NAMES = {"package-lock.json"}
SKIPPED_PREFIXES = ("node_modules/", "frontend/dist/", "backend/data/", "frontend/src/data/")
SKIPPED_SUFFIXES = (".pdf", ".png", ".jpg", ".jpeg", ".gif", ".ico", ".woff", ".woff2", ".zip", ".lock")
# Fixed throwaway values are normal in tests; real provider tokens and private keys still count there.
TEST_PATH = re.compile(r"(^|/)(tests?|__tests__)/|\.test\.[jt]sx?$")

# Throwaway credentials of the local Docker database. They are documented in .env.example, give access to nothing
# outside a developer's own container, and docker-compose.yml falls back to them so `docker compose up` needs
# no setup (CF-121). Adding a value here is a reviewed decision, never a way to silence a real finding.
KNOWN_LOCAL_DEV_VALUES = ("courseflow5678db", "postgres")

PLACEHOLDER = re.compile(
    r"replace[-_ ]?with|change[-_ ]?me|changeit|your[-_ ]|example|placeholder|dummy|sample|not[-_ ]?a[-_ ]?secret"
    r"|^(?:\w+_)?password$"
    r"|<[^>]+>|\$\{|\$\(|\{\{|xxxx|\*{3,}|^\.\.\.$|^none$|^null$|^true$|^false$|^todo",
    re.IGNORECASE,
)


@dataclass(frozen=True)
class Rule:
    name: str
    pattern: re.Pattern[str]
    # Secret-shaped values are only reported in test files when the rule is strict.
    strict: bool = True


RULES = (
    Rule("private key block", re.compile(r"-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----")),
    Rule("AWS access key", re.compile(r"\b(?:AKIA|ASIA)[0-9A-Z]{16}\b")),
    Rule("GitHub token", re.compile(r"\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})\b")),
    Rule("Slack token", re.compile(r"\bxox[abprs]-[A-Za-z0-9-]{10,}\b")),
    Rule("OpenAI or Anthropic style API key", re.compile(r"\bsk-(?:ant-|proj-)?[A-Za-z0-9_-]{32,}\b")),
    Rule("signed JWT", re.compile(r"\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b")),
    Rule("bcrypt password hash", re.compile(r"\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}")),
    Rule("Neon database host with credentials", re.compile(r"://[^/\s:@]+:(?P<value>[^/\s@]+)@[\w.-]*neon\.tech")),
    Rule(
        "database URL with an embedded password",
        re.compile(r"\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis)(?:\+\w+)?://[^/\s:@]+:(?P<value>[^/\s@]+)@"),
        strict=False,
    ),
)

# NAME = "value" / NAME: value, where NAME says it is a secret.
ASSIGNMENT = re.compile(
    r"""(?P<name>[A-Za-z0-9_.-]*(?:secret|password|passwd|pwd|api[_-]?key|access[_-]?key|private[_-]?key|token)"""
    r"""[A-Za-z0-9_.-]*)\s*(?:=|:|=>)\s*['"]?(?P<value>[^\s'",;#)\]}]{12,})['"]?""",
    re.IGNORECASE,
)
# A value that is an identifier or a call is code, not a literal secret.
CODE_LIKE = re.compile(r"^[A-Za-z_][A-Za-z0-9_.]*(?:\(.*)?$")


@dataclass(frozen=True)
class Finding:
    path: str
    line: int
    rule: str

    def __str__(self) -> str:
        return f"{self.path}:{self.line}: possible {self.rule}"


def _is_placeholder(value: str) -> bool:
    cleaned = value.strip().strip("'\"").lower()
    if cleaned == "postgres" or any(known in cleaned for known in KNOWN_LOCAL_DEV_VALUES if known != "postgres"):
        return True
    return bool(PLACEHOLDER.search(cleaned))


def _looks_like_literal_secret(value: str) -> bool:
    """A long value mixing character classes that is neither a placeholder nor an identifier."""
    if _is_placeholder(value) or value.startswith(("$", "%", "env(", "os.")):
        return False
    if CODE_LIKE.match(value) and not any(character.isdigit() for character in value):
        return False
    classes = sum(
        any(test(character) for character in value) for test in (str.islower, str.isupper, str.isdigit)
    )
    return classes >= 2 and len(set(value)) >= 8


def scan_text(path: str, text: str) -> list[Finding]:
    """Findings in one file's text. ``path`` is repo-relative with forward slashes."""
    in_tests = bool(TEST_PATH.search(path))
    is_env_example = Path(path).name.startswith(".env") and path.endswith(".example")
    findings: list[Finding] = []
    for number, line in enumerate(text.splitlines(), start=1):
        if ALLOW_MARKER in line:
            continue
        for rule in RULES:
            match = rule.pattern.search(line)
            if not match or (in_tests and not rule.strict):
                continue
            value = match.groupdict().get("value")
            if value is not None and _is_placeholder(value):
                continue
            if is_env_example and _is_placeholder(line):
                continue
            findings.append(Finding(path, number, rule.name))
        if in_tests:
            continue
        for match in ASSIGNMENT.finditer(line):
            if _looks_like_literal_secret(match["value"]) and not is_env_example:
                findings.append(Finding(path, number, f"hardcoded secret ({match['name']})"))
            elif is_env_example and _looks_like_literal_secret(match["value"]):
                findings.append(Finding(path, number, f"real-looking value in .env.example ({match['name']})"))
    return findings


def _git(*args: str) -> list[str]:
    output = subprocess.run(
        ["git", *args], cwd=ROOT, capture_output=True, check=True, text=True, encoding="utf-8"
    ).stdout
    return [line for line in output.splitlines() if line]


def _skipped(path: str) -> bool:
    return (
        Path(path).name in SKIPPED_NAMES
        or path.startswith(SKIPPED_PREFIXES)
        or path.lower().endswith(SKIPPED_SUFFIXES)
    )


def iter_findings(paths: Iterable[str]) -> Iterator[Finding]:
    for path in paths:
        full = ROOT / path
        if _skipped(path) or not full.is_file() or full.stat().st_size > MAX_FILE_BYTES:
            continue
        try:
            text = full.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            continue  # Binary file.
        yield from scan_text(path, text)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--staged", action="store_true", help="scan files in the git index instead of every tracked file")
    parser.add_argument("paths", nargs="*", help="explicit files to scan")
    args = parser.parse_args(argv)

    if args.paths:
        paths = [Path(p).resolve().relative_to(ROOT).as_posix() for p in args.paths]
    elif args.staged:
        paths = _git("diff", "--cached", "--name-only", "--diff-filter=ACM")
    else:
        paths = _git("ls-files")

    findings = list(iter_findings(paths))
    if not findings:
        print(f"Secret scan OK ({len(paths)} files checked)")
        return 0
    print("Possible secrets found. Remove them, load them from the environment, or add a placeholder:", file=sys.stderr)
    for finding in findings:
        print(f"  {finding}", file=sys.stderr)
    print(f"\nA false positive can be allowed with a trailing `{ALLOW_MARKER}` comment.", file=sys.stderr)
    return 1


if __name__ == "__main__":
    sys.exit(main())
