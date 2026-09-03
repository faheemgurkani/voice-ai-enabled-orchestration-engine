from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app import __version__
from app.config import get_settings
from app.db.database import get_db
from app.routers import dashboard, internal, kpis, sessions, statements, tools, waitlist


@asynccontextmanager
async def lifespan(_: FastAPI):
    db = get_db()
    # Vercel /tmp (and empty local stores) need the 3-statement demo tour for UX.
    try:
        from app.services.demo_seed import ensure_demo_seed

        ensure_demo_seed(db)
    except Exception:  # noqa: BLE001 — never block API boot on seed failures
        pass
    yield


settings = get_settings()

app = FastAPI(
    title=settings.app_name,
    version=__version__,
    description=(
        "Voice AI Enabled Orchestration Engine (Gawah) — CrPC §161 voice witness "
        "statements for Pakistan. Uplift AI realtime + OpenRouter structuring + "
        "consistency/corroboration engines."
    ),
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(sessions.router)
app.include_router(tools.router)
app.include_router(statements.router)
app.include_router(dashboard.router)
app.include_router(internal.router)
app.include_router(kpis.router)
app.include_router(waitlist.router)


@app.get("/")
async def root():
    return {
        "name": settings.app_name,
        "version": __version__,
        "status": "ok",
        "docs": "/docs",
        "stack": {
            "voice": "Uplift AI Realtime Assistants + TTS/STT",
            "llm": "Groq openai/gpt-oss-120b",
            "db": "Supabase or local JSON",
        },
    }


def _health_payload():
    db = get_db()
    return {
        "status": "healthy",
        "env": settings.app_env,
        "db_backend": db.backend,
        "uplift_configured": settings.uplift_enabled,
        "openrouter_configured": settings.openrouter_enabled,
        "openrouter_model": settings.openrouter_model if settings.openrouter_enabled else None,
        "groq_configured": settings.groq_enabled,
        "gemini_configured": settings.gemini_enabled,
        "gemini_model": settings.gemini_model if settings.gemini_enabled else None,
        "google_cloud_configured": settings.google_cloud_enabled,
        "llm_enabled": settings.llm_enabled,
        "assistant_id_set": bool(settings.uplift_assistant_id),
    }


@app.get("/health")
async def health():
    return _health_payload()


@app.get("/api/healthz")
async def healthz():
    """Frontend / Replit compatibility alias."""
    return _health_payload()
