from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional
from xml.sax.saxutils import escape

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Request, Response, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from app.auth import get_current_user
from app.config import get_settings
from app.db.database import Database, get_db
from app.services.call_tracker import (
    ACTIVE_STATES,
    TERMINAL_STATES,
    human_label,
    index_remote_sessions,
    merge_uplift_session,
    normalize_call_status,
    persistable_fields,
)
from app.services.call_statement_pipeline import (
    ensure_statement_from_call,
    maybe_stream_call_to_dashboard,
)
from app.services.captcha import verify_turnstile
from app.services.llm_service import LLMService, get_llm_service
from app.services.phone_utils import CALL_INSTRUCTIONS, normalize_pakistan_phone
from app.services.uplift_service import UpliftService, get_uplift_service
from app.services.web_call_pipeline import append_event, process_web_recording


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


async def _sync_one_call(
    *,
    call_id: str,
    local: Dict[str, Any],
    remote: Optional[Dict[str, Any]],
    uplift: UpliftService,
    db: Database,
    fetch_detail: bool = True,
) -> Dict[str, Any]:
    """Merge list/detail Uplift data into a tracked call and persist artifacts."""
    # Local-only stubs (dispatch errors / offline web demos) have no Uplift session.
    local_only = (
        str(call_id).startswith("failed-")
        or str(call_id).startswith("web-")
        or bool(local.get("mocked"))
        or str(local.get("channel") or "").startswith("web")
    )
    if str(call_id).startswith("failed-"):
        status = local.get("status") or local.get("state") or "failed"
        if status in {"unknown", ""}:
            status = "failed"
        repaired = {
            **local,
            "call_id": call_id,
            "status": status,
            "state": local.get("state") or "failed",
            "label": local.get("label")
            or human_label(status, local.get("outcome") or "dispatch_error"),
            "mocked": bool(local.get("mocked", False)),
            "artifacts_available": False,
            "artifacts_status": "n/a",
        }
        db.upsert_call(persistable_fields(repaired))
        return repaired

    if local_only and not remote:
        status = local.get("status") or local.get("state") or "unknown"
        return {
            **local,
            "call_id": call_id,
            "status": status,
            "label": local.get("label")
            or human_label(status, local.get("outcome"), channel=local.get("channel")),
            "mocked": bool(local.get("mocked", False)),
        }

    remote_payload = dict(remote or {})
    artifacts = None

    status_hint = (remote_payload.get("state") or local.get("status") or "").lower()
    needs_detail = fetch_detail and (
        status_hint in TERMINAL_STATES
        or (local.get("status") or "").lower() in TERMINAL_STATES
        or not local.get("duration_sec")
        or not local.get("artifacts_status")
        or local.get("artifacts_status") == "pending_or_unavailable"
    )

    if needs_detail and uplift.enabled:
        enriched = await uplift.enrich_call_from_uplift(
            call_id,
            download=not bool(local.get("local_recording_path")),
        )
        if enriched.get("ok"):
            remote_payload = {**remote_payload, **(enriched.get("session") or {})}
            artifacts = enriched.get("artifacts")

    if not remote_payload:
        status = local.get("status") or local.get("state") or "unknown"
        return {
            **local,
            "call_id": call_id,
            "status": status,
            "label": local.get("label")
            or human_label(status, local.get("outcome")),
            "mocked": bool(local.get("mocked", False)),
        }

    merged = merge_uplift_session(local, remote_payload, artifacts=artifacts)
    merged["call_id"] = call_id
    db.upsert_call(persistable_fields(merged))

    # Real-time stream: completed phone calls with transcript/recording → dashboard
    try:
        streamed = await maybe_stream_call_to_dashboard(
            call=merged,
            db=db,
            uplift=uplift,
            llm=get_llm_service(),
        )
        if streamed and streamed.get("ok") and streamed.get("ref_code"):
            refreshed = db.get_call(call_id) or merged
            refreshed["ref_code"] = streamed["ref_code"]
            return refreshed
    except Exception:  # noqa: BLE001 — never break call list sync
        pass

    return merged

router = APIRouter(prefix="/api/sessions", tags=["sessions"])


class SessionCreateBody(BaseModel):
    participantName: str = Field(default="Witness", alias="participantName")
    participant_name: Optional[str] = None

    model_config = {"populate_by_name": True}


