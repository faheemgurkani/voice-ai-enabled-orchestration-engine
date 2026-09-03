from __future__ import annotations

import copy
import mimetypes
from pathlib import Path
from typing import Any, Dict, List, Optional
from urllib.parse import urlparse

import httpx

from app.config import Settings, get_settings
from app.prompts.agent_config import GAWAH_ASSISTANT_CONFIG
from app.services.phone_utils import WEB_CALL_INSTRUCTIONS

# Field names Uplift may use when recordings/transcripts appear asynchronously.
_RECORDING_KEYS = (
    "recordingUrl",
    "recording_url",
    "recording",
    "audioUrl",
    "audio_url",
    "mediaUrl",
    "media_url",
    "callRecordingUrl",
    "call_recording_url",
)
_TRANSCRIPT_KEYS = (
    "transcript",
    "transcriptText",
    "transcript_text",
    "transcription",
    "conversationTranscript",
)
_ANALYSIS_KEYS = ("analysis", "summary", "callAnalysis", "call_analysis")


class UpliftService:
    """
    Uplift AI integration (Singapore region for Pakistan).

    - Realtime Assistants: create / reuse assistant, createSession
    - TTS REST: statement readback audio
    - STT REST: admin transcription
    - Outbound calls: POST /calls (Singapore only)
    """

    def __init__(self, settings: Settings | None = None):
        self.settings = settings or get_settings()

    @property
    def enabled(self) -> bool:
        return self.settings.uplift_enabled

    def _headers(self) -> Dict[str, str]:
        return {
            "Authorization": f"Bearer {self.settings.upliftai_api_key}",
            "Content-Type": "application/json",
        }

    async def sync_assistant_config(self, assistant_id: str) -> Dict[str, Any]:
        """
        Push current GAWAH_ASSISTANT_CONFIG (instructions + tools) to Uplift.

        Keeps phone PSTN and web WebRTC on the same agent behaviour. Uplift
        update endpoint: POST /realtime-assistants/{id} (partial config ok).
        """
        if not self.enabled or not assistant_id or str(assistant_id).startswith("demo"):
            return {"ok": False, "detail": "Assistant sync skipped"}

        url = (
            f"{self.settings.uplift_base_url.rstrip('/')}"
            f"/realtime-assistants/{assistant_id}"
        )
        config = copy.deepcopy(GAWAH_ASSISTANT_CONFIG.get("config") or {})
        tts = config.setdefault("tts", {}).setdefault("default", {})
        if self.settings.uplift_tts_voice_id:
            tts["voiceId"] = self.settings.uplift_tts_voice_id
        if self.settings.uplift_tts_output_format:
            tts["outputFormat"] = self.settings.uplift_tts_output_format
        stt = config.setdefault("stt", {}).setdefault("default", {})
        stt["language"] = "ur"
        body = {
            "name": GAWAH_ASSISTANT_CONFIG.get("name"),
            "description": GAWAH_ASSISTANT_CONFIG.get("description"),
            "config": config,
        }
        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                response = await client.post(url, headers=self._headers(), json=body)
                if response.status_code >= 400:
                    return {
                        "ok": False,
                        "detail": response.text[:400],
                        "status_code": response.status_code,
                    }
                return {"ok": True, "assistantId": assistant_id, "synced": True}
        except httpx.HTTPError as exc:
            return {"ok": False, "detail": str(exc)}

    async def ensure_assistant(self) -> Dict[str, Any]:
        if not self.enabled:
            return {
                "ok": False,
                "assistantId": self.settings.uplift_assistant_id or "demo-assistant",
                "detail": "UPLIFTAI_API_KEY not set",
            }
        if self.settings.uplift_assistant_id:
            # Best-effort sync so web/phone share latest Phase 0–4 + tools
            sync = await self.sync_assistant_config(self.settings.uplift_assistant_id)
            return {
                "ok": True,
                "assistantId": self.settings.uplift_assistant_id,
                "synced": bool(sync.get("ok")),
                "sync_detail": sync.get("detail"),
            }

        url = f"{self.settings.uplift_base_url.rstrip('/')}/realtime-assistants"
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(
                url,
                headers=self._headers(),
                json=GAWAH_ASSISTANT_CONFIG,
            )
            if response.status_code >= 400:
                return {
                    "ok": False,
                    "detail": response.text,
                    "status_code": response.status_code,
                }
            data = response.json()
            assistant_id = (
                data.get("realtimeAssistantId")
                or data.get("assistantId")
                or data.get("id")
            )
            return {"ok": True, "assistantId": assistant_id, "raw": data}

    def _web_adhoc_config(self) -> Dict[str, Any]:
        """
        Full Gawah agent config for browser WebRTC, with phone-parity channel notes.

        Phone uses additionalInstructions on POST /calls (additive).
        Adhoc createSession has no additionalInstructions field — so we prepend
        WEB_CALL_INSTRUCTIONS onto the base Phase 0–4 prompt here.

        Do NOT replace instructions from the React client via updateInstruction:
        that API replaces the entire system prompt and kills greeting + interview flow.
        """
        config = copy.deepcopy(GAWAH_ASSISTANT_CONFIG.get("config") or {})
        agent = config.setdefault("agent", {})
        base = (agent.get("instructions") or "").strip()
        channel = WEB_CALL_INSTRUCTIONS.strip()
        if channel and channel not in base:
            agent["instructions"] = f"{channel}\n\n{base}" if base else channel
        agent["initialGreeting"] = True
        if not agent.get("greetingInstructions"):
            agent["greetingInstructions"] = (
                "السلام علیکم۔ میں گواہ سسٹم ہوں — آپ گواہ ہیں۔ "
                "کیا آپ اپنا بیان دینا چاہتے ہیں؟ تمام بات اردو نستعلیق میں بولیں۔"
            )
        # Prefer configured TTS voice (same as readback / Pakistan demos)
        tts = config.setdefault("tts", {}).setdefault("default", {})
        if self.settings.uplift_tts_voice_id:
            tts["voiceId"] = self.settings.uplift_tts_voice_id
        # Keep STT on Urdu so live witness captions match spoken language
        stt = config.setdefault("stt", {}).setdefault("default", {})
        stt["language"] = "ur"
        return config

    async def create_adhoc_web_session(
        self, participant_name: str = "Witness"
    ) -> Dict[str, Any]:
        """
        Web demo path: adhoc session with full current GAWAH config.

        Guarantees latest instructions + tool schemas even if the persisted
        assistant is stale. Client still registers tool handlers via React SDK.
        """
        if not self.enabled:
            return {"ok": False, "detail": "Uplift not configured"}

        url = (
            f"{self.settings.uplift_base_url.rstrip('/')}"
            f"/realtime-assistants/adhoc/createSession"
        )
        config = self._web_adhoc_config()
        body = {
            "participantName": participant_name,
            "config": config,
        }
        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                response = await client.post(url, headers=self._headers(), json=body)
                if response.status_code >= 400:
                    return {
                        "ok": False,
                        "detail": response.text[:500],
                        "status_code": response.status_code,
                    }
                data = response.json()
                session_id = (
                    data.get("sessionId")
                    or data.get("session_id")
                    or data.get("id")
                    or data.get("roomName")
                    or data.get("room")
                )
                return {
                    "ok": True,
                    "demo": False,
                    "adhoc": True,
                    "token": data.get("token") or data.get("accessToken"),
                    "wsUrl": data.get("wsUrl") or data.get("serverUrl") or data.get("url"),
                    "roomName": data.get("roomName") or data.get("room"),
                    "sessionId": session_id,
                    "assistantId": "adhoc",
                    "raw": data,
                }
        except httpx.HTTPError as exc:
            return {"ok": False, "detail": str(exc)}

    async def create_session(
        self, participant_name: str = "Witness"
    ) -> Dict[str, Any]:
        # Prefer adhoc web session with fresh Gawah config (parity with phone prompt/tools)
        if self.enabled:
            adhoc = await self.create_adhoc_web_session(participant_name)
            if adhoc.get("ok") and adhoc.get("token") and adhoc.get("wsUrl"):
                return adhoc

        assistant = await self.ensure_assistant()
        assistant_id = assistant.get("assistantId") or self.settings.uplift_assistant_id

        if not self.enabled or not assistant_id or str(assistant_id).startswith("demo"):
            # Offline demo session so frontend can proceed (web recorder still works)
            room = f"gawah-demo-{participant_name.replace(' ', '-').lower()}"
            return {
                "ok": True,
                "demo": True,
                "token": "demo-session-token",
                "wsUrl": "wss://demo.local/gawah",
                "roomName": room,
                "sessionId": f"web-{room}",
                "assistantId": assistant_id or "demo-assistant",
            }

        url = (
            f"{self.settings.uplift_base_url.rstrip('/')}"
            f"/realtime-assistants/{assistant_id}/createSession"
        )
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(
                    url,
                    headers=self._headers(),
                    json={"participantName": participant_name},
                )
                if response.status_code >= 400:
                    # Fall back to tracked web-recorder session for demos
                    room = f"gawah-demo-{participant_name.replace(' ', '-').lower()}"
                    return {
                        "ok": True,
                        "demo": True,
                        "token": "demo-session-token",
                        "wsUrl": "wss://demo.local/gawah",
                        "roomName": room,
                        "sessionId": f"web-{room}",
                        "assistantId": assistant_id,
                        "detail": response.text[:300],
                        "status_code": response.status_code,
                    }
                data = response.json()
                session_id = (
                    data.get("sessionId")
                    or data.get("session_id")
                    or data.get("id")
                    or data.get("roomName")
                    or data.get("room")
                )
                return {
                    "ok": True,
                    "demo": False,
                    "token": data.get("token") or data.get("accessToken"),
                    "wsUrl": data.get("wsUrl") or data.get("serverUrl") or data.get("url"),
                    "roomName": data.get("roomName") or data.get("room"),
                    "sessionId": session_id,
                    "assistantId": assistant_id,
                    "raw": data,
                }
        except httpx.HTTPError as exc:
            room = f"gawah-demo-{participant_name.replace(' ', '-').lower()}"
            return {
                "ok": True,
                "demo": True,
                "token": "demo-session-token",
                "wsUrl": "wss://demo.local/gawah",
                "roomName": room,
                "sessionId": f"web-{room}",
                "assistantId": assistant_id,
                "detail": f"Uplift unreachable — web recorder available: {exc}",
            }

    async def synthesize_speech(self, text: str) -> bytes:
        if not self.enabled:
            return b""

        url = f"{self.settings.uplift_base_url.rstrip('/')}/synthesis/text-to-speech"
        # Prefer stream endpoint if binary response expected
        payload = {
            "voiceId": self.settings.uplift_tts_voice_id,
            "text": text[:10000],
            "outputFormat": self.settings.uplift_tts_output_format,
        }
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(url, headers=self._headers(), json=payload)
            if response.status_code >= 400:
                # Fallback to stream endpoint
                stream_url = (
                    f"{self.settings.uplift_base_url.rstrip('/')}"
                    "/synthesis/text-to-speech/stream"
                )
                response = await client.post(
                    stream_url, headers=self._headers(), json=payload
                )
            response.raise_for_status()
            return response.content

    async def store_readback_audio(self, ref_code: str, text: str) -> Optional[str]:
        # Never block statement persistence on TTS outages
        try:
            audio = await self.synthesize_speech(text)
        except Exception:
            return None
        if not audio:
            return None

        path = Path(self.settings.local_audio_dir) / ref_code
        path.mkdir(parents=True, exist_ok=True)
        file_path = path / "readback.mp3"
        file_path.write_bytes(audio)

        # Supabase storage upload when configured. Bucket must be the private
        # `readback-audio` bucket that actually exists — a `statements` bucket
        # was targeted here previously and doesn't exist, so every upload
        # silently failed and fell through to the (ephemeral, on Vercel)
        # local file below. See app/db/database.py's READBACK_AUDIO_BUCKET /
        # STORAGE_URL_PREFIX and the /audio-url route in routers/statements.py
        # for how this value is later turned into a signed URL.
        if self.settings.use_supabase:
            try:
                from app.db.database import READBACK_AUDIO_BUCKET, STORAGE_URL_PREFIX
                from supabase import create_client

                client = create_client(
                    self.settings.supabase_url,
                    self.settings.supabase_anon_or_service_key,
                )
                storage_path = f"{ref_code}/readback.mp3"
                client.storage.from_(READBACK_AUDIO_BUCKET).upload(
                    storage_path,
                    audio,
                    {"content-type": "audio/mpeg", "upsert": "true"},
                )
                return f"{STORAGE_URL_PREFIX}{storage_path}"
            except Exception:
                pass

        return str(file_path)

    async def transcribe(self, file_bytes: bytes, filename: str = "recording.mp3") -> Dict[str, Any]:
        if not self.enabled:
            return {"ok": False, "transcript": "", "detail": "Uplift key missing"}

        url = f"{self.settings.uplift_base_url.rstrip('/')}/transcribe/speech-to-text"
        headers = {"Authorization": f"Bearer {self.settings.upliftai_api_key}"}
        files = {"file": (filename, file_bytes, "audio/mpeg")}
        data = {"model": "scribe", "language": "ur"}
        async with httpx.AsyncClient(timeout=120.0) as client:
            response = await client.post(url, headers=headers, files=files, data=data)
            if response.status_code >= 400:
                return {"ok": False, "detail": response.text}
            payload = response.json()
            return {
                "ok": True,
                "transcript": payload.get("text") or payload.get("transcript") or "",
                "raw": payload,
            }

    async def place_call(
        self,
        to: str,
        *,
        additional_instructions: Optional[str] = None,
        variables: Optional[Dict[str, Any]] = None,
        idempotency_key: Optional[str] = None,
    ) -> Dict[str, Any]:
        assistant = await self.ensure_assistant()
        assistant_id = assistant.get("assistantId") or self.settings.uplift_assistant_id
        if not self.enabled or not assistant_id:
            return {
                "ok": False,
                "detail": (
                    "Uplift calling not configured. Set UPLIFTAI_API_KEY and "
                    "UPLIFT_BASE_URL=https://ap-southeast-1.api.upliftai.org/v1"
                ),
            }

        url = f"{self.settings.uplift_base_url.rstrip('/')}/calls"
        headers = self._headers()
        if idempotency_key:
            headers["Idempotency-Key"] = idempotency_key[:256]
        body: Dict[str, Any] = {"assistantId": assistant_id, "to": to}
        if additional_instructions:
            body["additionalInstructions"] = additional_instructions[:2000]
        if variables:
            body["variables"] = variables

        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(url, headers=headers, json=body)
                if response.status_code >= 400:
                    return {
                        "ok": False,
                        "status_code": response.status_code,
                        "detail": response.text,
                    }
                data = response.json()
                return {
                    "ok": True,
                    "callId": data.get("callId") or data.get("id"),
                    "status": data.get("status", "dispatched"),
                    "assistantId": assistant_id,
                    "to": to,
                    "raw": data,
                }
        except httpx.HTTPError as exc:
            return {"ok": False, "status_code": 502, "detail": f"Uplift call request failed: {exc}"}

    async def list_call_sessions(self, *, limit: int = 10) -> Dict[str, Any]:
        """Poll recent realtime-assistant sessions (includes outbound call states)."""
        assistant = await self.ensure_assistant()
        assistant_id = assistant.get("assistantId") or self.settings.uplift_assistant_id
        if not self.enabled or not assistant_id:
            return {"ok": False, "items": [], "detail": "Uplift not configured"}

        limit = max(1, min(limit, 50))
        url = (
            f"{self.settings.uplift_base_url.rstrip('/')}"
            f"/realtime-assistants/{assistant_id}/sessions"
        )
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(
                url,
                headers=self._headers(),
                params={"limit": limit},
            )
            if response.status_code >= 400:
                return {
                    "ok": False,
                    "items": [],
                    "status_code": response.status_code,
                    "detail": response.text,
                }
            data = response.json()
            items = data if isinstance(data, list) else data.get("sessions") or data.get("items") or []
            return {"ok": True, "assistantId": assistant_id, "items": items, "raw": data}

    async def get_session(self, session_id: str) -> Dict[str, Any]:
        """
        Fetch a single realtime session (call) by id.

        Documented path (verified live):
        GET /v1/realtime-assistants/sessions/{sessionId}
        """
        if not self.enabled:
            return {"ok": False, "detail": "Uplift not configured"}
        if not session_id or str(session_id).startswith("failed-"):
            return {"ok": False, "detail": "Invalid session id"}

        url = (
            f"{self.settings.uplift_base_url.rstrip('/')}"
            f"/realtime-assistants/sessions/{session_id}"
        )
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.get(url, headers=self._headers())
                if response.status_code >= 400:
                    return {
                        "ok": False,
                        "status_code": response.status_code,
                        "detail": response.text,
                    }
                data = response.json()
                artifacts = self.extract_session_artifacts(data)
                return {"ok": True, "session": data, "artifacts": artifacts}
        except httpx.HTTPError as exc:
            return {"ok": False, "status_code": 502, "detail": str(exc)}

    @staticmethod
    def _first_urlish(value: Any) -> Optional[str]:
        if isinstance(value, str) and value.startswith(("http://", "https://")):
            return value
        if isinstance(value, dict):
            for key in (
                "url",
                "href",
                "downloadUrl",
                "download_url",
                "signedUrl",
                "signed_url",
                "recordingUrl",
                "recording_url",
            ):
                candidate = value.get(key)
                if isinstance(candidate, str) and candidate.startswith(("http://", "https://")):
                    return candidate
        return None

    @classmethod
    def extract_session_artifacts(cls, session: Dict[str, Any]) -> Dict[str, Any]:
        """
        Pull recording / transcript / analysis if Uplift attached them.

        Hackathon docs note these are generated asynchronously after the call
        ends; nested /recording|/transcript routes currently 404, so we scan
        the session payload (and common nested bags) defensively.
        """
        bags: List[Dict[str, Any]] = [session]
        for nest in ("artifacts", "media", "recording", "analysis", "data", "result"):
            nested = session.get(nest)
            if isinstance(nested, dict):
                bags.append(nested)

        recording_url = None
        transcript: Any = None
        analysis: Any = None

        for bag in bags:
            if recording_url is None:
                for key in _RECORDING_KEYS:
                    if key in bag:
                        recording_url = cls._first_urlish(bag.get(key)) or recording_url
                        if recording_url:
                            break
            if transcript is None:
                for key in _TRANSCRIPT_KEYS:
                    if bag.get(key) not in (None, "", []):
                        transcript = bag.get(key)
                        break
            if analysis is None:
                for key in _ANALYSIS_KEYS:
                    if bag.get(key) not in (None, "", []):
                        analysis = bag.get(key)
                        break

        if isinstance(transcript, dict):
            transcript = (
                transcript.get("text")
                or transcript.get("transcript")
                or transcript.get("content")
                or transcript
            )

        available = bool(recording_url or transcript or analysis)
        return {
            "recording_url": recording_url,
            "transcript": transcript,
            "analysis": analysis,
            "artifacts_available": available,
            "artifacts_status": "ready" if available else "pending_or_unavailable",
        }

    async def download_recording(
        self,
        call_id: str,
        recording_url: str,
    ) -> Dict[str, Any]:
        """Download a remote recording URL into local_audio_dir/calls/{call_id}/."""
        if not recording_url:
            return {"ok": False, "detail": "No recording URL"}

        dest_dir = Path(self.settings.local_audio_dir) / "calls" / call_id
        dest_dir.mkdir(parents=True, exist_ok=True)

        parsed = urlparse(recording_url)
        suffix = Path(parsed.path).suffix or ".mp3"
        if suffix not in {".mp3", ".wav", ".ogg", ".m4a", ".webm"}:
            suffix = ".mp3"
        dest = dest_dir / f"recording{suffix}"

        headers = {}
        # Some signed URLs reject Authorization; only send for same-host Uplift APIs.
        if "upliftai.org" in (parsed.netloc or ""):
            headers["Authorization"] = f"Bearer {self.settings.upliftai_api_key}"

        try:
            async with httpx.AsyncClient(timeout=120.0, follow_redirects=True) as client:
                response = await client.get(recording_url, headers=headers)
                if response.status_code >= 400:
                    return {
                        "ok": False,
                        "status_code": response.status_code,
                        "detail": response.text[:500],
                    }
                ctype = response.headers.get("content-type", "")
                if "audio" in ctype or "octet" in ctype or len(response.content) > 1000:
                    guessed = mimetypes.guess_extension(ctype.split(";")[0].strip()) if ctype else None
                    if guessed and guessed in {".mp3", ".wav", ".ogg", ".m4a", ".webm"}:
                        dest = dest_dir / f"recording{guessed}"
                    dest.write_bytes(response.content)
                    return {
                        "ok": True,
                        "local_path": str(dest),
                        "bytes": len(response.content),
                        "content_type": ctype or "audio/mpeg",
                    }
                return {
                    "ok": False,
                    "detail": f"Unexpected content-type: {ctype}",
                    "preview": response.text[:200],
                }
        except httpx.HTTPError as exc:
            return {"ok": False, "detail": str(exc)}

    async def enrich_call_from_uplift(
        self,
        call_id: str,
        *,
        download: bool = True,
    ) -> Dict[str, Any]:
        """Fetch session detail + optional recording download for a tracked call."""
        detail = await self.get_session(call_id)
        if not detail.get("ok"):
            return detail
        session = detail["session"]
        artifacts = detail.get("artifacts") or self.extract_session_artifacts(session)
        local_path = None
        if download and artifacts.get("recording_url"):
            saved = await self.download_recording(call_id, artifacts["recording_url"])
            if saved.get("ok"):
                local_path = saved.get("local_path")
                artifacts["local_recording_path"] = local_path
                artifacts["artifacts_status"] = "downloaded"
            else:
                artifacts["download_error"] = saved.get("detail")
                artifacts["artifacts_status"] = "url_only"
        return {
            "ok": True,
            "session": session,
            "artifacts": artifacts,
            "local_recording_path": local_path,
        }


_uplift: UpliftService | None = None


def get_uplift_service() -> UpliftService:
    global _uplift
    if _uplift is None:
        _uplift = UpliftService()
    return _uplift
