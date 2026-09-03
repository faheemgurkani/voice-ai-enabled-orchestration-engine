# Local setup — Voice AI Enabled Orchestration Engine (Gawah)

Run **Gawah** on your laptop: **FastAPI** orchestration backend + **Vite** dashboard. Project originated at the **Uplift AI × Replit Voice AI Hackathon (2026)**; live voice via **Uplift AI**.

Supported: **macOS · Windows · Linux**.

**Production (no local install):** https://upliftaixreplit-gawah.vercel.app — see [`DEPLOYMENT.md`](./DEPLOYMENT.md) for Vercel setup and redeploy.

---

## Prerequisites

| Tool | Version | Notes |
|------|---------|--------|
| **Python** | 3.10+ | 3.11–3.13 recommended |
| **Node.js** | 18+ | 20 LTS fine |
| **pnpm** | 9+ | Script installs via Corepack / npm if missing |
| **Git** | any | Clone the repo |

Optional (for **live** web/phone voice):

- `UPLIFTAI_API_KEY` (Singapore region)
- `OPENROUTER_API_KEY` (structuring / consistency)

Without keys you can still browse landing, dashboard, clusters, and seeded demo data. Live WebRTC / PSTN need Uplift.

---

## One-command setup

From the **repo root**:

### macOS / Linux

```bash
chmod +x scripts/setup.sh
./scripts/setup.sh install
./scripts/setup.sh dev
```

### Windows (PowerShell)

```powershell
.\scripts\setup.ps1 install
.\scripts\setup.ps1 dev
```

### Any OS (Python directly)

```bash
python scripts/setup.py install   # or: py -3 scripts\setup.py install
python scripts/setup.py dev
```

Then open:

| Service | URL |
|---------|-----|
| **App UI** | http://127.0.0.1:5173 |
| **API docs** | http://127.0.0.1:8000/docs |
| **Health** | http://127.0.0.1:8000/health |

---

## What `install` does

1. Checks Python / Node / pnpm  
2. Creates `.venv` at repo root  
3. `pip install -r gawah-backend/requirements.txt`  
4. Copies env templates if missing:
   - `.env`
   - `gawah-backend/.env`
   - `frontend/artifacts/gawah-frontend/.env`
5. Syncs filled keys from root `.env` → `gawah-backend/.env` when backend values are empty  
6. `pnpm install` in `frontend/` (workspace)  
7. Seeds demo data (`NBRA7K`, `SHPK2M`, `NBRC9Q` + cluster + calls)

Skip seed:

```bash
python scripts/setup.py install --no-seed
```

---

## Script commands

| Command | Purpose |
|---------|---------|
| `install` | Full setup (default) |
| `check` | Verify tools, paths, env keys |
| `seed` | Re-load demo dashboard data |
| `dev` | Start API **and** frontend (Ctrl+C stops both) |
| `backend` | API only → `:8000` |
| `frontend` | UI only → `:5173` |

Examples:

```bash
python scripts/setup.py check
python scripts/setup.py seed
python scripts/setup.py backend   # terminal 1
python scripts/setup.py frontend  # terminal 2
```

---

## Environment variables

**Authoritative for the API:** `gawah-backend/.env`  
Template: [`gawah-backend/.env.example`](../gawah-backend/.env.example)

Minimum for a **live voice** demo:

```env
UPLIFTAI_API_KEY=your_key
UPLIFT_BASE_URL=https://ap-southeast-1.api.upliftai.org/v1
OPENROUTER_API_KEY=your_key
CORS_ORIGINS=http://localhost:3000,http://localhost:5173
```

Optional (defaults are fine for the hackathon demo):

```env
UPLIFT_TTS_VOICE_ID=defense-advocate   # male Standard Urdu
UPLIFT_ASSISTANT_ID=                   # leave empty to create/sync on first call
```

### Dashboard / Calls / KPIs need a staff login

`/dashboard`, `/calls`, `/clusters`, and `GET /api/kpis` are gated behind Supabase Auth — anonymous requests get **401**. Two ways to reach them locally:

```env
# gawah-backend/.env — skip real login for local dev (never set this in production)
DEV_AUTH_BYPASS=true
```

