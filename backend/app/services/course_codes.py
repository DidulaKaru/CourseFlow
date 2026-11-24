"""Finding and normalizing course codes in document text (CF-233, CF-234)."""

import re

from app.schemas.curriculum import COURSE_CODE_PATTERN

_CODE = re.compile(COURSE_CODE_PATTERN)
_COMPACT = COURSE_CODE_PATTERN.strip("^$")
# The catalog pattern found inside running text. Documents often print "EE 2201"; only capitals may be separated
# from their digits, or "earn 100 credits" would read as a code.
CODE_IN_TEXT = re.compile(rf"\b(?:{_COMPACT.replace('[0-9]', '[ ]?[0-9]', 1)}|(?i:{_COMPACT}))\b")


def normalize_course_code(code: str) -> str:
    """Upper-case a code and remove the whitespace documents print inside it."""
    return "".join(code.split()).upper()


def is_course_code(code: str) -> bool:
    """Whether the catalog accepts this (normalized) code."""
    return _CODE.fullmatch(code) is not None


def find_course_codes(text: str) -> list[str]:
    """Normalized course codes mentioned in text, in first-seen order."""
    return list(dict.fromkeys(normalize_course_code(code) for code in CODE_IN_TEXT.findall(text)))
