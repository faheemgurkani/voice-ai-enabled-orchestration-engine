# Gawah Backend — Voice AI Enabled Orchestration Engine

FastAPI orchestration layer for **Gawah (گواہ)**, part of the **Voice AI Enabled Orchestration Engine (Gawah)** project (originated at the Uplift AI × Replit Voice AI Hackathon 2026).

- Uplift AI Realtime Assistants + TTS/STT (Singapore region)
- Adhoc web sessions with full Phase 0–4 instructions + tools
- Web recording pipeline (mic upload → STT → §161 structure → statement)
- Live dialogue persistence (Agent / گواہ turns from the browser)
- Five CrPC §161 tool handlers
- Consistency engine (realtime + post-call)
- Multi-witness corroboration + collusion warning
- Witness protection referral generation
- KPI / ROI proxies + edge-case coverage metrics
- NGO lawyer dashboard APIs

## Prefer the repo setup script

From repo root (macOS / Windows / Linux):

```bash
python scripts/setup.py install
python scripts/setup.py dev
# or API only:
python scripts/setup.py backend
```

Teammate guide: [`../docs/LOCAL_SETUP.md`](../docs/LOCAL_SETUP.md).

## Run (manual)

```bash
# from repo root
source .venv/bin/activate          # Windows: .venv\Scripts\activate
.venv/bin/pip install -r gawah-backend/requirements.txt
cp gawah-backend/.env.example gawah-backend/.env

.venv/bin/uvicorn app.main:app --app-dir gawah-backend --reload --host 0.0.0.0 --port 8000
```

Docs: http://localhost:8000/docs

## Production (Vercel)

| | URL |
|---|-----|
| API | https://gawah-backend.vercel.app |
| Health | https://gawah-backend.vercel.app/health |
| Swagger | https://gawah-backend.vercel.app/docs |

Deploy from `gawah-backend/` with framework **FastAPI**. See [`../docs/DEPLOYMENT.md`](../docs/DEPLOYMENT.md) for env vars, CORS, and CLI steps. Demo seed runs automatically on startup when using local JSON (including Vercel `/tmp`).

## Environment (important)

Authoritative file: **`gawah-backend/.env`** (template: `.env.example`).

| Variable | Purpose |
|----------|---------|
| `UPLIFTAI_API_KEY` | Live WebRTC + PSTN + STT/TTS |
| `UPLIFT_BASE_URL` | Must be Singapore: `https://ap-southeast-1.api.upliftai.org/v1` |
| `UPLIFT_ASSISTANT_ID` | Optional; `ensure_assistant()` creates/syncs |
| `UPLIFT_TTS_VOICE_ID` | Default **`defense-advocate`** (male Standard Urdu) |
| `UPLIFT_TTS_OUTPUT_FORMAT` | Default `MP3_22050_128` |
| `OPENROUTER_API_KEY` | Statement structuring / flags |
| `GEMINI_API_KEY` | Optional Gemini LLM (see [`../docs/GOOGLE_AI_INTEGRATION.md`](../docs/GOOGLE_AI_INTEGRATION.md)) |
| `GOOGLE_APPLICATION_CREDENTIALS` | Optional Cloud STT/TTS service account JSON |
| `CORS_ORIGINS` | Include `http://localhost:5173` for the Vite app |
| `SUPABASE_URL` / `SUPABASE_SERVICE_KEY` | Enables Postgres persistence + staff auth gating (see below). Without these, gated routes fail closed (503), not open |
| `DEV_AUTH_BYPASS` | Local-only escape hatch to skip JWT verification with a fixed dev user; hard-disabled when `APP_ENV=production` |

Agent prompts live in `app/prompts/` (`agent_instructions.txt`, `agent_config.py`). Language lock: spoken lines in **Urdu Nastaliq** so LiveKit captions match audio.

## Authentication (staff/dashboard only)

Witnesses never authenticate — their 6-char `ref_code` is the only credential. Staff/dashboard users sign in via **Supabase Auth** (email/password); FastAPI verifies the resulting ES256 JWT locally against the project JWKS (`app/auth.py`), with no shared secret and no per-request round trip to the Auth server.