class PlaceCallBody(BaseModel):
    to: str = Field(..., description="Pakistani mobile: +92300… or 0300…")
    participantName: Optional[str] = Field(default="Witness", alias="participantName")
    participant_name: Optional[str] = None
    idempotency_key: Optional[str] = None
    captcha_token: Optional[str] = None

    model_config = {"populate_by_name": True}


@router.post("/create")
async def create_session(
    body: SessionCreateBody | None = None,
    uplift: UpliftService = Depends(get_uplift_service),
    db: Database = Depends(get_db),
) -> Dict[str, Any]:
    """
    Start a browser / web-demo session (Uplift WebRTC when keyed).

    Always tracks a call row with channel=web_browser so the Calls dashboard
    and live activity feed can show progress — same pipeline as phone, minus PSTN.
    """
    name = "Witness"
    if body:
        name = body.participant_name or body.participantName or "Witness"
    session = await uplift.create_session(name)
    if not session.get("ok", True) and not session.get("token"):
        raise HTTPException(
            status_code=int(session.get("status_code") or 502),
            detail=session.get("detail") or "Failed to create web session",
        )

    room = session.get("roomName") or f"gawah-web-{name.replace(' ', '-').lower()}"
    call_id = str(
        session.get("sessionId")
        or session.get("session_id")
        or f"web-{room}-{int(datetime.now(timezone.utc).timestamp())}"
    )
    demo = bool(session.get("demo", False))
    adhoc = bool(session.get("adhoc", False))
    events = [
        {
            "at": _now_iso(),
            "type": "session_created",
            "detail": (
                "Offline demo credentials — use web recorder to submit testimony"
                if demo
                else (
                    "Uplift adhoc WebRTC session (fresh Gawah agent config)"
                    if adhoc
                    else "Uplift browser session created"
                )
            ),
        }
    ]
    tracked = db.upsert_call(
        {
            "call_id": call_id,
            "status": "dispatched",
            "state": "dispatched",
            "channel": "web_browser",
            "direction": "inbound",
            "assistant_id": session.get("assistantId"),
            "participant_name": name,
            "room_name": room,
            "mocked": demo,
            "label": human_label("dispatched", channel="web_browser"),
            "events": events,
            "artifacts_status": "pending_or_unavailable",
            "artifacts_available": False,
        }
    )
    db.save_session(
        {
            "call_id": call_id,
            "room_name": room,
            "created_at": _now_iso(),
            "status": "active",
            "demo": demo,
            "channel": "web_browser",
        }
    )
    db.record_kpi_event(
        "session_created",
        {"room": room, "call_id": call_id, "channel": "web_browser", "demo": demo},
    )
    return {
        "token": session.get("token"),
        "wsUrl": session.get("wsUrl"),
        "ws_url": session.get("wsUrl"),
        "roomName": room,
        "room_name": room,
        "assistantId": session.get("assistantId"),
        "sessionId": call_id,
        "callId": call_id,
        "demo": demo,
        "adhoc": adhoc,
        "ok": session.get("ok", True),
        "detail": session.get("detail"),
        "channel": "web_browser",
        "status": "dispatched",
        "label": tracked.get("label"),
        "message": (
            "Live web session ready — same Gawah agent as phone (tools + Phase 0–4). "
            "Status appears on Dashboard → Calls."
            if not demo
            else "Demo credentials only — live agent unavailable; mic upload fallback may be used."
        ),
    }


class WebEventBody(BaseModel):
    type: str = Field(..., description="e.g. connecting, connected, recording, tool, error")
    detail: Optional[str] = None
    status: Optional[str] = Field(
        default=None,
        description="Optional call status override: connected|processing|completed|failed",
    )


@router.post("/web/{call_id}/events")
async def post_web_event(
    call_id: str,
    body: WebEventBody,
    db: Database = Depends(get_db),
) -> Dict[str, Any]:
    """Live activity pings from the web demo UI (logs + optional status)."""
    call = db.get_call(call_id)
    if not call:
        raise HTTPException(status_code=404, detail="Web call not found")

    events = append_event(call, body.type, body.detail or "")
    patch: Dict[str, Any] = {
        "call_id": call_id,
        "events": events,
        "channel": call.get("channel") or "web_browser",
    }
    status = (body.status or "").lower().strip()
    if status:
        patch["status"] = status
        patch["state"] = status
        patch["label"] = human_label(status, channel="web_browser")
        if status in {"answered", "connected", "in_progress"}:
            patch["connected"] = True
            patch.setdefault("answered_at", _now_iso())
        if status in TERMINAL_STATES:
            patch["ended_at"] = _now_iso()
            patch["ended_by"] = "web_client"

    updated = db.upsert_call(patch)
    db.record_kpi_event(
        "web_event",
        {"call_id": call_id, "type": body.type, "status": status or None},
    )
    return {"ok": True, "item": updated, "events": updated.get("events") or []}


