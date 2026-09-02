from __future__ import annotations

from pathlib import Path
from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse

from app.auth import AuthUser, get_current_user, get_optional_user
from app.db.database import Database, get_db
from app.models.statement import ReviewPayload
from app.services.edge_cases import handle_callback_lookup_allowed_fields
from app.services.pdf_service import PDFService, get_pdf_service

router = APIRouter(prefix="/api/statements", tags=["statements"])


@router.get("/{ref_code}")
async def get_statement(
    ref_code: str,
    full: bool = Query(
        False,
        description=(
            "Full statement text. Requires a staff session; anonymous callers "
            "always receive the limited callback payload."
        ),
    ),
    db: Database = Depends(get_db),
    user: Optional[AuthUser] = Depends(get_optional_user),
) -> Dict[str, Any]:
    """Reference-code lookup — the one route both identity planes share.

    A witness calling back knows only their ref code and gets status plus
    location. Full statement text is staff-only. `full` defaults to False so a
    caller who omits the parameter cannot accidentally be served the whole
    §161 statement.
    """
    # Reject before the lookup: answering 404-vs-401 after querying would let an
    # anonymous caller use full=true to probe which reference codes exist.
    if full and user is None:
        raise HTTPException(
            status_code=401,
            detail="Full statement text requires a staff session",
            headers={"WWW-Authenticate": "Bearer"},
        )

    stmt = db.get_statement_by_ref(ref_code)
    if stmt is None:
        raise HTTPException(status_code=404, detail="Reference code not found")

    if not full:
        # Callback-safe limited disclosure
        allowed = set(handle_callback_lookup_allowed_fields())
        data = stmt.model_dump(mode="json")
        return {k: data.get(k) for k in allowed}

    return stmt.to_api_detail()


@router.post("/{ref_code}/review")
async def review_statement(
    ref_code: str,
    payload: ReviewPayload,
    db: Database = Depends(get_db),
    user: AuthUser = Depends(get_current_user),
) -> Dict[str, Any]:
    # Attribution comes from the verified token, never the request body — a
    # review is an audit record on legal evidence and must not be forgeable.
    reviewer = user.email or user.id
    updated = db.review_statement(
        ref_code,
        reviewed_by=reviewer,
        reviewer_notes=payload.reviewer_notes,
    )
    if updated is None:
        raise HTTPException(status_code=404, detail="Reference code not found")
    db.record_kpi_event(
        "statement_reviewed", {"ref_code": ref_code, "reviewed_by": reviewer}
    )
    return updated.to_api_detail()


# NOTE: intentionally ungated. This is served straight into an <audio src>,
# which the browser will never send an Authorization header with. Closing it
# properly means moving readback audio into the private `readback-audio`
# bucket and handing out signed URLs — tracked as Phase 3, not fixable here.
@router.get("/{ref_code}/audio")
async def get_readback_audio(
    ref_code: str,
    db: Database = Depends(get_db),
):
    stmt = db.get_statement_by_ref(ref_code)
    if stmt is None:
        raise HTTPException(status_code=404, detail="Reference code not found")
    if not stmt.readback_audio_url:
        raise HTTPException(status_code=404, detail="Readback audio not available")

    path = Path(stmt.readback_audio_url)
    if not path.exists():
        # try local convention
        from app.config import get_settings

        alt = Path(get_settings().local_audio_dir) / stmt.ref_code / "readback.mp3"
        if alt.exists():
            path = alt
        else:
            raise HTTPException(status_code=404, detail="Audio file missing on disk")

    return FileResponse(path, media_type="audio/mpeg", filename=f"{ref_code}-readback.mp3")


@router.get("/{ref_code}/protection-pdf", dependencies=[Depends(get_current_user)])
async def get_protection_referral_pdf(
    ref_code: str,
    db: Database = Depends(get_db),
):
    stmt = db.get_statement_by_ref(ref_code)
    if stmt is None:
        raise HTTPException(status_code=404, detail="Reference code not found")
    if not stmt.protection_referral_generated:
        raise HTTPException(status_code=404, detail="Protection referral not generated")

    path = Path(stmt.protection_referral_url) if stmt.protection_referral_url else None
    if path is None or not path.exists():
        from app.config import get_settings

        alt = Path(get_settings().local_audio_dir) / stmt.ref_code / "protection_referral.pdf"
        if alt.exists():
            path = alt
        else:
            raise HTTPException(status_code=404, detail="Protection PDF missing on disk")

    return FileResponse(
        path,
        media_type="application/pdf",
        filename=f"{ref_code}-protection-referral.pdf",
    )


# The PDF is the full §161 statement — same disclosure boundary as full=true.
@router.post("/{ref_code}/pdf", dependencies=[Depends(get_current_user)])
async def generate_pdf(
    ref_code: str,
    db: Database = Depends(get_db),
    pdf: PDFService = Depends(get_pdf_service),
):
    stmt = db.get_statement_by_ref(ref_code)
    if stmt is None:
        raise HTTPException(status_code=404, detail="Reference code not found")
    content = pdf.generate_statement_pdf(stmt)
    from fastapi.responses import Response

    return Response(
        content=content,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="gawah-{ref_code}.pdf"'
        },
    )
