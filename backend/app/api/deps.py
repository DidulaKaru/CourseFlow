"""Shared FastAPI dependencies, including faculty authentication guards (CF-201).

Only administrative routes depend on these guards. Student routes
(``/programs``, ``/plans``) must stay public per ADR-001.
"""

from collections.abc import Callable
from typing import Annotated

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import decode_access_token, get_staff_accounts
from app.schemas.auth import AuthenticatedUser, UserRole

# auto_error=False so a missing header yields a proper 401 (not the scheme's default).
bearer_scheme = HTTPBearer(auto_error=False, description="JWT issued by POST /api/v1/auth/login")


def _unauthorized(detail: str) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=detail,
        headers={"WWW-Authenticate": "Bearer"},
    )


def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
) -> AuthenticatedUser:
    """Resolve the session from a Bearer token; 401 if missing, invalid, expired or revoked."""
    if credentials is None:
        raise _unauthorized("Not authenticated.")
    try:
        claims = decode_access_token(credentials.credentials)
    except jwt.InvalidTokenError:
        raise _unauthorized("Invalid or expired token.") from None

    # The registry is authoritative: removing an account revokes its live tokens,
    # and the role always comes from configuration rather than the token.
    account = get_staff_accounts().get(claims["sub"])
    if account is None:
        raise _unauthorized("Invalid or expired token.")
    return account.to_user()


def require_roles(*roles: UserRole) -> Callable[[AuthenticatedUser], AuthenticatedUser]:
    """Build a dependency that only admits the given roles (403 otherwise)."""
    allowed = frozenset(roles)

    def dependency(user: Annotated[AuthenticatedUser, Depends(get_current_user)]) -> AuthenticatedUser:
        if user.role not in allowed:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Your role does not permit this action.",
            )
        return user

    return dependency


# Course and prerequisite mutation routes (CF-202, CF-203).
get_current_admin_user = require_roles(UserRole.ADMIN)
# Extraction upload, review and commit routes (CF-204).
get_current_staff_user = require_roles(UserRole.ADMIN, UserRole.FACULTY_REVIEWER)

# Annotated aliases so route signatures stay short: ``def handler(user: AdminUser)``.
CurrentUser = Annotated[AuthenticatedUser, Depends(get_current_user)]
AdminUser = Annotated[AuthenticatedUser, Depends(get_current_admin_user)]
StaffUser = Annotated[AuthenticatedUser, Depends(get_current_staff_user)]

# Request-scoped SQLAlchemy session (closed automatically after the response).
DbSession = Annotated[Session, Depends(get_db)]