@router.post("/web/{call_id}/recording")
async def upload_web_recording(
    call_id: str,
    file: UploadFile = File(...),
    language: str = Form(default="ur"),
    participantName: str = Form(default="Witness"),
    dialogue: Optional[str] = Form(default=None),
    db: Database = Depends(get_db),
    uplift: UpliftService = Depends(get_uplift_service),
    llm: LLMService = Depends(get_llm_service),
) -> Dict[str, Any]:
    """
    Upload browser MediaRecorder audio → STT → structure → statement.

    Optional `dialogue` JSON: [{role: agent|witness, text, id?, at?}] from live
    LiveKit transcriptions so the UI can show a full Agent/Witness chat.
    """
    if not db.get_call(call_id):
        # Allow upload even if create was skipped (idempotent track)
        db.upsert_call(
            {
                "call_id": call_id,
                "status": "processing",
                "state": "processing",
                "channel": "web_browser",
                "direction": "inbound",
                "participant_name": participantName,
                "label": human_label("processing", channel="web_browser"),
                "mocked": False,
                "events": [
                    {
                        "at": _now_iso(),
                        "type": "recording_upload_started",
                        "detail": "Call row created from upload",
                    }
                ],
            }
        )

    dialogue_turns: Optional[List[Dict[str, Any]]] = None
    if dialogue and dialogue.strip():
        try:
            parsed = json.loads(dialogue)
            if isinstance(parsed, list):
                dialogue_turns = [t for t in parsed if isinstance(t, dict) and t.get("text")]
        except Exception:  # noqa: BLE001
            dialogue_turns = None

    raw = await file.read()
    result = await process_web_recording(
        call_id=call_id,
        file_bytes=raw,
        filename=file.filename or "recording.webm",
        language=language,
        db=db,
        uplift=uplift,
        llm=llm,
        participant_name=participantName,
        dialogue=dialogue_turns,
    )
    if not result.get("ok"):
        raise HTTPException(
            status_code=int(result.get("status_code") or 500),
            detail=result.get("detail") or "Web recording processing failed",
        )
    item = db.get_call(call_id)
    return {**result, "item": item}


@router.post("/web/{call_id}/complete")
async def complete_web_session(
    call_id: str,
    uplift: UpliftService = Depends(get_uplift_service),
    llm: LLMService = Depends(get_llm_service),
    db: Database = Depends(get_db),
) -> Dict[str, Any]:
    """Mark web session ended, sync artifacts, and ensure dashboard statement exists."""
    call = db.get_call(call_id)
    if not call:
        raise HTTPException(status_code=404, detail="Web call not found")

    events = append_event(call, "session_complete", "Client ended web session")
    status = call.get("status") or "completed"
    if status not in TERMINAL_STATES and status != "processing":
        status = "completed"

    patch: Dict[str, Any] = {
        "call_id": call_id,
        "status": status,
        "state": status,
        "ended_at": call.get("ended_at") or _now_iso(),
        "ended_by": call.get("ended_by") or "web_client",
        "events": events,
        "label": call.get("label")
        or human_label(status, channel="web_browser"),
        "channel": "web_browser",
    }

    # If this was a real Uplift session id, try artifact sync
    if uplift.enabled and not str(call_id).startswith("web-") and not call.get("mocked"):
        enriched = await uplift.enrich_call_from_uplift(
            call_id,
            download=not bool(call.get("local_recording_path")),
        )
        if enriched.get("ok"):
            merged = merge_uplift_session(
                {**call, **patch},
                enriched.get("session") or {},
                artifacts=enriched.get("artifacts"),
            )
            patch = persistable_fields({**merged, "call_id": call_id, "events": events})

    updated = db.upsert_call(patch)

    # Fill / link dashboard statement from recording or transcript when present
    statement_result: Dict[str, Any] = {}
    try:
        statement_result = await ensure_statement_from_call(
            call_id=call_id,
            db=db,
            uplift=uplift,
            llm=llm,
            language="ur",
            force=False,
        )
        if statement_result.get("ref_code"):
            updated = db.get_call(call_id) or updated
    except Exception as exc:  # noqa: BLE001
        statement_result = {"ok": False, "detail": str(exc)[:240]}

    return {"ok": True, "item": updated, "statement": statement_result}


