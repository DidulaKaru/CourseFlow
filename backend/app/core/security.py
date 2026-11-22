"""Password hashing, account registry and JWT helpers for faculty admin auth (CF-201).

Stateless by design: sessions are signed JWTs, accounts come from environment
configuration, and nothing here touches the database, so student routes stay
unaffected (ADR-001).
"""

import os
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from functools import cache
from typing import Any

import bcrypt
import jwt

from app.core.config import Settings, settings
from app.schemas.auth import ROLE_PERMISSIONS, AuthenticatedUser, UserRole

ACCESS_TOKEN_TYPE = "access"
# bcrypt only reads the first 72 bytes of a password; longer inputs are rejected
# rather than silently truncated.
BCRYPT_MAX_PASSWORD_BYTES = 72


# ==========================================
# 1. Password hashing
# ==========================================


def hash_password(password: str) -> str:
    """Return a salted bcrypt hash for the given plaintext password."""
    raw = password.encode("utf-8")
    if len(raw) > BCRYPT_MAX_PASSWORD_BYTES:
        raise ValueError(f"Password must be at most {BCRYPT_MAX_PASSWORD_BYTES} bytes when UTF-8 encoded.")
    return bcrypt.hashpw(raw, bcrypt.gensalt()).decode("ascii")


def verify_password(password: str, password_hash: str) -> bool:
    """Check a plaintext password against a bcrypt hash; never raises on bad input."""
    raw = password.encode("utf-8")
    if not password_hash or len(raw) > BCRYPT_MAX_PASSWORD_BYTES:
        return False
    try:
        return bcrypt.checkpw(raw, password_hash.encode("utf-8"))
    except ValueError:
        # Malformed hash in configuration: treat as a failed login, not a 500.
        return False


@cache
def _timing_decoy_hash() -> str:
    """Hash verified against when a username is unknown, so response time does not reveal it."""
    return hash_password("courseflow-timing-decoy")


# ==========================================
# 2. Account registry (environment-configured)
# ==========================================


@dataclass(frozen=True)
class StaffAccount:
    """A configured faculty account."""

    username: str
    password_hash: str
    role: UserRole

    def to_user(self) -> AuthenticatedUser:
        """Project the account into the public session identity."""
        return AuthenticatedUser(
            username=self.username,
            role=self.role,
            permissions=list(ROLE_PERMISSIONS[self.role]),
        )


def get_staff_accounts() -> dict[str, StaffAccount]:
    """Build the account registry from settings; accounts without a hash are disabled."""
    candidates = (
        StaffAccount(settings.ADMIN_USERNAME, settings.ADMIN_PASSWORD_HASH, UserRole.ADMIN),
        StaffAccount(settings.REVIEWER_USERNAME, settings.REVIEWER_PASSWORD_HASH, UserRole.FACULTY_REVIEWER),
    )
    accounts: dict[str, StaffAccount] = {}
    for account in candidates:
        if account.password_hash:
            accounts.setdefault(account.username, account)
    return accounts


def authenticate_staff(username: str, password: str) -> StaffAccount | None:
    """Return the matching account when credentials are valid, otherwise None."""
    account = get_staff_accounts().get(username)
    if account is None:
        verify_password(password, _timing_decoy_hash())
        return None
    return account if verify_password(password, account.password_hash) else None


# ==========================================
# 3. JWT access tokens
# ==========================================


def _is_production_like() -> bool:
    """Mirror database.py: serverless and staging deployments count as production."""
    return os.getenv("VERCEL") == "1" or settings.ENVIRONMENT in ("production", "staging")


def _signing_key() -> str:
    """Return the JWT signing key, refusing the shipped default in production-like environments."""
    default_key = Settings.model_fields["SECRET_KEY"].default
    if _is_production_like() and settings.SECRET_KEY == default_key:
        raise RuntimeError("SECRET_KEY must be set to a unique secret before issuing or verifying tokens in production.")
    return settings.SECRET_KEY


def create_access_token(account: StaffAccount) -> tuple[str, int]:
    """Issue a signed access token. Returns (token, lifetime in seconds)."""
    lifetime = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    now = datetime.now(UTC)
    claims = {
        "sub": account.username,
        "role": account.role.value,
        "type": ACCESS_TOKEN_TYPE,
        "iat": now,
        "exp": now + lifetime,
    }
    token = jwt.encode(claims, _signing_key(), algorithm=settings.ALGORITHM)
    return token, int(lifetime.total_seconds())


def decode_access_token(token: str) -> dict[str, Any]:
    """Verify signature and expiry and return the claims.

    Raises jwt.InvalidTokenError (including ExpiredSignatureError) for any bad token.
    The algorithm is pinned to settings so tokens cannot downgrade to ``none``.
    """
    claims: dict[str, Any] = jwt.decode(
        token,
        _signing_key(),
        algorithms=[settings.ALGORITHM],
        options={"require": ["exp", "sub"]},
    )
    if claims.get("type") != ACCESS_TOKEN_TYPE:
        raise jwt.InvalidTokenError("Unexpected token type.")
    return claims
