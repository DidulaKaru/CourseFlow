"""Tests for faculty admin authentication and RBAC (CF-201)."""

from collections.abc import Generator
from datetime import UTC, datetime, timedelta

import jwt
import pytest
from app.api.deps import AdminUser, CurrentUser, StaffUser
from app.core.config import settings
from app.core.security import (
    create_access_token,
    get_staff_accounts,
    hash_password,
    verify_password,
)
from app.main import app
from fastapi import APIRouter, FastAPI
from fastapi.testclient import TestClient

SECRET = "test-secret-key-that-is-long-enough-for-hs256"
ADMIN_PASSWORD = "admin-correct-horse"
REVIEWER_PASSWORD = "reviewer-battery-staple"


@pytest.fixture(scope="module")
def admin_hash() -> str:
    """Hash once per module; bcrypt is intentionally slow."""
    return hash_password(ADMIN_PASSWORD)


@pytest.fixture(scope="module")
def reviewer_hash() -> str:
    return hash_password(REVIEWER_PASSWORD)


@pytest.fixture(autouse=True)
def configured_accounts(monkeypatch: pytest.MonkeyPatch, admin_hash: str, reviewer_hash: str) -> None:
    """Pin auth settings so tests never depend on the developer's .env."""
    monkeypatch.setattr(settings, "ENVIRONMENT", "development")
    monkeypatch.setattr(settings, "SECRET_KEY", SECRET)
    monkeypatch.setattr(settings, "ALGORITHM", "HS256")
    monkeypatch.setattr(settings, "ACCESS_TOKEN_EXPIRE_MINUTES", 60)
    monkeypatch.setattr(settings, "ADMIN_USERNAME", "admin")
    monkeypatch.setattr(settings, "ADMIN_PASSWORD_HASH", admin_hash)
    monkeypatch.setattr(settings, "REVIEWER_USERNAME", "reviewer")
    monkeypatch.setattr(settings, "REVIEWER_PASSWORD_HASH", reviewer_hash)


@pytest.fixture
def api() -> Generator[TestClient, None, None]:
    with TestClient(app) as test_client:
        yield test_client


def login(api: TestClient, username: str = "admin", password: str = ADMIN_PASSWORD):
    return api.post("/api/v1/auth/login", json={"username": username, "password": password})