@router.get("/activity", dependencies=[Depends(get_current_user)])
async def live_activity(
    limit: int = Query(40, ge=1, le=200),
    db: Database = Depends(get_db),
) -> Dict[str, Any]:
    """Flattened live event feed across phone + web calls for dashboard validation."""
    calls = db.list_calls(limit=min(limit, 50))
    feed: List[Dict[str, Any]] = []
    for call in calls:
        cid = call.get("call_id")
        channel = call.get("channel") or "unknown"
        for ev in call.get("events") or []:
            feed.append(
                {
                    "call_id": cid,
                    "channel": channel,
                    "status": call.get("status"),
                    "at": ev.get("at"),
                    "type": ev.get("type"),
                    "detail": ev.get("detail"),
                    "ref_code": call.get("ref_code") or ev.get("ref_code"),
                }
            )
        # Always include a synthetic status row so empty-event calls still appear
        feed.append(
            {
                "call_id": cid,
                "channel": channel,
                "status": call.get("status"),
                "at": call.get("updated_at") or call.get("created_at"),
                "type": "status",
                "detail": call.get("label") or call.get("status"),
                "ref_code": call.get("ref_code"),
            }
        )

    feed.sort(key=lambda e: e.get("at") or "", reverse=True)
    feed = feed[:limit]

    counts = {
        "total_calls": len(calls),
        "web": sum(1 for c in calls if "web" in str(c.get("channel") or "")),
        "phone": sum(
            1
            for c in calls
            if "phone" in str(c.get("channel") or "") or c.get("to")
        ),
        "active": sum(
            1 for c in calls if (c.get("status") or "").lower() in ACTIVE_STATES
        ),
        "completed": sum(
            1 for c in calls if (c.get("status") or "").lower() == "completed"
        ),
    }
    return {"ok": True, "counts": counts, "items": feed}


@router.post("/call")
async def place_phone_call(
    body: PlaceCallBody,
    request: Request,
    uplift: UpliftService = Depends(get_uplift_service),
    db: Database = Depends(get_db),
) -> Dict[str, Any]:
    """
    Real outbound PSTN call via Uplift AI (Singapore) — not mocked.

    `dispatched` only means dialing started. Track progress via
    GET /api/sessions/calls (state: dispatched→ringing→answered→completed|failed).

    Unauthenticated by design (witnesses never sign in) but real money/abuse
    exposure: this dials a real +92 number via Uplift, so it's gated by (a) an
    optional Turnstile CAPTCHA — enforced only once TURNSTILE_SECRET_KEY is
    configured — and (b) persisted rate limits that hold regardless of CAPTCHA
    config: a per-number cooldown and a global hourly cap.
    """
    settings = get_settings()

    e164, err = normalize_pakistan_phone(body.to)
    if err or not e164:
        raise HTTPException(status_code=400, detail=err or "Invalid phone number")

    client_ip = request.client.host if request.client else None
    if not await verify_turnstile(body.captcha_token, settings, remoteip=client_ip):
        raise HTTPException(status_code=400, detail="CAPTCHA verification failed")

    recent_to_number = db.count_recent_calls(
        within_seconds=settings.call_cooldown_seconds, to=e164
    )
    if recent_to_number > 0:
        raise HTTPException(
            status_code=429,
            detail=(
                f"A call to this number was already placed recently. "
                f"Try again in a few minutes."
            ),
        )

    recent_global = db.count_recent_calls(within_seconds=3600, limit=200)
    if recent_global >= settings.call_max_per_hour_global:
        raise HTTPException(
            status_code=429,
            detail="Outbound call volume limit reached for this hour. Try again later.",
        )

    # Soft guard: warn if another call may still be active (Uplift org limit = 1)
    active = [
        c
        for c in db.list_calls(limit=20)
        if (c.get("status") or c.get("state") or "").lower() in ACTIVE_STATES
    ]

    name = body.participant_name or body.participantName or "Witness"
    result = await uplift.place_call(
        e164,
        additional_instructions=CALL_INSTRUCTIONS,
        variables={"participantName": name, "channel": "phone"},
        idempotency_key=body.idempotency_key,
    )
    if not result.get("ok"):
        status = int(result.get("status_code") or 502)
        if status < 400:
            status = 502
        # Persist failed attempt for dashboard visibility
        db.upsert_call(
            {
                "call_id": f"failed-{datetime.now(timezone.utc).timestamp()}",
                "to": e164,
                "status": "failed",
                "state": "failed",
                "outcome": "dispatch_error",
                "failure_reason": str(result.get("detail"))[:500],
                "channel": "phone_outbound",
                "label": human_label("failed", "dispatch_error"),
                "mocked": False,
            }
        )
        raise HTTPException(
            status_code=min(status, 599),
            detail=result.get("detail") or "Failed to place call",
        )

    call_id = result.get("callId")
    tracked = db.upsert_call(
        {
            "call_id": call_id,
            "to": e164,
            "status": "dispatched",
            "state": result.get("status", "dispatched"),
            "channel": "phone_outbound",
            "direction": "outbound",
            "assistant_id": result.get("assistantId"),
            "participant_name": name,
            "mocked": False,
            "label": human_label("dispatched"),
        }
    )
    db.record_kpi_event(
        "call_placed",
        {"call_id": call_id, "to": e164, "status": "dispatched"},
    )
    return {
        "ok": True,
        "mocked": False,
        "callId": call_id,
        "status": "dispatched",
        "to": e164,
        "assistantId": result.get("assistantId"),
        "channel": "phone_outbound",
        "label": tracked.get("label"),
        "active_calls_warning": len(active) > 0,
        "message": (
            "Real Uplift call dispatched (not mocked). Answer your phone. "
            "Track status on Dashboard → Calls. "
            "Note: dispatched ≠ answered — if you miss it, outcome becomes no_answer."
        ),
    }


