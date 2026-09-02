"""Staff/dashboard identity.

Gawah runs two identity planes. Witnesses are anonymous forever — their
reference code is a capability, not a login — so nothing in this module touches
the voice pipeline or the public ref-code lookup. It only answers "who is this
dashboard user", for the routes that expose full statement text.

Access tokens are issued by Supabase Auth and signed ES256. We verify them
locally against the project's JWKS rather than calling the Auth server per
request: no network hop in the hot path, and no shared secret in this process
that could mint staff tokens if it leaked.
"""

from __future__ import annotations

import threading
import time
from typing import Any, Dict, Optional

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel

from app.config import Settings, get_settings


class AuthUser(BaseModel):
    """The authenticated dashboard user, derived purely from verified claims."""

    id: str
    email: Optional[str] = None
    role: str = "authenticated"
    token: Optional[str] = None
    claims: Dict[str, Any] = {}

    @property
    def workspace_id(self) -> str:
        """Phase 1: a personal workspace per account.

        Phase 2 replaces this with an org lookup. Keeping it behind a property
        means routes read `user.workspace_id` today and keep compiling when the
        boundary widens to real NGO organisations.
        """
        return self.id


class _JWKSCache:
    """Process-local JWKS cache with a rotation-aware refresh.

    Supabase caches the endpoint at the edge for ~10 minutes and rotates keys
    without downtime, so a `kid` we have never seen is expected during a
    rotation window rather than an error. One forced refetch resolves it.
    """

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._client: Optional[jwt.PyJWKClient] = None
        self._url: Optional[str] = None

    def client(self, url: str, lifespan: int) -> jwt.PyJWKClient:
        with self._lock:
            if self._client is None or self._url != url:
                self._client = jwt.PyJWKClient(
                    url, cache_keys=True, lifespan=lifespan, max_cached_keys=8
                )
                self._url = url
            return self._client

    def invalidate(self) -> None:
        with self._lock:
            self._client = None
            self._url = None


_jwks = _JWKSCache()

# auto_error=False so unauthenticated callers reach our own 401 with a
# WWW-Authenticate header, and so optional-auth routes can see "no token".
_bearer = HTTPBearer(auto_error=False)


def _unauthorized(detail: str) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=detail,
        headers={"WWW-Authenticate": "Bearer"},
    )


def dev_bypass_active(settings: Settings) -> bool:
    """Dev bypass, hard-disabled outside development.

    The flag alone is not enough: a stray DEV_AUTH_BYPASS=true in a production
    environment would silently open every gated route, so the environment must
    also not be production.
    """
    return settings.dev_auth_bypass and settings.app_env.lower() != "production"


def _dev_user(settings: Settings) -> AuthUser:
    return AuthUser(
        id=settings.dev_user_id,
        email=settings.dev_user_email,
        role="authenticated",
        claims={"sub": settings.dev_user_id, "dev_bypass": True},
    )


def _decode(token: str, settings: Settings, *, force_refresh: bool = False) -> Dict[str, Any]:
    if force_refresh:
        _jwks.invalidate()
    client = _jwks.client(settings.jwks_url, settings.jwks_cache_seconds)
    signing_key = client.get_signing_key_from_jwt(token)
    return jwt.decode(
        token,
        signing_key.key,
        algorithms=["ES256", "RS256"],
        audience=settings.supabase_jwt_audience,
        issuer=f"{settings.supabase_url.rstrip('/')}/auth/v1",
        options={"require": ["exp", "sub"]},
    )


def _verify(token: str, settings: Settings) -> AuthUser:
    try:
        claims = _decode(token, settings)
    except jwt.PyJWTError:
        # A rotated signing key looks exactly like a bad token until we refetch.
        try:
            claims = _decode(token, settings, force_refresh=True)
        except jwt.ExpiredSignatureError:
            raise _unauthorized("Session expired") from None
        except jwt.PyJWTError:
            raise _unauthorized("Invalid session token") from None
    except Exception:  # noqa: BLE001 — JWKS endpoint unreachable, not a bad token
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Unable to verify session right now",
        ) from None

    sub = claims.get("sub")
    if not sub:
        raise _unauthorized("Token is missing a subject")

    return AuthUser(
        id=str(sub),
        email=claims.get("email"),
        role=str(claims.get("role") or "authenticated"),
        token=token,
        claims=claims,
    )


async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(_bearer),
    settings: Settings = Depends(get_settings),
) -> AuthUser:
    """Require a valid dashboard session. Use on every staff-only route."""
    if credentials is None or not credentials.credentials:
        if dev_bypass_active(settings):
            return _dev_user(settings)
        raise _unauthorized("Not authenticated")

    if not settings.auth_enabled:
        # No Supabase project configured. Refuse rather than wave the token
        # through — a route that looks gated must never silently be open.
        if dev_bypass_active(settings):
            return _dev_user(settings)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Authentication is not configured on this deployment",
        )

    return _verify(credentials.credentials, settings)


async def get_optional_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(_bearer),
    settings: Settings = Depends(get_settings),
) -> Optional[AuthUser]:
    """Identify the caller when a token is present, without requiring one.

    Used by the ref-code lookup, where an anonymous witness gets the limited
    payload and a signed-in staff member may request the full statement.
    """
    if credentials is None or not credentials.credentials:
        return _dev_user(settings) if dev_bypass_active(settings) else None
    if not settings.auth_enabled:
        return _dev_user(settings) if dev_bypass_active(settings) else None
    try:
        return _verify(credentials.credentials, settings)
    except HTTPException:
        # A malformed token on an optional route means "anonymous", not "error".
        return None
