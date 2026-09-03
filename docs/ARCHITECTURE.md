# Architecture — Voice AI Enabled Orchestration Engine (Gawah)

**Gawah (گواہ)** is the witness product; this repo is the voice-AI orchestration stack that powers it. Originated at the **Uplift AI × Replit Voice AI Hackathon (2026)**.

> This file previously described a Vapi + Next.js + OpenAI architecture. That was superseded by the Uplift AI / FastAPI / Vite stack below; `app/routers/vapi.py` and `client/` are the only leftovers from that era, kept unregistered/unreferenced in the tree.

## Overview

```text
[Witness phone/browser] --> [Uplift AI Realtime (WebRTC/PSTN, Singapore)]
                                       |
                                       v
                        [gawah-backend FastAPI] (app/main.py)
                                       |
                +----------------------+----------------------+
                v                      v                       v
   [OpenRouter/Groq/Gemini LLM]  [Supabase Postgres      [ReportLab PDF]
                                   or local JSON]
                                       |
                          [Supabase Auth — staff login only]
                                       |
                                       v
             [frontend/artifacts/gawah-frontend — Vite/React dashboard]
```

Live voice (WebRTC / PSTN) goes directly between the browser/phone and Uplift AI in Singapore — it does not proxy through the FastAPI backend or Vercel.

## Components

| Component | Responsibility | Status |
|-----------|----------------|--------|
| `gawah-backend/` | FastAPI: session lifecycle, agent tool calls, statement structuring, consistency/corroboration engines, PDF, staff auth | Implemented, deployed |
| `frontend/artifacts/gawah-frontend/` | Vite/React officer dashboard + witness web-call demo | Implemented, deployed |
| Supabase project `gawah` | Postgres (6 tables, RLS), Auth (staff only, ES256 JWT), Storage (`readback-audio` bucket) | Implemented; row counts near-zero, see CLAUDE.md for live state |
| `client/` | Older Next.js dashboard prototype | Unused reference only, not deployed |
| `shared/` | Shared types & constants | Placeholder |

## Data flow

1. Witness starts a session — web (`POST /api/sessions/create`, WebRTC via `@upliftai/assistants-react`) or phone (`POST /api/sessions/call`, outbound PSTN).
2. Uplift AI streams STT/dialogue; agent tool calls hit `/api/tools/*` (`save_witness_statement`, `flag_inconsistency`, `flag_intimidation`, `enable_privacy_mode`, `assess_protection_need`, `confirm_statement`).
3. Web sessions additionally upload the mic recording (`POST /api/sessions/web/{id}/recording`) for STT → §161 structuring → statement save, returning a 6-char `ref_code`.
4. `consistency_engine.py` and `corroboration_engine.py` run against stored statements; results surface via `GET /api/dashboard/*` and `GET /api/kpis`.
5. Staff sign in via Supabase Auth (email/password, ES256 JWT) and open `/dashboard`; the SPA attaches the token, FastAPI verifies it locally against the project JWKS (`app/auth.py`) before returning full statement data. Witnesses never authenticate — the `ref_code` alone is their capability.
6. PDFs (statement, protection referral) generated via `pdf_service.py`, also staff-gated.

Full authentication design, gated-route list, and known gaps: see the **Authentication** section of the repo-root `CLAUDE.md`.

## Key decisions

- Voice / call orchestration: **Uplift AI** (Singapore region) — WebRTC + outbound PSTN, STT, TTS
- LLM: **OpenRouter** (`deepseek/deepseek-v4-flash-0731`) primary, Groq/Gemini/OpenAI optional fallbacks, heuristic fallback with no key at all
- PDF: ReportLab, §161-style printable
- DB: Supabase Postgres (RLS-defined, not yet RLS-enforced at the app layer — see CLAUDE.md) or local JSON fallback
- Staff identity: Supabase Auth, ES256 JWT verified locally via JWKS — no shared secret, no per-request Auth-server round trip
- Backend host: Vercel (Python serverless function, Root Directory `gawah-backend`); `railway.toml` kept as an alternate-host option, not in active use
- Frontend host: Vercel (static Vite SPA)

## Risks & mitigations

| Risk | Mitigation |
|------|------------|
| Latency | Stream responses; keep prompts short; Singapore region matches Uplift + Supabase |
| Mic permissions | Clear UI copy + fallback text input |
| API limits | Cache where safe; demos use short sessions |
| Ephemeral `/tmp` storage on Vercel cold start | Supabase Postgres for structured data; readback audio → Storage migration still pending (known gap, see CLAUDE.md) |
| Workspace data isolation | RLS policies exist on all tables but the backend currently reads/writes with the service-role key, bypassing them — deferred to Phase 2, not yet a live guarantee |