@router.get("/calls", dependencies=[Depends(get_current_user)])
async def list_phone_calls(
    limit: int = Query(25, ge=1, le=100),
    sync: bool = Query(True, description="Refresh status + artifacts from Uplift"),
    uplift: UpliftService = Depends(get_uplift_service),
    db: Database = Depends(get_db),
) -> Dict[str, Any]:
    """Tracked calls with live Uplift status / metadata sync for the dashboard."""
    local = db.list_calls(limit=limit)
    remote_index: Dict[str, Dict[str, Any]] = {}
    sync_error = None

    if sync and uplift.enabled:
        remote = await uplift.list_call_sessions(limit=max(limit, 20))
        if remote.get("ok"):
            remote_index = index_remote_sessions(remote.get("items") or [])
            # Upsert any telephony sessions we don't have locally yet
            for sid, item in remote_index.items():
                if item.get("channel") != "telephony" and item.get("direction") != "outbound":
                    if not item.get("toNumber"):
                        continue
                if not db.get_call(sid):
                    status = normalize_call_status(
                        state=item.get("state"),
                        outcome=item.get("outcome"),
                        failure_reason=item.get("failureReason"),
                        connected=item.get("connected"),
                    )
                    db.upsert_call(
                        {
                            "call_id": sid,
                            "to": item.get("toNumber"),
                            "from_number": item.get("fromNumber"),
                            "status": status,
                            "state": item.get("state"),
                            "outcome": item.get("outcome"),
                            "failure_reason": item.get("failureReason"),
                            "connected": item.get("connected"),
                            "duration_sec": item.get("durationSec"),
                            "ended_at": item.get("endedAt"),
                            "ended_by": item.get("endedBy"),
                            "channel": item.get("channel") or "phone_outbound",
                            "direction": item.get("direction") or "outbound",
                            "mocked": False,
                            "label": human_label(
                                status,
                                item.get("outcome")
                                if isinstance(item.get("outcome"), str)
                                else None,
                            ),
                            "created_at": item.get("createdAt")
                            or item.get("startedAt")
                            or datetime.now(timezone.utc).isoformat(),
                        }
                    )
            local = db.list_calls(limit=limit)
        else:
            sync_error = remote.get("detail")

    items = []
    # Detail-fetch only for terminal/recent rows to stay polite on Uplift rate limits
    detail_budget = 8
    for call in local:
        cid = str(call.get("call_id") or "")
        if not cid:
            continue
        remote = remote_index.get(cid)
        if sync and uplift.enabled and (remote or call.get("status") in TERMINAL_STATES):
            use_detail = detail_budget > 0
            if use_detail:
                detail_budget -= 1
            merged = await _sync_one_call(
                call_id=cid,
                local=call,
                remote=remote,
                uplift=uplift,
                db=db,
                fetch_detail=use_detail,
            )
            items.append(merged)
        elif remote:
            merged = merge_uplift_session(call, remote)
            db.upsert_call(persistable_fields({**merged, "call_id": cid}))
            try:
                streamed = await maybe_stream_call_to_dashboard(
                    call=merged,
                    db=db,
                    uplift=uplift,
                    llm=get_llm_service(),
                )
                if streamed and streamed.get("ok") and streamed.get("ref_code"):
                    merged = db.get_call(cid) or merged
            except Exception:  # noqa: BLE001
                pass
            items.append(merged)
        else:
            status = call.get("status") or call.get("state") or "unknown"
            row = {
                **call,
                "status": status,
                "label": call.get("label")
                or human_label(status, call.get("outcome")),
                "mocked": bool(call.get("mocked", False)),
            }
            # Local completed phone calls with transcript still stream to dashboard
            try:
                streamed = await maybe_stream_call_to_dashboard(
                    call=row,
                    db=db,
                    uplift=uplift,
                    llm=get_llm_service(),
                )
                if streamed and streamed.get("ok") and streamed.get("ref_code"):
                    row = db.get_call(cid) or row
            except Exception:  # noqa: BLE001
                pass
            items.append(row)

    counts = {
        "total": len(items),
        "active": sum(1 for i in items if (i.get("status") or "").lower() in ACTIVE_STATES),
        "completed": sum(1 for i in items if (i.get("status") or "").lower() == "completed"),
        "failed": sum(1 for i in items if (i.get("status") or "").lower() == "failed"),
        "with_artifacts": sum(1 for i in items if i.get("artifacts_available")),
    }

    return {
        "ok": True,
        "mocked": False,
        "sync_error": sync_error,
        "counts": counts,
        "items": items,
        "note": (
            "Uplift session metadata is always synced. Recording/transcript URLs are "
            "captured when the platform exposes them (docs: async after call ends)."
        ),
    }


