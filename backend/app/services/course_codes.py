"""Finding and normalizing course codes in document text (CF-233, CF-234)."""

import re

from app.schemas.curriculum import COURSE_CODE_PATTERN

_CODE = re.compile(COURSE_CODE_PATTERN)
# The catalog pattern found inside running text, where codes are often printed as "EE 2201".
CODE_IN_TEXT = re.compile(r"\b" + COURSE_CODE_PATTERN.strip("^$").replace("[0-9]", r"\s?[0-9]", 1) + r"\b")


def normalize_course_code(code: str) -> str:
    """Upper-case a code and remove the whitespace documents print inside it."""
    return "".join(code.split()).upper()


def is_course_code(code: str) -> bool:
    """Whether the catalog accepts this (normalized) code."""
    return _CODE.fullmatch(code) is not None


def find_course_codes(text: str) -> list[str]:
    """Normalized course codes mentioned in text, in first-seen order."""
    return list(dict.fromkeys(normalize_course_code(code) for code in CODE_IN_TEXT.findall(text)))
