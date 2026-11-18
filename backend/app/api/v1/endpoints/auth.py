"""Faculty admin authentication endpoints (CF-201)."""

from fastapi import APIRouter, HTTPException, Response, status

from app.api.deps import CurrentUser
from app.core.security import (
    StaffAccount,
    authenticate_staff,
    create_access_token,
    get_staff_accounts,
)
from app.schemas.auth import AuthenticatedUser, LoginRequest, TokenResponse

router = APIRouter()


def _issue_token(account: StaffAccount, response: Response) -> TokenResponse:
    token, expires_in = create_access_token(account)
    # Credentials must never be cached by browsers or intermediaries.
    response.headers["Cache-Control"] = "no-store"
    return TokenResponse(access_token=token, expires_in=expires_in, user=account.to_user())


@router.post(
    "/login",
    response_model=TokenResponse,
    summary="Faculty Login",
    description="Exchange faculty credentials for a JWT bearer token.",
)
def login(payload: LoginRequest, response: Response) -> TokenResponse:
    """Authenticate a faculty account and issue an access token."""
    account = authenticate_staff(payload.username, payload.password)
    if account is None:
        # One message for unknown user, wrong password and disabled account.
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return _issue_token(account, response)


@router.post(
    "/refresh",
    response_model=TokenResponse,
    summary="Refresh Session",
    description="Exchange a still-valid bearer token for a fresh one with a new expiry.",
)
def refresh(response: Response, user: CurrentUser) -> TokenResponse:
    """Extend an active session. Expired tokens must log in again."""
    account = get_staff_accounts()[user.username]
    return _issue_token(account, response)


@router.get(
    "/me",
    response_model=AuthenticatedUser,
    summary="Current Session",
    description="Return the identity and permissions of the authenticated faculty user.",
)
def me(user: CurrentUser) -> AuthenticatedUser:
    """Return the active session identity."""
    return user
