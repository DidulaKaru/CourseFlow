"""Authentication schemas for faculty admin sessions (CF-201).

Students never authenticate (ADR-001); these contracts only cover faculty staff.
"""

from enum import Enum
from typing import Literal

from pydantic import Field

from app.schemas.curriculum import CamelModel


class UserRole(str, Enum):
    """Roles available to authenticated faculty staff."""

    ADMIN = "ADMIN"
    FACULTY_REVIEWER = "FACULTY_REVIEWER"


# Permission tags the frontend can use to gate admin controls. The backend still
# enforces access through role dependencies; these tags are informational.
ROLE_PERMISSIONS: dict[UserRole, list[str]] = {
    UserRole.ADMIN: [
        "courses:write",
        "prerequisites:write",
        "extraction:upload",
        "extraction:review",
        "extraction:commit",
    ],
    UserRole.FACULTY_REVIEWER: [
        "extraction:upload",
        "extraction:review",
        "extraction:commit",
    ],
}


class LoginRequest(CamelModel):
    """Credentials submitted to POST /auth/login."""

    username: str = Field(..., min_length=1, max_length=64)
    password: str = Field(..., min_length=1, max_length=128)


class AuthenticatedUser(CamelModel):
    """Identity and permissions of the active session."""

    username: str
    role: UserRole
    permissions: list[str] = Field(default_factory=list)


class TokenResponse(CamelModel):
    """JWT bearer token issued on login or refresh."""

    access_token: str
    token_type: Literal["bearer"] = "bearer"
    expires_in: int = Field(..., description="Token lifetime in seconds")
    user: AuthenticatedUser
