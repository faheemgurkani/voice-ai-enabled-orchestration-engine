from __future__ import annotations

import re

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.db.database import Database, get_db

router = APIRouter(prefix="/api/waitlist", tags=["waitlist"])

# Deliberately not pydantic's EmailStr — that needs the email-validator extra,
# which isn't otherwise a dependency here. A loose regex is enough for a lead
# capture field with no account behind it: worst case is a bounced email, not
# a security issue.
_EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")


class WaitlistSignupBody(BaseModel):
    email: str = Field(..., max_length=254)
    # Where the field was on — "demo" | "clusters" — purely informational.
    source: str | None = Field(default=None, max_length=40)


@router.post("")
async def join_waitlist(
    body: WaitlistSignupBody,
    db: Database = Depends(get_db),
) -> dict:
    """No-auth lead capture: one email field, no password, no account.

    This is deliberately separate from Supabase Auth signup on /login — that
    creates a real staff account; this just records an email for the early
    access waitlist. Same underlying motive (a lead), different table
    (waitlist_signups, not auth.users/profiles) and no login ever results.
    """
    email = body.email.strip().lower()
    if not _EMAIL_RE.match(email):
        raise HTTPException(status_code=400, detail="Enter a valid email address")

    db.add_waitlist_signup(email, source=body.source)
    return {"ok": True}
