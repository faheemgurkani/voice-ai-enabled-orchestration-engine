"""Cloudflare Turnstile verification for public, unauthenticated write endpoints.

Skipped entirely (verify() returns True) until TURNSTILE_SECRET_KEY is set —
see Settings.turnstile_enabled. This keeps every caller working unchanged on
a fresh clone / local dev, and turns into a real gate the moment a real
secret key is configured in production.
"""

from __future__ import annotations

import httpx

from app.config import Settings

_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify"


async def verify_turnstile(
    token: str | None, settings: Settings, *, remoteip: str | None = None
) -> bool:
    if not settings.turnstile_enabled:
        return True
    if not token:
        return False
    data = {"secret": settings.turnstile_secret_key, "response": token}
    if remoteip:
        data["remoteip"] = remoteip
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(_VERIFY_URL, data=data)
            response.raise_for_status()
            body = response.json()
    except Exception:
        # Cloudflare unreachable: fail closed on a configured gate rather than
        # silently letting abuse traffic through.
        return False
    return bool(body.get("success"))
