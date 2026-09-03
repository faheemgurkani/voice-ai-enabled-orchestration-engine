import os
from functools import lru_cache
from pathlib import Path
from typing import List, Tuple

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

_REPO_ROOT = Path(__file__).resolve().parents[2]
_BACKEND_DIR = Path(__file__).resolve().parents[1]
# Vercel Functions have a writable /tmp only; local JSON/audio must not use the bundle tree.
_ON_VERCEL = os.environ.get("VERCEL") == "1"
_DEFAULT_LOCAL_DB = (
    "/tmp/gawah/gawah_store.json"
    if _ON_VERCEL
    else str(_BACKEND_DIR / "data" / "gawah_store.json")
)
_DEFAULT_LOCAL_AUDIO = (
    "/tmp/gawah/audio" if _ON_VERCEL else str(_BACKEND_DIR / "data" / "audio")
)


def _env_files() -> Tuple[str, ...]:
    files = []
    for path in (_REPO_ROOT / ".env", _BACKEND_DIR / ".env"):
        if path.exists():
            files.append(str(path))
    return tuple(files) or (".env",)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=_env_files(),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_name: str = "Voice AI Enabled Orchestration Engine (Gawah)"
    app_env: str = "development"
    debug: bool = True
    cors_origins: str = "http://localhost:3000,http://localhost:5173"

    # Uplift AI — Singapore for Pakistan latency + phone calling
    upliftai_api_key: str = ""
    uplift_assistant_id: str = ""
    uplift_base_url: str = "https://ap-southeast-1.api.upliftai.org/v1"
    # Male Standard Urdu (Defense Advocate) — clear legal register for §161 intake
    uplift_tts_voice_id: str = "defense-advocate"
    uplift_tts_output_format: str = "MP3_22050_128"

    # OpenRouter (primary LLM)
    openrouter_api_key: str = ""
    openrouter_model: str = "deepseek/deepseek-v4-flash-0731"
    openrouter_base_url: str = "https://openrouter.ai/api/v1"

    # Groq (optional fallback)
    groq_api_key: str = ""
    groq_model: str = "openai/gpt-oss-120b"

    # OpenAI optional fallback
    openai_api_key: str = ""
    openai_model: str = "gpt-4o"

    # Google Gemini (optional LLM — does not replace OpenRouter/Groq)
    gemini_api_key: str = ""
    gemini_model: str = "gemini-2.5-flash"

    # Google Cloud Speech/TTS (optional — does not replace Uplift STT/TTS)
    google_application_credentials: str = ""
    google_cloud_project_id: str = ""
    google_stt_language_code: str = "ur-PK"
    google_tts_language_code: str = "ur-IN"
    google_tts_voice_name: str = ""
    google_tts_speaking_rate: float = 1.0

    # Supabase
    supabase_url: str = ""
    supabase_key: str = ""
    supabase_service_key: str = ""

    # Auth — dashboard/staff identity. Witnesses never authenticate.
    # Access tokens are ES256, verified against the project JWKS. Never HS256:
    # a shared secret in this process could mint staff tokens if it ever leaked.
    supabase_jwt_audience: str = "authenticated"
    jwks_cache_seconds: int = 600
    # Local escape hatch so the JSON-store dev loop survives gated routes.
    # Refuses to engage when app_env is production (see auth.dev_bypass_active).
    dev_auth_bypass: bool = False
    dev_user_id: str = "00000000-0000-0000-0000-000000000000"
    dev_user_email: str = "dev@gawah.local"

    # Twilio (optional PSTN bridge)
    twilio_account_sid: str = ""
    twilio_auth_token: str = ""
    twilio_phone_number: str = ""

    # NGO escalation
    ngo_webhook_url: str = ""

    # Cloudflare Turnstile — abuse gate on outbound "call me" (POST /api/sessions/call)
    # and optionally on Supabase Auth sign-in/up. Unset by default: verification
    # is skipped (not required) until a real secret key is configured, so this
    # never blocks local dev / a fresh clone. See docs/DEPLOYMENT.md.
    turnstile_secret_key: str = ""

    # Abuse-prevention limits for POST /api/sessions/call — a free, unauthenticated
    # endpoint that dials a real +92 number via Uplift, otherwise anyone can use it
    # to harass a number for free on this project's Uplift bill.
    call_cooldown_seconds: int = 600
    call_max_per_hour_global: int = 20

    case_id_secret: str = "change-me-in-production"
    # Absolute defaults so cwd (repo root vs gawah-backend) does not fork the store.
    # On Vercel, defaults land in /tmp (ephemeral across cold starts without Supabase).
    local_db_path: str = _DEFAULT_LOCAL_DB
    local_audio_dir: str = _DEFAULT_LOCAL_AUDIO

    @field_validator("debug", mode="before")
    @classmethod
    def parse_debug(cls, value: object) -> bool:
        if isinstance(value, str):
            return value.strip().lower() in {"1", "true", "yes", "on"}
        return bool(value)

    @field_validator("local_db_path", mode="before")
    @classmethod
    def default_db_path(cls, value: object) -> str:
        # A blank env var must mean "unset", not "use the empty string". Vercel
        # exports declared-but-empty variables, and an empty path made the app
        # try to mkdir('') on a read-only filesystem, killing startup.
        if not isinstance(value, str) or not value.strip():
            return _DEFAULT_LOCAL_DB
        return value.strip()

    @field_validator("local_audio_dir", mode="before")
    @classmethod
    def default_audio_dir(cls, value: object) -> str:
        if not isinstance(value, str) or not value.strip():
            return _DEFAULT_LOCAL_AUDIO
        return value.strip()

    @property
    def cors_origin_list(self) -> List[str]:
        origins = [o.strip() for o in self.cors_origins.split(",") if o.strip()]
        # Always allow known Vercel UI hosts so frontend rebrands don't break CORS.
        for host in (
            "https://upliftaixreplit-gawah.vercel.app",
        ):
            if host not in origins:
                origins.append(host)
        return origins or ["*"]

    @property
    def use_supabase(self) -> bool:
        key = self.supabase_service_key or self.supabase_key
        return bool(self.supabase_url and key)

    @property
    def supabase_anon_or_service_key(self) -> str:
        return self.supabase_service_key or self.supabase_key

    @property
    def jwks_url(self) -> str:
        return f"{self.supabase_url.rstrip('/')}/auth/v1/.well-known/jwks.json"

    @property
    def auth_enabled(self) -> bool:
        """Auth can only be enforced once a Supabase project is configured."""
        return bool(self.supabase_url)

    @property
    def uplift_enabled(self) -> bool:
        return bool(self.upliftai_api_key)

    @property
    def openrouter_enabled(self) -> bool:
        return bool(self.openrouter_api_key)

    @property
    def groq_enabled(self) -> bool:
        return bool(self.groq_api_key)

    @property
    def gemini_enabled(self) -> bool:
        return bool(self.gemini_api_key)

    @property
    def turnstile_enabled(self) -> bool:
        return bool(self.turnstile_secret_key)

    @property
    def google_cloud_enabled(self) -> bool:
        creds = self.google_application_credentials or os.environ.get(
            "GOOGLE_APPLICATION_CREDENTIALS", ""
        )
        return bool(creds.strip())

    @property
    def llm_enabled(self) -> bool:
        return (
            self.openrouter_enabled
            or self.groq_enabled
            or bool(self.openai_api_key)
            or self.gemini_enabled
        )


@lru_cache
def get_settings() -> Settings:
    return Settings()