def bearer(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def forge(claims: dict, key: str = SECRET, algorithm: str = "HS256") -> str:
    """Sign arbitrary claims, defaulting to a valid-looking admin access token."""
    now = datetime.now(UTC)
    base = {"sub": "admin", "role": "ADMIN", "type": "access", "iat": now, "exp": now + timedelta(minutes=5)}
    return jwt.encode({**base, **claims}, key, algorithm=algorithm)


# ==========================================
# Password hashing
# ==========================================


def test_hash_is_salted_and_verifies():
    first, second = hash_password("s3cret-pass"), hash_password("s3cret-pass")
    assert first != second
    assert first != "s3cret-pass"
    assert verify_password("s3cret-pass", first)
    assert verify_password("s3cret-pass", second)
    assert not verify_password("wrong", first)


def test_verify_password_never_raises_on_bad_input():
    assert not verify_password("x", "")
    assert not verify_password("x", "not-a-bcrypt-hash")
    assert not verify_password("x" * 100, hash_password("x"))


def test_hash_password_rejects_bytes_bcrypt_would_truncate():
    with pytest.raises(ValueError):
        hash_password("x" * 73)


# ==========================================
# Login
# ==========================================


def test_login_returns_bearer_token_and_role(api: TestClient):
    response = login(api)
    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-store"

    body = response.json()
    assert body["tokenType"] == "bearer"
    assert body["expiresIn"] == 60 * 60
    assert body["user"]["username"] == "admin"
    assert body["user"]["role"] == "ADMIN"
    assert "courses:write" in body["user"]["permissions"]

    claims = jwt.decode(body["accessToken"], SECRET, algorithms=["HS256"])
    assert claims["sub"] == "admin"
    assert claims["exp"] - claims["iat"] == 60 * 60


def test_login_works_on_unversioned_and_versioned_prefixes(api: TestClient):
    for prefix in ("/api", "/api/v1"):
        response = api.post(f"{prefix}/auth/login", json={"username": "admin", "password": ADMIN_PASSWORD})
        assert response.status_code == 200


def test_login_reviewer_gets_reviewer_role(api: TestClient):
    body = login(api, "reviewer", REVIEWER_PASSWORD).json()
    assert body["user"]["role"] == "FACULTY_REVIEWER"
    assert "courses:write" not in body["user"]["permissions"]


def test_login_failures_are_indistinguishable(api: TestClient):
    wrong_password = login(api, "admin", "nope")
    unknown_user = login(api, "ghost", ADMIN_PASSWORD)
    for response in (wrong_password, unknown_user):
        assert response.status_code == 401
        assert response.headers["www-authenticate"] == "Bearer"
    assert wrong_password.json() == unknown_user.json()


def test_login_disabled_when_account_has_no_hash(api: TestClient, monkeypatch: pytest.MonkeyPatch):
    """No default credentials: an unconfigured account cannot log in, even with an empty password."""
    monkeypatch.setattr(settings, "ADMIN_PASSWORD_HASH", "")
    assert login(api, "admin", ADMIN_PASSWORD).status_code == 401
    assert get_staff_accounts().get("admin") is None


def test_login_rejects_malformed_bodies(api: TestClient):
    assert api.post("/api/v1/auth/login", json={}).status_code == 422
    assert api.post("/api/v1/auth/login", json={"username": "admin", "password": ""}).status_code == 422
    assert api.post("/api/v1/auth/login", json={"username": "admin", "password": "x" * 129}).status_code == 422


# ==========================================
# Session verification (/me) and token hardening
# ==========================================


def test_me_returns_identity_and_permissions(api: TestClient):
    token = login(api).json()["accessToken"]
    response = api.get("/api/v1/auth/me", headers=bearer(token))
    assert response.status_code == 200
    body = response.json()
    assert body["username"] == "admin"
    assert body["role"] == "ADMIN"
    assert "prerequisites:write" in body["permissions"]


def test_missing_credentials_return_401_with_challenge(api: TestClient):
    response = api.get("/api/v1/auth/me")
    assert response.status_code == 401
    assert response.headers["www-authenticate"] == "Bearer"


def test_non_bearer_scheme_is_rejected(api: TestClient):
    assert api.get("/api/v1/auth/me", headers={"Authorization": "Basic YWRtaW46YWRtaW4="}).status_code == 401


@pytest.mark.parametrize(
    "token_factory",
    [
        pytest.param(lambda: "not.a.jwt", id="garbage"),
        pytest.param(lambda: forge({"exp": datetime.now(UTC) - timedelta(seconds=1)}), id="expired"),
        pytest.param(lambda: forge({}, key="some-other-signing-key-of-sufficient-length"), id="wrong-signature"),
        pytest.param(lambda: forge({"type": "refresh"}), id="wrong-token-type"),
        pytest.param(lambda: forge({"sub": "ghost"}), id="unknown-subject"),
        pytest.param(
            lambda: jwt.encode({"sub": "admin", "type": "access"}, SECRET, algorithm="HS256"),
            id="missing-exp",
        ),
        pytest.param(
            lambda: jwt.encode(
                {"sub": "admin", "type": "access", "exp": datetime.now(UTC) + timedelta(minutes=5)},
                key=None,
                algorithm="none",
            ),
            id="alg-none",
        ),
    ],
)
def test_invalid_tokens_are_rejected(api: TestClient, token_factory):
    response = api.get("/api/v1/auth/me", headers=bearer(token_factory()))
    assert response.status_code == 401
    assert response.headers["www-authenticate"] == "Bearer"


def test_role_claim_in_token_is_ignored(api: TestClient):
    """Escalating the role inside a token (even a validly signed one) must not grant privileges."""
    token = forge({"sub": "reviewer", "role": "ADMIN"})
    assert api.get("/api/v1/auth/me", headers=bearer(token)).json()["role"] == "FACULTY_REVIEWER"


def test_removing_an_account_revokes_its_live_tokens(api: TestClient, monkeypatch: pytest.MonkeyPatch):
    token = login(api).json()["accessToken"]
    monkeypatch.setattr(settings, "ADMIN_PASSWORD_HASH", "")
    assert api.get("/api/v1/auth/me", headers=bearer(token)).status_code == 401


# ==========================================
# Refresh
# ==========================================


def test_refresh_issues_a_new_working_token(api: TestClient):
    original = login(api).json()["accessToken"]
    response = api.post("/api/v1/auth/refresh", headers=bearer(original))
    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-store"
    refreshed = response.json()
    assert refreshed["user"]["username"] == "admin"
    assert api.get("/api/v1/auth/me", headers=bearer(refreshed["accessToken"])).status_code == 200


def test_refresh_requires_a_valid_token(api: TestClient):
    assert api.post("/api/v1/auth/refresh").status_code == 401
    expired = forge({"exp": datetime.now(UTC) - timedelta(seconds=1)})
    assert api.post("/api/v1/auth/refresh", headers=bearer(expired)).status_code == 401


# ==========================================
# RBAC dependencies (used by CF-202 / CF-203 / CF-204 routes)
# ==========================================


@pytest.fixture
def guarded() -> Generator[TestClient, None, None]:
    """A throwaway app exercising the real guard dependencies."""
    router = APIRouter()

    @router.post("/admin-only")
    def admin_only(user: AdminUser) -> dict[str, str]:
        return {"user": user.username}

    @router.post("/staff")
    def staff(user: StaffUser) -> dict[str, str]:
        return {"user": user.username}

    @router.get("/any-session")
    def any_session(user: CurrentUser) -> dict[str, str]:
        return {"user": user.username}

    guarded_app = FastAPI()
    guarded_app.include_router(router)
    with TestClient(guarded_app) as test_client:
        yield test_client


@pytest.mark.parametrize("path", ["/admin-only", "/staff"])
def test_guarded_routes_reject_anonymous_requests(guarded: TestClient, path: str):
    assert guarded.post(path).status_code == 401


def test_admin_can_reach_every_guarded_route(guarded: TestClient):
    account = get_staff_accounts()["admin"]
    headers = bearer(create_access_token(account)[0])
    assert guarded.post("/admin-only", headers=headers).status_code == 200
    assert guarded.post("/staff", headers=headers).status_code == 200


def test_reviewer_is_forbidden_from_admin_only_routes(guarded: TestClient):
    account = get_staff_accounts()["reviewer"]
    headers = bearer(create_access_token(account)[0])
    assert guarded.post("/admin-only", headers=headers).status_code == 403
    assert guarded.post("/staff", headers=headers).status_code == 200
    assert guarded.get("/any-session", headers=headers).status_code == 200


# ==========================================
# Configuration guards
# ==========================================


def test_default_secret_key_is_refused_in_production(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(settings, "ENVIRONMENT", "production")
    monkeypatch.setattr(settings, "SECRET_KEY", "dev-secret-key-change-in-production")
    with pytest.raises(RuntimeError):
        create_access_token(get_staff_accounts()["admin"])


def test_default_secret_key_is_refused_on_vercel_even_if_environment_is_unset(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("VERCEL", "1")
    monkeypatch.setattr(settings, "SECRET_KEY", "dev-secret-key-change-in-production")
    with pytest.raises(RuntimeError):
        create_access_token(get_staff_accounts()["admin"])


def test_custom_secret_key_is_accepted_in_production(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(settings, "ENVIRONMENT", "production")
    token, _ = create_access_token(get_staff_accounts()["admin"])
    assert jwt.decode(token, SECRET, algorithms=["HS256"])["sub"] == "admin"


# ==========================================
# ADR-001: student routes stay public
# ==========================================


def test_student_routes_remain_public(api: TestClient):
    assert api.get("/api/programs").status_code == 200
    assert api.get("/api/v1/programs").status_code == 200
    assert api.get("/api/v1/programs/computer-eng").status_code == 200
    validation = api.post(
        "/api/v1/plans/validate",
        json={"programId": "computer-eng", "selectedElectiveIds": [], "completedCourseIds": []},
    )
    assert validation.status_code == 200


def test_openapi_documents_auth_routes_and_bearer_scheme(api: TestClient):
    schema = api.get("/openapi.json").json()
    for path in ("/api/v1/auth/login", "/api/v1/auth/refresh", "/api/v1/auth/me"):
        assert path in schema["paths"]
    assert "HTTPBearer" in schema["components"]["securitySchemes"]
    assert "accessToken" in schema["components"]["schemas"]["TokenResponse"]["properties"]
