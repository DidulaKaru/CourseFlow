"""Degree Program curriculum metadata endpoints."""

import json
import logging
import re
from pathlib import Path

from fastapi import APIRouter, HTTPException, status

from app.core.config import settings
from app.schemas.curriculum import (
    DegreeProgram,
    DegreeProgramSummary,
)

logger = logging.getLogger(__name__)
SAFE_ID_REGEX = re.compile(r"^[a-zA-Z0-9_-]+$")

PROGRAM_FILE_MAP: dict[str, str] = {
    "computer-eng": "computer_engineering.json",
    "computer_engineering": "computer_engineering.json",
    "electrical-eng": "electrical_engineering.json",
    "electrical_engineering": "electrical_engineering.json",
}

router = APIRouter()


def load_program_by_id(program_id: str) -> DegreeProgram | None:
    """Load a degree program by ID from verified JSON catalog files."""
    if not SAFE_ID_REGEX.match(program_id):
        return None

    filename_variants = [
        PROGRAM_FILE_MAP.get(program_id),
        f"{program_id}.json",
        f"{program_id.replace('-', '_')}.json",
        f"{program_id.replace('_', '-')}.json",
    ]

    search_dirs = [
        settings.DATA_PROGRAMS_DIR,
        Path(__file__).resolve().parent.parent.parent.parent / "data" / "programs",
    ]

    for variant in filename_variants:
        if not variant:
            continue
        for base_dir in search_dirs:
            target_path = base_dir / variant
            if target_path.exists():
                try:
                    with open(target_path, encoding="utf-8") as f:
                        prog = DegreeProgram.model_validate(json.load(f))
                        if prog.id == program_id or variant == PROGRAM_FILE_MAP.get(program_id):
                            return prog
                except (OSError, json.JSONDecodeError, ValueError) as e:
                    logger.warning(f"Failed to load program {program_id} from {target_path}: {e}")
                    continue

    for base_dir in search_dirs:
        if base_dir.exists():
            for target_path in base_dir.glob("*.json"):
                try:
                    with open(target_path, encoding="utf-8") as f:
                        prog = DegreeProgram.model_validate(json.load(f))
                        if prog.id == program_id:
                            return prog
                except (OSError, json.JSONDecodeError, ValueError):
                    continue

    return None


@router.get(
    "",
    response_model=list[DegreeProgramSummary],
    summary="List Degree Programs",
    description="Retrieve high-level summaries for all available engineering degree programs.",
)
def list_programs() -> list[DegreeProgramSummary]:
    """Retrieve all degree program summaries from verified disk programs."""
    summaries: list[DegreeProgramSummary] = []
    seen_ids: set[str] = set()

    search_dirs = [
        settings.DATA_PROGRAMS_DIR,
        Path(__file__).resolve().parent.parent.parent.parent / "data" / "programs",
    ]

    for programs_dir in search_dirs:
        if programs_dir.exists():
            for path in sorted(programs_dir.glob("*.json")):
                try:
                    with open(path, encoding="utf-8") as f:
                        prog = DegreeProgram.model_validate(json.load(f))
                        if prog.id not in seen_ids:
                            seen_ids.add(prog.id)
                            summaries.append(
                                DegreeProgramSummary(
                                    id=prog.id,
                                    name=prog.name,
                                    department=prog.department,
                                    total_credits_required=prog.total_credits_required,
                                    min_credits_per_semester=prog.min_credits_per_semester,
                                    max_credits_per_semester=prog.max_credits_per_semester,
                                    semesters_count=prog.semesters_count,
                                )
                            )
                except (OSError, json.JSONDecodeError, ValueError) as e:
                    logger.warning(f"Failed to parse program file {path}: {e}")

    return summaries


@router.get(
    "/{program_id}",
    response_model=DegreeProgram,
    summary="Get Degree Program by ID",
    description="Retrieve the complete 8-semester curriculum dependency graph for a specific program.",
)
def get_program(program_id: str) -> DegreeProgram:
    """Retrieve full curriculum graph by program ID."""
    program = load_program_by_id(program_id)
    if not program:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Degree program '{program_id}' was not found.",
        )
    return program
