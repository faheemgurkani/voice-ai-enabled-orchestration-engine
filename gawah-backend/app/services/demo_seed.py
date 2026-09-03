"""
Seed three fully enriched witness statements + cluster + calls for the demo tour.

Screens covered:
  /dashboard          — KPIs + statement rows (urgent, flags, scores)
  /dashboard/{ref}    — fields, readback, A/B contradictions, protection
  /clusters + detail  — 3-witness field map (agree / conflict / collusion caution)
  /calls              — completed web + phone sessions linked to ref codes
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from pathlib import Path
from uuid import uuid4

from app.config import Settings, get_settings
from app.db.database import Database
from app.models.cluster import IncidentCluster
from app.models.statement import InconsistencyFlag, StatementRecord
from app.services.protection_service import generate_protection_referral_pdf

logger = logging.getLogger(__name__)

# Fixed demo refs — easy to click during the 1:00–2:00 tour
REF_A = "NBRA7K"  # fearful neighbour — open this first
REF_B = "SHPK2M"  # chai-stall shopkeeper
REF_C = "NBRC9Q"  # third neighbour
SEED_REFS = {REF_A, REF_B, REF_C}
CLUSTER_ID = "26980a20-demo-hussain-abad-0001"
LOCATION = "Mohalla Hussain Abad, Rawalpindi"
NIGHT = "2026-08-08 after Isha (~9pm)"

# Tiny valid silent MP3 (~0.1s) so <audio> controls render
_SILENT_MP3 = bytes(
    [
        0xFF,
        0xFB,
        0x90,
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
        0x49,
        0x6E,
        0x66,
        0x6F,
    ]
)


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(dt: datetime) -> str:
    return dt.isoformat()


def _write_readback_audio(audio_dir: Path, ref: str) -> str:
    out = audio_dir / ref
    out.mkdir(parents=True, exist_ok=True)
    path = out / "readback.mp3"
    path.write_bytes(_SILENT_MP3)
    return str(path)


def _purge_seed(db: Database) -> None:
    """Remove previous seed statements / cluster / calls by known ids."""
    settings = get_settings()
    if settings.use_supabase:
        print("Warning: --replace on Supabase only upserts; manual cleanup may be needed.")
        return

    store = db._read_local()  # noqa: SLF001 — seed helper
    store["statements"] = [
        s for s in store.get("statements", []) if s.get("ref_code") not in SEED_REFS
    ]
    store["incident_clusters"] = [
        c
        for c in store.get("incident_clusters", [])
        if c.get("id") != CLUSTER_ID and not str(c.get("id", "")).startswith("26980a20-demo")
    ]
    store["calls"] = [
        c
        for c in store.get("calls", [])
        if c.get("ref_code") not in SEED_REFS
        and not str(c.get("call_id", "")).startswith("demo-")
    ]
    db._write_local(store)  # noqa: SLF001


def _build_statements(audio_dir: Path) -> list[StatementRecord]:
    # Newest first in the dashboard list = open NBRA7K (urgent) on click-1
    t0 = _now() - timedelta(minutes=20)  # NBRA7K — show first
    t1 = _now() - timedelta(hours=4)
    t2 = _now() - timedelta(hours=2)

    a = StatementRecord(
        id=str(uuid4()),
        ref_code=REF_A,
        session_id="demo-web-nbra7k",
        time_of_incident=NIGHT,
        location=LOCATION,
        persons_present=["Rasheed (neighbour)", "unknown man in black shirt", "2–3 people near chai stall"],
        sequence_of_events=(
            "میں گلی میں کپڑے سوکھانے گئی تھی۔ اتنے میں شور سنا۔ روشنی کم تھی، "
            "میں نے واضح نہیں دیکھا۔ پھر ایک آدمی نے دوسرے کو دھکا دیا اور مارا۔ "
            "بعد میں مجھے لگا چہرہ صاف نظر آ گیا — کالا قمیض والا۔ "
            "گھر والوں نے کہا زبان بند رکھو ورنہ پچھتانا پڑے گا۔"
        ),
        relationship_to_accused="Neighbour — same gali",
        temporal_uncertainty=True,
        language_of_call="ur",
        witness_type="eyewitness",
        statement_delay_days=2,
        delayed_statement_high_risk=False,
        privacy_mode=True,
        intimidation_flag=True,
        intimidation_text="گھر والوں / مقامی آدمی نے کہا: زبان بند رکھو ورنہ پچھتانا پڑے گا۔",
        inconsistency_flags=[
            InconsistencyFlag(
                source="realtime",
                category="sensory",
                contradiction_type="sensory",
                segment_a="روشنی کم تھی، میں نے واضح نہیں دیکھا۔",
                segment_b="بعد میں مجھے لگا چہرہ صاف نظر آ گیا — کالا قمیض والا۔",
                contradiction_description=(
                    "Witness first says lighting was too poor to see clearly, "
                    "then later claims she recognised the face."
                ),
                analysis=(
                    "Sensory conflict: darkness vs clear facial ID. "
                    "Counsel should clarify before defence uses §162."
                ),
                score=0.82,
                hybrid_score=0.82,
                legal_risk="high",
                flagged_at=_iso(t0 + timedelta(minutes=8)),
            ),
            InconsistencyFlag(
                source="post_call_analysis",
                category="identity",
                contradiction_type="identity",
                segment_a="unknown man in black shirt",
                segment_b="چہرہ صاف نظر آ گیا — کالا قمیض والا",
                contradiction_description=(
                    "Person starts as unknown, then is described as clearly seen."
                ),
                analysis="Identity certainty shifted mid-narrative.",
                score=0.71,
                hybrid_score=0.71,
                legal_risk="medium",
                flagged_at=_iso(t0 + timedelta(minutes=12)),
            ),
        ],
        offence_category="serious_assault",
        witness_is_victim=False,
        witness_age_under_16=False,
        protection_referral_generated=True,
        applicable_protection_act="Punjab Witness Protection Act 2018 — Unit II (Serious Offences)",
        preferred_contact_method="reference_code_only",
        confirmed_by_witness=True,
        incident_cluster_id=CLUSTER_ID,
        corroboration_score=0.58,
        corroboration_detail={
            "disclaimer": (
                "Pre-litigation intelligence only — not admissible corroboration "
                "under CrPC Section 162."
            ),
            "note": "Matches neighbours on place/time; conflicts on lighting and identity certainty.",
        },
        status="urgent_escalation",
        created_at=t0,
        readback_text=(
            "آپ نے بتایا: واقعہ محله حسین آباد، راولپنڈی میں عشاء کے بعد تقریباً نو بجے۔ "
            "آپ پڑوسی ہیں۔ شور سنا، دھکا اور مار پیٹ دیکھی۔ پہلے روشنی کم بتائی، "
            "بعد میں چہرہ صاف دکھائی دینے کی بات کی۔ دھمکی کی اپ نے بھی بتائی۔ "
            "کیا یہ درست ہے؟"
        ),
        raw_transcript=(
            "جی میں بیان دینا چاہتی ہوں… نام نہیں دینا… "
            "عشاء کے بعد… محله حسین آباد… روشنی کم تھی… پھر چہرہ نظر آ گیا…"
        ),
    )
    a.readback_audio_url = _write_readback_audio(audio_dir, REF_A)
    try:
        a.protection_referral_url = generate_protection_referral_pdf(
            a, a.applicable_protection_act or ""
        )
    except Exception as exc:  # noqa: BLE001 — demo seed must not block boot
        logger.warning("Demo protection PDF skipped for %s: %s", REF_A, exc)
        a.protection_referral_url = None

    b = StatementRecord(
        id=str(uuid4()),
        ref_code=REF_B,
        session_id="demo-phone-shpk2m",
        time_of_incident=NIGHT,
        location=LOCATION,
        persons_present=["Rasheed", "man in black kameez", "customers at chai stall"],
        sequence_of_events=(
            "میں چائے کی دکان پر بیٹھا تھا۔ نو بجے کے قریب شور ہوا۔ "
            "روشنی ٹھیک تھی — قریبی بلّب جل رہا تھا۔ "
            "کالے قمیض والے نے رشید کو پہلے گالی دی، پھر دھکا دیا، پھر مارا۔ "
            "رشید گر گیا۔ لوگ بھاگے۔ میں نے چہرہ صاف دیکھا۔"
        ),
        relationship_to_accused="Shopkeeper — saw accused as customer sometimes",
        temporal_uncertainty=False,
        language_of_call="ur",
        witness_type="eyewitness",
        statement_delay_days=1,
        privacy_mode=False,
        intimidation_flag=False,
        inconsistency_flags=[
            InconsistencyFlag(
                source="post_call_analysis",
                category="sequence",
                contradiction_type="sequence",
                segment_a="پہلے گالی دی، پھر دھکا دیا، پھر مارا",
                segment_b="(earlier in call) پہلے مارا، پھر دھکا",
                contradiction_description="Order of shove vs blow flipped once during free narrative.",
                analysis="Mild sequence slip — flag for counsel prep, not accusation.",
                score=0.55,
                hybrid_score=0.55,
                legal_risk="low",
                flagged_at=_iso(t1 + timedelta(minutes=10)),
            ),
        ],
        offence_category="serious_assault",
        confirmed_by_witness=True,
        incident_cluster_id=CLUSTER_ID,
        corroboration_score=0.64,
        corroboration_detail={
            "disclaimer": (
                "Pre-litigation intelligence only — not admissible corroboration "
                "under CrPC Section 162."
            ),
        },
        status="pending_review",
        created_at=t1,
        readback_text=(
            "آپ نے بتایا: آپ چائے والے ہیں۔ محله حسین آباد، عشاء کے بعد۔ "
            "روشنی ٹھیک تھی۔ کالے قمیض والے نے رشید کو گالی دی، دھکا دیا، مارا۔ "
            "کیا یہ درست ہے؟"
        ),
        raw_transcript="جی فون سے بات کر رہا ہوں… چائے دکان… رشید… کالا قمیض…",
    )
    b.readback_audio_url = _write_readback_audio(audio_dir, REF_B)

    c = StatementRecord(
        id=str(uuid4()),
        ref_code=REF_C,
        session_id="demo-web-nbrc9q",
        time_of_incident="2026-08-08 ~8:45–9:15pm (after Maghrib / near Isha)",
        location=LOCATION,
        persons_present=["Rasheed", "unknown man", "women at corner"],
        sequence_of_events=(
            "میں چھت سے دیکھ رہی تھی۔ شور سنا۔ "
            "کالے قمیض والے نے رشید کو پہلے گالی دی، پھر دھکا دیا، پھر مارا۔ "
            "رشید گر گیا۔ لوگ بھاگے۔ "
            "میں نے چہرہ اتنا صاف نہیں دیکھا — فاصلہ زیادہ تھا۔"
        ),
        relationship_to_accused="Neighbour across the gali — no prior relation",
        temporal_uncertainty=True,
        language_of_call="pa",
        witness_type="eyewitness",
        statement_delay_days=0,
        privacy_mode=True,
        intimidation_flag=False,
        inconsistency_flags=[],
        offence_category="serious_assault",
        confirmed_by_witness=True,
        incident_cluster_id=CLUSTER_ID,
        corroboration_score=0.61,
        corroboration_detail={
            "disclaimer": (
                "Pre-litigation intelligence only — not admissible corroboration "
                "under CrPC Section 162."
            ),
            "note": "Sequence wording unusually close to shopkeeper — collusion caution on that field.",
        },
        status="pending_review",
        created_at=t2,
        readback_text=(
            "تسی دسیا: محلہ حسین آباد، عشاء دے نیڑے۔ چھت توں شور سنیا۔ "
            "کالے قمیض والے نے رشید نوں گالی، دھکا، مار۔ چہرہ صاف نئیں ویکھیا۔ "
            "کیا ایہ ٹھیک اے؟"
        ),
        raw_transcript="جی میں چھت سے… شور… رشید… کالا قمیض… چہرہ صاف نہیں…",
    )
    c.readback_audio_url = _write_readback_audio(audio_dir, REF_C)

    return [a, b, c]


def _build_cluster() -> IncidentCluster:
    disclaimer = (
        "Pre-litigation intelligence only — not admissible corroboration under CrPC Section 162."
    )
    conflict_map = [
        {
            "field": "location",
            "status": "agreement",
            "agreement_score": 0.95,
            "values": [LOCATION, LOCATION, LOCATION],
            "conflict_detail": None,
            "note": "All three place the incident in the same mohalla.",
            "explainable": True,
            "explanation": "Strong place agreement — counsel can treat venue as settled for prep.",
        },
        {
            "field": "time_of_incident",
            "status": "partial_agreement",
            "agreement_score": 0.72,
            "values": [
                NIGHT,
                NIGHT,
                "2026-08-08 ~8:45–9:15pm (after Maghrib / near Isha)",
            ],
            "conflict_detail": "Third witness widens the window slightly earlier.",
            "note": None,
            "explainable": True,
            "explanation": "Same evening; ±30 minutes — normal memory variance.",
        },
        {
            "field": "persons_present",
            "status": "partial_agreement",
            "agreement_score": 0.68,
            "values": [
                "Rasheed + unknown man in black shirt + crowd",
                "Rasheed + man in black kameez + chai customers",
                "Rasheed + unknown man + women at corner",
            ],
            "conflict_detail": "Core two persons agree; bystanders differ.",
            "explainable": True,
            "explanation": "Accused description converges on black shirt/kameez.",
        },
        {
            "field": "sequence_of_events",
            "status": "collusion_warning",
            "agreement_score": 0.91,
            "values": [
                "noise → shove/hit; lighting uncertain; threat after",
                "abuse → shove → hit → Rasheed fell → people fled",
                "abuse → shove → hit → Rasheed fell → people fled",
            ],
            "conflict_detail": (
                "Shopkeeper and third neighbour use nearly identical sequence phrasing."
            ),
            "note": "Manual check recommended — may be coached or genuinely parallel.",
            "explainable": True,
            "explanation": (
                "Unusually high lexical overlap on sequence. Prep flag only — not proof of collusion."
            ),
        },
        {
            "field": "relationship_to_accused",
            "status": "conflict",
            "agreement_score": 0.35,
            "values": [
                "Neighbour — same gali",
                "Shopkeeper — saw accused as customer sometimes",
                "Neighbour across the gali — no prior relation",
            ],
            "conflict_detail": "Different vantage / prior contact — expected, not fatal.",
            "explainable": True,
            "explanation": "Relationships differ by role; use for mapping vantage points.",
        },
        {
            "field": "identity_certainty",
            "status": "conflict",
            "agreement_score": 0.40,
            "values": [
                "Could not see clearly → then clear face",
                "Saw face clearly (good light)",
                "Did not see face clearly (distance)",
            ],
            "conflict_detail": "Lighting / facial ID is the main crack across the street.",
            "explainable": True,
            "explanation": "This is the contradiction counsel must resolve before court.",
        },
    ]
    return IncidentCluster(
        id=CLUSTER_ID,
        cluster_label=f"{LOCATION} — 2026-08-08 (night)",
        incident_date_range="2026-08-08 evening",
        incident_location=LOCATION,
        statement_count=3,
        consensus_summary={
            "recommendation": (
                "Treat place and evening window as shared. Prioritise identity/lighting "
                "conflict for witness prep. Sequence overlap between SHPK2M and NBRC9Q "
                "needs a soft collusion check — preparedness only."
            ),
            "fields_agreed": ["location"],
            "fields_conflicted": ["identity_certainty", "relationship_to_accused"],
            "collusion_warnings": ["sequence_of_events"],
            "disclaimer": disclaimer,
        },
        conflict_map=conflict_map,
        cluster_status="open",
        composite_score=0.61,
        collusion_warning=True,
        created_at=_now() - timedelta(hours=5),
        updated_at=_now() - timedelta(minutes=30),
    )


def _build_calls() -> list[dict]:
    base = _now()
    return [
        {
            "call_id": "demo-web-nbra7k",
            "channel": "web_browser",
            "status": "completed",
            "state": "completed",
            "direction": "inbound",
            "label": "Completed — web testimony (anonymous neighbour)",
            "duration_sec": 148,
            "created_at": _iso(base - timedelta(hours=6, minutes=5)),
            "updated_at": _iso(base - timedelta(hours=6)),
            "ended_at": _iso(base - timedelta(hours=6)),
            "ended_by": "web_pipeline",
            "connected": True,
            "mocked": True,
            "ref_code": REF_A,
            "transcript": (
                "Witness opted privacy mode. Narrative: Mohalla Hussain Abad after Isha. "
                "Lighting poor then claimed clear face. Threat reported. Ref NBRA7K saved."
            ),
            "artifacts_status": "ready",
            "artifacts_available": True,
            "events": [
                {
                    "at": _iso(base - timedelta(hours=6, minutes=5)),
                    "type": "session_created",
                    "detail": "Web demo session started",
                },
                {
                    "at": _iso(base - timedelta(hours=6, minutes=3)),
                    "type": "connected",
                    "detail": "Witness speaking (Urdu)",
                },
                {
                    "at": _iso(base - timedelta(hours=6, minutes=1)),
                    "type": "statement_saved",
                    "detail": f"Statement {REF_A} linked",
                    "ref_code": REF_A,
                },
                {
                    "at": _iso(base - timedelta(hours=6)),
                    "type": "completed",
                    "detail": "Call ended — streamed to dashboard",
                },
            ],
        },
        {
            "call_id": "demo-phone-shpk2m",
            "channel": "phone_outbound",
            "status": "completed",
            "state": "completed",
            "direction": "outbound",
            "to": "+92**********",
            "label": "Completed — phone testimony (chai stall)",
            "duration_sec": 192,
            "created_at": _iso(base - timedelta(hours=4, minutes=8)),
            "updated_at": _iso(base - timedelta(hours=4)),
            "ended_at": _iso(base - timedelta(hours=4)),
            "ended_by": "phone_pipeline",
            "connected": True,
            "mocked": True,
            "ref_code": REF_B,
            "transcript": (
                "Shopkeeper account: clear bulb light, black kameez, abuse→shove→hit. "
                "Mild sequence flip flagged. Ref SHPK2M saved."
            ),
            "artifacts_status": "ready",
            "artifacts_available": True,
            "events": [
                {
                    "at": _iso(base - timedelta(hours=4, minutes=8)),
                    "type": "dispatched",
                    "detail": "PSTN dial out",
                },
                {
                    "at": _iso(base - timedelta(hours=4, minutes=7)),
                    "type": "answered",
                    "detail": "Witness answered",
                },
                {
                    "at": _iso(base - timedelta(hours=4, minutes=1)),
                    "type": "statement_saved",
                    "detail": f"Statement {REF_B} linked",
                    "ref_code": REF_B,
                },
                {
                    "at": _iso(base - timedelta(hours=4)),
                    "type": "completed",
                    "detail": "Hangup — artifacts ready",
                },
            ],
        },
        {
            "call_id": "demo-web-nbrc9q",
            "channel": "web_browser",
            "status": "completed",
            "state": "completed",
            "direction": "inbound",
            "label": "Completed — web testimony (rooftop neighbour)",
            "duration_sec": 131,
            "created_at": _iso(base - timedelta(hours=2, minutes=4)),
            "updated_at": _iso(base - timedelta(hours=2)),
            "ended_at": _iso(base - timedelta(hours=2)),
            "ended_by": "web_pipeline",
            "connected": True,
            "mocked": True,
            "ref_code": REF_C,
            "transcript": (
                "Third neighbour (Punjabi): same night, distance limited facial ID. "
                "Sequence phrasing overlaps shopkeeper — cluster collusion caution. Ref NBRC9Q."
            ),
            "artifacts_status": "ready",
            "artifacts_available": True,
            "events": [
                {
                    "at": _iso(base - timedelta(hours=2, minutes=4)),
                    "type": "session_created",
                    "detail": "Web session",
                },
                {
                    "at": _iso(base - timedelta(hours=2, minutes=1)),
                    "type": "statement_saved",
                    "detail": f"Statement {REF_C} linked",
                    "ref_code": REF_C,
                },
                {
                    "at": _iso(base - timedelta(hours=2)),
                    "type": "completed",
                    "detail": "Streamed into cluster",
                },
            ],
        },
    ]


def _seed_present(db: Database) -> bool:
    """True when all three demo refs + cluster + demo calls are already loaded."""
    statements, _total = db.list_statements(page_size=100)
    refs = {s.ref_code for s in statements}
    if not SEED_REFS.issubset(refs):
        return False
    cluster = db.get_cluster(CLUSTER_ID)
    if cluster is None:
        return False
    call_ids = {c.get("call_id") for c in db.list_calls(limit=100)}
    needed = {"demo-web-nbra7k", "demo-phone-shpk2m", "demo-web-nbrc9q"}
    return needed.issubset(call_ids)


def seed_demo_store(db: Database | None = None, *, replace: bool = False) -> dict:
    """Write the full 3-statement / 1-cluster / 3-call demo tour into the store."""
    settings = get_settings()
    database = db or Database(settings)
    audio_dir = Path(settings.local_audio_dir)

    if replace:
        _purge_seed(database)

    # Cluster must be saved before the statements that reference it — Postgres
    # enforces statements.incident_cluster_id -> incident_clusters.id as a real
    # FK constraint (local JSON has no such constraint, which is why this
    # ordering bug never surfaced there).
    cluster = _build_cluster()
    database.save_cluster(cluster)

    statements = _build_statements(audio_dir)
    for stmt in statements:
        database.save_statement(stmt)

    for call in _build_calls():
        database.upsert_call(call)

    database.record_kpi_event(
        "demo_seed",
        {"refs": sorted(SEED_REFS), "cluster_id": CLUSTER_ID, "at": _iso(_now())},
    )
    return {
        "refs": sorted(SEED_REFS),
        "cluster_id": CLUSTER_ID,
        "calls": 3,
        "store": "supabase" if database.backend == "supabase" else settings.local_db_path,
    }


def ensure_demo_seed(
    db: Database | None = None,
    *,
    settings: Settings | None = None,
) -> bool:
    """
    Ensure demo examples exist (local JSON / Vercel /tmp).

    Returns True when seed ran, False when already present.
    Skipped automatically when Supabase is the backend.
    """
    cfg = settings or get_settings()
    if cfg.use_supabase:
        return False
    database = db or Database(cfg)
    if _seed_present(database):
        return False
    seed_demo_store(database, replace=True)
    logger.info(
        "Demo seed loaded: refs=%s cluster=%s",
        ",".join(sorted(SEED_REFS)),
        CLUSTER_ID,
    )
    return True