Or point at the real Supabase project and sign up/sign in through `/login` in the browser:

```env
# gawah-backend/.env
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_SERVICE_KEY=your_service_role_key

# frontend/artifacts/gawah-frontend/.env
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your_publishable_key
```

Without either, the JSON-store demo seed still saves/loads fine — only the staff-gated *reads* (dashboard list, KPIs, full statement text, PDFs) return 401. Witness-facing routes (`/demo`, session create, tool calls) are never gated. Full design: **Authentication** section of the repo-root `CLAUDE.md`.

Optional **Google AI** (Gemini + Cloud STT/TTS — does not replace Uplift/OpenRouter):

```env
GEMINI_API_KEY=
GOOGLE_APPLICATION_CREDENTIALS=/path/to/gcp-service-account.json
```

See [`GOOGLE_AI_INTEGRATION.md`](./GOOGLE_AI_INTEGRATION.md) for full env list, code examples, and probe script.

Frontend (usually leave blank — Vite proxies `/api` → `:8000`):

```env
# frontend/artifacts/gawah-frontend/.env
VITE_API_URL=
VITE_API_PROXY_TARGET=http://localhost:8000
PORT=5173
BASE_PATH=/
```

Never commit real secrets. Ask a teammate for keys out-of-band.

---

## Demo tour (after seed)

0. Set `DEV_AUTH_BYPASS=true` (or sign in via `/login`) — see **Dashboard / Calls / KPIs need a staff login** above, otherwise steps 1–3 return 401.
1. **Dashboard** → open **NBRA7K** (urgent / anonymity / A–B flags / protection)  
2. **Clusters** → Mohalla Hussain Abad (3 statements, collusion check)  
3. **Calls** → three completed sessions linked to those refs  
4. **Demo** → live web call (needs Uplift key + mic)
   - Left: call controls (mic / end)
   - Right: **live Agent ↔ گواہ dialogue** (fixed height, scrolls as history grows)
   - On End: mic recording uploads → STT → §161 fields → ref code + full dialogue chat

Re-seed anytime:

```bash
python scripts/setup.py seed
```

Start a **new** web session after pulling agent/prompt changes — adhoc config is applied per session.

---

## Manual setup (if you prefer)

```bash
# Backend
python3 -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r gawah-backend/requirements.txt
cp gawah-backend/.env.example gawah-backend/.env
# edit keys…

uvicorn app.main:app --app-dir gawah-backend --reload --host 0.0.0.0 --port 8000

# Frontend (other terminal)
cd frontend && pnpm install
cd artifacts/gawah-frontend
cp .env.example .env
PORT=5173 BASE_PATH=/ pnpm dev --host 127.0.0.1
```

Windows activate: `.venv\Scripts\Activate.ps1`

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `Use pnpm instead` | `npm i -g pnpm` or `corepack enable` |
| Port 8000 / 5173 in use | Stop other process, or change port in vite `.env` / uvicorn `--port` |
| Dashboard empty | `python scripts/setup.py seed` |
| Dashboard / Calls / KPIs return 401 | Set `DEV_AUTH_BYPASS=true` in `gawah-backend/.env`, or sign in via `/login` |
| Live call fails | Set `UPLIFTAI_API_KEY`, confirm `UPLIFT_BASE_URL` is Singapore, check `/health` |
| Captions in English / Roman | Agent must use Nastaliq; restart a **new** Demo session after pull. STT language is forced to `ur`. |
| No dialogue turns live | Uplift/LiveKit must stream transcriptions; after End, witness STT still fills the chat |
| Frontend API 404 | Backend must be running; leave `VITE_API_URL` empty so the proxy works |
| Windows execution policy | `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` then re-run `setup.ps1` |
| Python not found on Windows | Install from python.org with **Add to PATH**, use `py -3` |

---

## Project map (what you actually run)

```text
gawah-backend/                         ← FastAPI (source of truth API)
frontend/artifacts/gawah-frontend/     ← Vite + React demo UI (use this)
client/                                ← older Next.js prototype (optional)
```

For hackathon demos, ignore `client/` unless someone asks for it.