@router.post(
    "/calls/{call_id}/process-statement", dependencies=[Depends(get_current_user)]
)
async def process_call_statement(
    call_id: str,
    force: bool = Query(False, description="Re-run even if already linked"),
    language: str = Query("ur"),
    uplift: UpliftService = Depends(get_uplift_service),
    llm: LLMService = Depends(get_llm_service),
    db: Database = Depends(get_db),
) -> Dict[str, Any]:
    """
    Explicit call → dashboard stream.

    Builds (or links) a statement from call transcript/recording so the
    dashboard shows live operations — not demo-seed data.
    """
    result = await ensure_statement_from_call(
        call_id=call_id,
        db=db,
        uplift=uplift,
        llm=llm,
        language=language,
        force=force,
    )
    if not result.get("ok") and result.get("status_code") == 404:
        raise HTTPException(status_code=404, detail=result.get("detail") or "Call not found")
    return result


@router.get("/calls/{call_id}", dependencies=[Depends(get_current_user)])
async def get_phone_call(
    call_id: str,
    uplift: UpliftService = Depends(get_uplift_service),
    db: Database = Depends(get_db),
) -> Dict[str, Any]:
    local = db.get_call(call_id)
    remote_item = None
    if uplift.enabled:
        detail = await uplift.get_session(call_id)
        if detail.get("ok"):
            remote_item = detail.get("session")
        else:
            remote = await uplift.list_call_sessions(limit=30)
            if remote.get("ok"):
                remote_item = index_remote_sessions(remote.get("items") or []).get(call_id)

    if local is None and remote_item is None:
        raise HTTPException(status_code=404, detail="Call not found")

    base = local or {
        "call_id": call_id,
        "to": remote_item.get("toNumber") if remote_item else None,
        "mocked": False,
    }
    merged = await _sync_one_call(
        call_id=call_id,
        local=base,
        remote=remote_item,
        uplift=uplift,
        db=db,
        fetch_detail=True,
    )
    return {"ok": True, "mocked": False, "item": merged}