Gated (require a valid staff token): `/api/dashboard/*`, `GET /api/kpis`, `POST /api/statements/{ref}/review`, `GET /api/statements/{ref}?full=true`, `POST /api/statements/{ref}/pdf`, `GET /api/statements/{ref}/protection-pdf`, and the staff routes under `/api/sessions/` (`/activity`, `/calls`, `/calls/{id}`, `/calls/{id}/process-statement`, `/calls/{id}/refresh-artifacts`).

Left open by design: the voice pipeline (`/api/tools/*`, `/api/sessions/create`, `/api/sessions/call`, `/api/sessions/web/*`, `/api/sessions/twilio-webhook`), the default (`full=false`) ref-code lookup, and `GET /api/statements/{ref}/audio` (a known gap — `<audio src>` can't carry an `Authorization` header; fix is a signed URL from the private `readback-audio` Supabase Storage bucket, not yet wired).

Full design, verified test results, and current live gaps (workspace scoping not enforced, RLS defined but not applied at the app layer, storage bucket bug): see the **Authentication** section of the repo-root `CLAUDE.md`.

## Demo seed

```bash
python scripts/setup.py seed
# or:
.venv/bin/python gawah-backend/scripts/seed_demo.py --replace
```

Seeds refs **NBRA7K**, **SHPK2M**, **NBRC9Q** + Hussain Abad cluster + linked calls.

## Smoke test

```bash
.venv/bin/python gawah-backend/scripts/smoke_test.py
```

## Google AI (optional)

Gemini LLM + Cloud Speech/TTS are available **alongside** Uplift and OpenRouter — not wired as defaults.

| Service | Module | Probe |
|---------|--------|-------|
| Gemini API | `app/services/gemini_service.py` | `scripts/google_services_test.py` |
| Cloud STT | `app/services/google_stt_service.py` | same |
| Cloud TTS | `app/services/google_tts_service.py` | same |

Full setup, env vars, and code examples: [`../docs/GOOGLE_AI_INTEGRATION.md`](../docs/GOOGLE_AI_INTEGRATION.md).

```bash
.venv/bin/python gawah-backend/scripts/google_services_test.py
```

## Web browser path

1. `POST /api/sessions/create` → adhoc session (`token`, `wsUrl`, `callId`)
2. Frontend connects with `@upliftai/assistants-react` (`UpliftAIRoom`)
3. Live captions from LiveKit transcriptions (Agent / گواہ)
4. Continuous MediaRecorder on the witness mic
5. `POST /api/sessions/web/{callId}/recording` — multipart:
   - `file` — audio (`webm` / etc.)
   - `language` — default `ur`
   - `participantName` — default `Witness`
   - `dialogue` — optional JSON array `[{ "role": "agent"|"witness", "text", "id?", "at?" }]`
6. Pipeline: save audio → STT → structure §161 → save statement → return `ref_code`, `transcript`, `dialogue`
7. `POST /api/sessions/web/{callId}/complete` — mark ended + ensure dashboard statement

Implementation: `app/services/web_call_pipeline.py`, router `app/routers/sessions.py`.

## Phone calling (PSTN)

Uplift AI places **outbound** calls to Pakistani mobiles only (Singapore region). You do **not** need your own caller ID.

### Call me (easiest)

1. Backend running with `UPLIFTAI_API_KEY` and Singapore `UPLIFT_BASE_URL`
2. Open frontend **Demo → Phone call**, enter `+92…` / `03…`, click **Call me**
3. Answer the phone — Gawah runs the §161 interview
4. Or via API:

```bash
curl -X POST http://localhost:8000/api/sessions/call \
  -H 'Content-Type: application/json' \
  -d '{"to":"+923001234567","participantName":"Witness"}'
```

Poll status: `GET /api/sessions/calls`  
Force pull artifacts: `POST /api/sessions/calls/{callId}/refresh-artifacts`  
Cached recording: `GET /api/sessions/calls/{callId}/recording`

### Receive a call (witness dials in)

Uplift does not expose inbound DIDs. Pattern used here:

1. Configure a **Twilio** number
2. Expose API publicly (`ngrok http 8000`)
3. Voice webhook → `POST https://<public>/api/sessions/twilio-webhook`
4. Set `TWILIO_*` in `.env` (optional metadata)
5. Witness dials Twilio → TwiML → **callback** via Uplift with the Gawah agent

Only call numbers that consent. PTA + Uplift terms forbid spam.

## Key routes

🔒 = requires a valid staff Supabase JWT (see Authentication above).

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/sessions/create` | Adhoc WebRTC session (demo fallback if no key) |
| POST | `/api/sessions/call` | Outbound PSTN via Uplift |
| POST | `/api/sessions/web/{id}/recording` | Mic upload + dialogue → statement |
| POST | `/api/sessions/web/{id}/complete` | End web session |
| POST | `/api/sessions/web/{id}/events` | Pipeline / activity events |
| GET 🔒 | `/api/sessions/calls` | Poll calls + sync Uplift metadata |
| GET 🔒 | `/api/sessions/calls/{id}` | Single call detail |
| POST 🔒 | `/api/sessions/calls/{id}/refresh-artifacts` | Re-fetch recording/transcript |
| GET | `/api/sessions/calls/{id}/recording` | Locally cached recording |
| POST | `/api/sessions/twilio-webhook` | Inbound Twilio → Uplift callback TwiML |
| POST | `/api/tools/save_witness_statement` | Save + TTS readback + queue engines |
| POST | `/api/tools/flag_inconsistency` | Realtime inconsistency flag |
| POST | `/api/tools/flag_intimidation` | Urgent escalation + NGO webhook |
| POST | `/api/tools/enable_privacy_mode` | Anonymous mode |
| POST | `/api/tools/assess_protection_need` | Protection referral |
| POST | `/api/tools/confirm_statement` | Voice confirmation (no thumbprint) |
| GET | `/api/statements/{refCode}` | Status + location only (`full=false` default); `?full=true` 🔒 for full text |
| POST 🔒 | `/api/statements/{refCode}/review` | Officer/NGO review — reviewer identity comes from the JWT, not the body |
| GET | `/api/statements/{refCode}/audio` | Readback MP3 — **unauthenticated by design** (known gap, see Authentication) |
| POST 🔒 | `/api/statements/{refCode}/pdf` | Statement PDF |
| GET 🔒 | `/api/statements/{refCode}/protection-pdf` | Protection referral PDF |
| GET 🔒 | `/api/dashboard/statements` | Filterable list |
| GET 🔒 | `/api/dashboard/clusters` | Incident clusters |
| GET 🔒 | `/api/dashboard/clusters/{id}` | Corroboration map |
| GET 🔒 | `/api/kpis` | KPIs + edge-case coverage + ROI proxies |

## Uplift AI usage

1. Set `UPLIFTAI_API_KEY` (Singapore base URL default).
2. Optionally set `UPLIFT_ASSISTANT_ID`, or let `ensure_assistant()` create one and **sync** instructions/tools/TTS/STT from `app/prompts/`.
3. Web demos prefer **adhoc** `createSession` with full current config (`UpliftService.create_adhoc_web_session`) so prompts stay fresh.
4. Default TTS voice: **`defense-advocate`** (male, Standard Urdu). Override with `UPLIFT_TTS_VOICE_ID`.
5. STT language forced to **`ur`** for live captions + witness transcription.
6. Tool invocations from the agent hit `/api/tools/*`.
7. Readback audio via `POST /v1/synthesis/text-to-speech` using the configured voice id.

Phone calling: only on `https://ap-southeast-1.api.upliftai.org/v1` — see `UpliftService.place_call`.

Voice library: [docs.upliftai.org/orator_voices](https://docs.upliftai.org/orator_voices).

## KPIs / edge cases

`GET /api/kpis` returns operational KPIs plus:

- `roi_proxies` — literacy barrier removed, informed consent rate, protection pipeline, lawyer crossref savings
- `edge_case_coverage` — intimidation, privacy, inconsistency, delay doctrine, incomplete recovery, multi-witness, language access, protection

Also exposes aliases such as `urgent_count` / `cluster_count` where the dashboard expects them.

Corroboration disclaimer (always): *Pre-litigation intelligence only — not admissible corroboration under CrPC Section 162.*

## Compliance (future work)

Not active in MVP. See [`../docs/COMPLIANCE_FUTURE_WORK.md`](../docs/COMPLIANCE_FUTURE_WORK.md) and stub `app/services/compliance_service.py`.

Primary future targets: **CrPC §§161–162**, **PDPB 2023 / PDPA draft readiness**, **PTA/PECA call consent**, **National AI Policy 2025**.
