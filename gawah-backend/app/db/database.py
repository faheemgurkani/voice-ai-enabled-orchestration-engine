from __future__ import annotations

import json
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from app.config import Settings, get_settings
from app.models.cluster import IncidentCluster
from app.models.statement import InconsistencyFlag, StatementRecord

# Private Storage bucket for readback audio. Must match the bucket actually
# created in Supabase — see CLAUDE.md for the historical bug where this was
# pointed at a nonexistent "statements" bucket and silently fell back to /tmp.
READBACK_AUDIO_BUCKET = "readback-audio"
STORAGE_URL_PREFIX = "supabase-storage://"


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(value: datetime | str | None = None) -> str:
    if value is None:
        return _now().isoformat()
    if isinstance(value, datetime):
        return value.isoformat()
    return value


class Database:
    def __init__(self, settings: Settings):
        self.settings = settings
        self._lock = threading.Lock()
        self._supabase = None
        self._store_path = Path(settings.local_db_path)
        Path(settings.local_audio_dir).mkdir(parents=True, exist_ok=True)

        if settings.use_supabase:
            from supabase import create_client

            self._supabase = create_client(
                settings.supabase_url,
                settings.supabase_anon_or_service_key,
            )
        else:
            self._ensure_local_store()

    @property
    def backend(self) -> str:
        return "supabase" if self._supabase is not None else "local_json"

    def _ensure_local_store(self) -> None:
        self._store_path.parent.mkdir(parents=True, exist_ok=True)
        if not self._store_path.exists():
            self._write_local(
                {
                    "statements": [],
                    "incident_clusters": [],
                    "sessions": [],
                    "calls": [],
                    "kpi_events": [],
                }
            )

    def _read_local(self) -> Dict[str, Any]:
        with self._store_path.open("r", encoding="utf-8") as handle:
            data = json.load(handle)
        data.setdefault("statements", [])
        data.setdefault("incident_clusters", [])
        data.setdefault("sessions", [])
        data.setdefault("calls", [])
        data.setdefault("kpi_events", [])
        return data

    def _write_local(self, payload: Dict[str, Any]) -> None:
        with self._store_path.open("w", encoding="utf-8") as handle:
            json.dump(payload, handle, indent=2, default=str)

    # --- Statements ---

    def save_statement(self, record: StatementRecord) -> StatementRecord:
        data = record.model_dump(mode="json")
        if self._supabase is not None:
            result = (
                self._supabase.table("statements")
                .upsert(data, on_conflict="ref_code")
                .execute()
            )
            row = result.data[0] if result.data else data
            return StatementRecord.model_validate(row)

        with self._lock:
            store = self._read_local()
            replaced = False
            for idx, item in enumerate(store["statements"]):
                if item.get("ref_code") == record.ref_code or item.get("id") == record.id:
                    data["id"] = item["id"]
                    store["statements"][idx] = data
                    replaced = True
                    break
            if not replaced:
                store["statements"].append(data)
            self._write_local(store)
        return StatementRecord.model_validate(data)

    def get_statement_by_ref(self, ref_code: str) -> Optional[StatementRecord]:
        code = ref_code.upper()
        if self._supabase is not None:
            result = (
                self._supabase.table("statements")
                .select("*")
                .eq("ref_code", code)
                .limit(1)
                .execute()
            )
            if not result.data:
                return None
            return StatementRecord.model_validate(result.data[0])

        with self._lock:
            store = self._read_local()
            for item in store["statements"]:
                if str(item.get("ref_code", "")).upper() == code:
                    return StatementRecord.model_validate(item)
        return None

    def get_statement_by_session(self, session_id: str) -> Optional[StatementRecord]:
        if self._supabase is not None:
            result = (
                self._supabase.table("statements")
                .select("*")
                .eq("session_id", session_id)
                .order("created_at", desc=True)
                .limit(1)
                .execute()
            )
            if not result.data:
                return None
            return StatementRecord.model_validate(result.data[0])

        with self._lock:
            store = self._read_local()
            matches = [s for s in store["statements"] if s.get("session_id") == session_id]
            if not matches:
                return None
            matches.sort(key=lambda s: s.get("created_at", ""), reverse=True)
            return StatementRecord.model_validate(matches[0])

    def list_statements(
        self,
        *,
        page: int = 1,
        page_size: int = 20,
        status: Optional[str] = None,
        flags: Optional[str] = None,
    ) -> Tuple[List[StatementRecord], int]:
        page = max(page, 1)
        page_size = min(max(page_size, 1), 1000)

        if self._supabase is not None:
            query = self._supabase.table("statements").select("*", count="exact")
            if status:
                query = query.eq("status", status)
            if flags and "intimidation" in {f.strip() for f in flags.split(",")}:
                query = query.eq("intimidation_flag", True)
            result = (
                query.order("created_at", desc=True)
                .range((page - 1) * page_size, page * page_size - 1)
                .execute()
            )
            items = [StatementRecord.model_validate(r) for r in (result.data or [])]
            return items, result.count or len(items)

        with self._lock:
            store = self._read_local()
            rows = store["statements"]
            if status:
                rows = [r for r in rows if r.get("status") == status]
            if flags:
                flag_set = {f.strip() for f in flags.split(",") if f.strip()}
                if "intimidation" in flag_set:
                    rows = [r for r in rows if r.get("intimidation_flag")]
                if "inconsistency" in flag_set:
                    rows = [r for r in rows if r.get("inconsistency_flags")]
            # Skip legacy/partial rows that cannot hydrate into StatementRecord.
            valid_rows: List[Dict[str, Any]] = []
            for row in rows:
                if not row.get("ref_code"):
                    continue
                try:
                    StatementRecord.model_validate(row)
                    valid_rows.append(row)
                except Exception:
                    continue
            rows = sorted(
                valid_rows, key=lambda s: s.get("created_at", ""), reverse=True
            )
            total = len(rows)
            offset = (page - 1) * page_size
            slice_rows = rows[offset : offset + page_size]
            return [StatementRecord.model_validate(r) for r in slice_rows], total

    def append_inconsistency_flag(
        self, session_id: str, flag: InconsistencyFlag
    ) -> Optional[StatementRecord]:
        stmt = self.get_statement_by_session(session_id)
        if stmt is None:
            # Create shell statement so realtime flags aren't lost
            from app.services.statement_builder import generate_ref_code

            stmt = StatementRecord(
                ref_code=generate_ref_code(),
                session_id=session_id,
                location="pending",
                sequence_of_events="pending",
                status="incomplete",
            )
        flags = list(stmt.inconsistency_flags or [])
        flags.append(flag)
        stmt.inconsistency_flags = flags
        return self.save_statement(stmt)

    def update_statement_fields(
        self, ref_code: str, fields: Dict[str, Any]
    ) -> Optional[StatementRecord]:
        stmt = self.get_statement_by_ref(ref_code)
        if stmt is None:
            return None
        data = stmt.model_dump()
        data.update(fields)
        return self.save_statement(StatementRecord.model_validate(data))

    def review_statement(
        self, ref_code: str, reviewed_by: str, reviewer_notes: str
    ) -> Optional[StatementRecord]:
        return self.update_statement_fields(
            ref_code,
            {
                "status": "reviewed",
                "reviewed_by": reviewed_by,
                "reviewer_notes": reviewer_notes,
                "reviewed_at": _now(),
            },
        )

    # --- Clusters ---

    def save_cluster(self, cluster: IncidentCluster) -> IncidentCluster:
        data = cluster.model_dump(mode="json")
        if self._supabase is not None:
            result = (
                self._supabase.table("incident_clusters")
                .upsert(data, on_conflict="id")
                .execute()
            )
            row = result.data[0] if result.data else data
            return IncidentCluster.model_validate(row)

        with self._lock:
            store = self._read_local()
            replaced = False
            for idx, item in enumerate(store["incident_clusters"]):
                if item.get("id") == cluster.id:
                    store["incident_clusters"][idx] = data
                    replaced = True
                    break
            if not replaced:
                store["incident_clusters"].append(data)
            self._write_local(store)
        return IncidentCluster.model_validate(data)

    def get_cluster(self, cluster_id: str) -> Optional[IncidentCluster]:
        if self._supabase is not None:
            result = (
                self._supabase.table("incident_clusters")
                .select("*")
                .eq("id", cluster_id)
                .limit(1)
                .execute()
            )
            if not result.data:
                return None
            return IncidentCluster.model_validate(result.data[0])

        with self._lock:
            store = self._read_local()
            for item in store["incident_clusters"]:
                if item.get("id") == cluster_id:
                    return IncidentCluster.model_validate(item)
        return None

    def list_clusters(self) -> List[IncidentCluster]:
        if self._supabase is not None:
            result = (
                self._supabase.table("incident_clusters")
                .select("*")
                .order("updated_at", desc=True)
                .execute()
            )
            return [IncidentCluster.model_validate(r) for r in (result.data or [])]

        with self._lock:
            store = self._read_local()
            rows = sorted(
                store["incident_clusters"],
                key=lambda c: c.get("updated_at", ""),
                reverse=True,
            )
            return [IncidentCluster.model_validate(r) for r in rows]

    def list_statements_in_cluster(self, cluster_id: str) -> List[StatementRecord]:
        if self._supabase is not None:
            result = (
                self._supabase.table("statements")
                .select("*")
                .eq("incident_cluster_id", cluster_id)
                .execute()
            )
            return [StatementRecord.model_validate(r) for r in (result.data or [])]

        with self._lock:
            store = self._read_local()
            rows = [
                s for s in store["statements"] if s.get("incident_cluster_id") == cluster_id
            ]
            return [StatementRecord.model_validate(r) for r in rows]

    def recent_statements(self, since_iso: str, exclude_ref: str) -> List[StatementRecord]:
        if self._supabase is not None:
            result = (
                self._supabase.table("statements")
                .select("*")
                .gte("created_at", since_iso)
                .neq("ref_code", exclude_ref)
                .execute()
            )
            return [StatementRecord.model_validate(r) for r in (result.data or [])]

        with self._lock:
            store = self._read_local()
            rows = [
                s
                for s in store["statements"]
                if s.get("created_at", "") >= since_iso
                and s.get("ref_code") != exclude_ref
            ]
            return [StatementRecord.model_validate(r) for r in rows]

    # --- Sessions / KPI events ---

    def save_session(self, session: Dict[str, Any]) -> Dict[str, Any]:
        if self._supabase is not None:
            try:
                self._supabase.table("sessions").insert(session).execute()
            except Exception:
                pass
            return session
        with self._lock:
            store = self._read_local()
            store["sessions"].append(session)
            self._write_local(store)
        return session

    def upsert_call(self, call: Dict[str, Any]) -> Dict[str, Any]:
        """Create or update a tracked outbound/inbound phone call by call_id."""
        call_id = call.get("call_id") or call.get("callId")
        if not call_id:
            raise ValueError("call_id required")
        now = _iso()
        record = {
            **call,
            "call_id": call_id,
            "updated_at": now,
        }
        record.setdefault("created_at", now)

        if self._supabase is not None:
            try:
                self._supabase.table("calls").upsert(record).execute()
            except Exception:
                try:
                    self._supabase.table("calls").insert(record).execute()
                except Exception:
                    pass
            return record

        with self._lock:
            store = self._read_local()
            calls = store["calls"]
            idx = next(
                (i for i, c in enumerate(calls) if c.get("call_id") == call_id),
                None,
            )
            if idx is None:
                calls.append(record)
            else:
                merged = {**calls[idx], **record}
                merged["created_at"] = calls[idx].get("created_at") or record["created_at"]
                calls[idx] = merged
                record = merged
            self._write_local(store)
        return record

    def list_calls(self, *, limit: int = 50) -> List[Dict[str, Any]]:
        limit = max(1, min(limit, 100))
        if self._supabase is not None:
            try:
                result = (
                    self._supabase.table("calls")
                    .select("*")
                    .order("created_at", desc=True)
                    .limit(limit)
                    .execute()
                )
                return result.data or []
            except Exception:
                return []
        with self._lock:
            calls = list(self._read_local()["calls"])
            calls.sort(key=lambda c: c.get("created_at") or "", reverse=True)
            return calls[:limit]

    def get_call(self, call_id: str) -> Optional[Dict[str, Any]]:
        if self._supabase is not None:
            try:
                result = (
                    self._supabase.table("calls")
                    .select("*")
                    .eq("call_id", call_id)
                    .limit(1)
                    .execute()
                )
                rows = result.data or []
                return rows[0] if rows else None
            except Exception:
                return None
        with self._lock:
            for call in self._read_local()["calls"]:
                if call.get("call_id") == call_id:
                    return call
        return None

    def record_kpi_event(self, event_type: str, meta: Optional[Dict[str, Any]] = None) -> None:
        event = {
            "type": event_type,
            "meta": meta or {},
            "at": _iso(),
        }
        if self._supabase is not None:
            try:
                self._supabase.table("kpi_events").insert(event).execute()
            except Exception:
                pass
            return
        with self._lock:
            store = self._read_local()
            store["kpi_events"].append(event)
            self._write_local(store)

    def all_kpi_events(self) -> List[Dict[str, Any]]:
        if self._supabase is not None:
            try:
                result = self._supabase.table("kpi_events").select("*").execute()
                return result.data or []
            except Exception:
                return []
        with self._lock:
            return list(self._read_local()["kpi_events"])

    # --- Storage (readback audio signed URLs) ---

    def create_signed_audio_url(
        self, storage_path: str, *, expires_in: int = 300
    ) -> Optional[str]:
        """Mint a short-lived signed URL for a private-bucket object.

        `storage_path` is the path inside READBACK_AUDIO_BUCKET (e.g.
        "{ref_code}/readback.mp3"), not the STORAGE_URL_PREFIX-tagged value
        stored on the statement record — callers strip that prefix first.
        Returns None when Supabase isn't configured or the call fails, so
        callers can fall back to the legacy direct-file route.
        """
        if self._supabase is None:
            return None
        try:
            result = self._supabase.storage.from_(READBACK_AUDIO_BUCKET).create_signed_url(
                storage_path, expires_in
            )
        except Exception:
            return None
        if not isinstance(result, dict):
            return None
        return result.get("signedURL") or result.get("signedUrl") or result.get("signed_url")

    # --- Lightweight abuse-prevention counters (outbound calls, etc.) ---
    # Persisted (not in-memory) so limits hold across Vercel's stateless,
    # multi-instance serverless functions — an in-process counter would reset
    # on every cold start and be trivially bypassed by concurrent requests.

    def count_recent_calls(
        self, *, within_seconds: int, to: Optional[str] = None, limit: int = 200
    ) -> int:
        """How many outbound calls were placed recently — globally, or to one number.

        Only counts genuinely dispatched attempts (mocked=False) so a Uplift
        outage that forces demo/mocked fallback doesn't itself trip the limit.
        """
        cutoff = _now().timestamp() - within_seconds
        count = 0
        for call in self.list_calls(limit=limit):
            if to is not None and call.get("to") != to:
                continue
            if call.get("mocked"):
                continue
            at = call.get("created_at") or call.get("at")
            try:
                ts = datetime.fromisoformat(str(at).replace("Z", "+00:00")).timestamp()
            except (TypeError, ValueError):
                continue
            if ts >= cutoff:
                count += 1
        return count


_db: Optional[Database] = None


def get_db() -> Database:
    global _db
    if _db is None:
        _db = Database(get_settings())
    return _db


def reset_db_for_tests() -> None:
    global _db
    _db = None