@router.post(
    "/calls/{call_id}/refresh-artifacts", dependencies=[Depends(get_current_user)]
)
async def refresh_call_artifacts(
    call_id: str,
    uplift: UpliftService = Depends(get_uplift_service),
    db: Database = Depends(get_db),
) -> Dict[str, Any]:
    """Force re-fetch of Uplift session detail + recording/transcript if present."""
    local = db.get_call(call_id) or {"call_id": call_id, "mocked": False}
    if not uplift.enabled:
        raise HTTPException(status_code=503, detail="Uplift not configured")
    merged = await _sync_one_call(
        call_id=call_id,
        local=local,
        remote=None,
        uplift=uplift,
        db=db,
        fetch_detail=True,
    )
    return {
        "ok": True,
        "mocked": False,
        "item": merged,
        "artifacts_status": merged.get("artifacts_status"),
        "artifacts_available": merged.get("artifacts_available"),
    }


@router.get("/calls/{call_id}/recording")
async def get_call_recording(
    call_id: str,
    db: Database = Depends(get_db),
) -> Any:
    """Serve a locally cached call recording downloaded from Uplift (if any)."""
    call = db.get_call(call_id)
    if not call:
        raise HTTPException(status_code=404, detail="Call not found")

    path_str = call.get("local_recording_path")
    if path_str:
        path = Path(path_str)
        if path.is_file():
            media = "audio/mpeg"
            if path.suffix == ".wav":
                media = "audio/wav"
            elif path.suffix == ".ogg":
                media = "audio/ogg"
            return FileResponse(path, media_type=media, filename=f"{call_id}-recording{path.suffix}")

    if call.get("recording_url"):
        return {
            "ok": True,
            "available": True,
            "recording_url": call.get("recording_url"),
            "local_cached": False,
            "message": "Recording URL known but not cached locally — open recording_url.",
        }

    raise HTTPException(
        status_code=404,
        detail=(
            "No call recording available yet. Uplift may still be generating it, "
            "or this org's API does not expose recording URLs."
        ),
    )


@router.post("/twilio-webhook")
async def twilio_webhook(
    request: Request,
    uplift: UpliftService = Depends(get_uplift_service),
    db: Database = Depends(get_db),
) -> Response:
    """
    Inbound Twilio number → callback via Uplift outbound (real, not mocked).
    """
    settings = get_settings()
    form = await request.form()
    from_raw = str(form.get("From") or form.get("Caller") or "").strip()
    e164, err = normalize_pakistan_phone(from_raw) if from_raw else (None, "missing From")

    call_result: Dict[str, Any] = {}
    if e164 and uplift.enabled:
        call_result = await uplift.place_call(
            e164,
            additional_instructions=CALL_INSTRUCTIONS
            + " Witness ne Gawah Twilio number par khud dial kiya tha — consent mazboot hai.",
            variables={"participantName": "Witness", "channel": "phone_inbound_callback"},
            idempotency_key=f"twilio-cb-{form.get('CallSid') or e164}",
        )
        if call_result.get("ok"):
            db.upsert_call(
                {
                    "call_id": call_result.get("callId"),
                    "to": e164,
                    "status": "dispatched",
                    "state": call_result.get("status", "dispatched"),
                    "channel": "phone_inbound_callback",
                    "direction": "outbound",
                    "twilio_from": from_raw,
                    "mocked": False,
                    "label": human_label("dispatched"),
                }
            )
            db.record_kpi_event(
                "inbound_callback_placed",
                {"call_id": call_result.get("callId"), "to": e164},
            )

    if call_result.get("ok"):
        say = (
            "Gawah mein khush aamdeed. Aap ka number mil gaya. "
            "Ab hum aap ko Gawah agent se call kar rahe hain. "
            "Yeh line band ho jayegi — please agla call uthaen."
        )
    elif not settings.upliftai_api_key:
        say = (
            "Gawah mein khush aamdeed. Phone calling abhi configure nahi hai. "
            "Dashboard se Call Me option use karein."
        )
    elif err:
        say = (
            "Gawah mein khush aamdeed. Sirf Pakistani mobile numbers support hain. "
            "Dashboard se apna number de kar Call Me dabayen."
        )
    else:
        say = (
            "Gawah mein khush aamdeed. Callback shuru nahi ho saka. "
            "Thori der baad dobara try karein ya dashboard se Call Me use karein."
        )

    twiml = f"""<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say language="ur-PK">{escape(say)}</Say>
  <Pause length="1"/>
  <Hangup/>
</Response>"""
    return Response(content=twiml, media_type="text/xml")
