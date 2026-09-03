# Voice AI Enabled Orchestration Engine (Gawah) — Vercel deployment

Production deployment for **Gawah**, the witness product built on this voice-AI orchestration stack. Originated at the **Uplift AI × Replit Voice AI Hackathon (2026)**; voice infrastructure by **Uplift AI**.

Production runs as **two Vercel projects**: a Vite/React UI and a FastAPI API. They are linked at runtime via `VITE_API_URL` (frontend) and `CORS_ORIGINS` (backend), and separately via a **Supabase project** (`gawah`, `ap-southeast-1`) for Postgres + staff Auth.

Both Vercel projects are **git-linked to `main`** and auto-deploy on push — the manual `vercel deploy --prod` flow below is a fallback/first-time-setup path, not the normal one. (They were not git-linked for a stretch during Phase 1/2 development, which let backend auth code sit committed-but-undeployed for days with the live API still serving unauthenticated statement text — see CLAUDE.md's Authentication section for that history. Both are linked now.)

---

## Live URLs (share with users)

| Role | URL |
|------|-----|
| **App** | https://upliftaixreplit-gawah.vercel.app |
| **API** | https://gawah-backend.vercel.app |
| Health | https://gawah-backend.vercel.app/health |
| OpenAPI / Swagger | https://gawah-backend.vercel.app/docs |

After deploy, tour the seeded demo: **Dashboard → NBRA7K → Clusters → Calls → Demo** — **only if the live Supabase project has been seeded** (see "Demo data on production" below; it is not automatic once Supabase is the backend, and is currently empty).

### Domain note

**Canonical app URL:** `https://upliftaixreplit-gawah.vercel.app` only. Retired aliases (`gawah-frontend.vercel.app`, `gawah-app.vercel.app`) should not be used — remove them from the Vercel project **Settings → Domains** if they reappear after a rename.

**Do not use** `https://gawah.vercel.app` — that hostname belongs to another Vercel app (`gawahelper`). Vercel `.vercel.app` slugs are global.

---

## Vercel projects

| Project name | Root directory | Framework | Team slug |
|--------------|----------------|-----------|-----------|
| `upliftaixreplit-gawah` | `frontend/` | Vite | `muhammad-faheems-projects-103f1618` |
| `gawah-backend` | `gawah-backend/` | FastAPI | `muhammad-faheems-projects-103f1618` |

Each directory has its own `.vercel/project.json` after `vercel link`.

---

## Architecture

```text
Browser
  → https://upliftaixreplit-gawah.vercel.app   (static Vite SPA)
  → fetch https://gawah-backend.vercel.app/...   (FastAPI on Vercel Functions)

Live voice (WebRTC / PSTN) goes directly to Uplift AI (Singapore), not through Vercel WebSockets.
```

The UI is **not** Next.js in production. The live app is `frontend/artifacts/gawah-frontend` (Vite). The older `client/` Next.js prototype is **not** deployed.

---

## Config files (in repo)

### Frontend — `frontend/vercel.json`

| Setting | Value |
|---------|--------|
| Install | `pnpm install --no-frozen-lockfile` |
| Build | `pnpm --filter @workspace/gawah-frontend build` |
| Output | `artifacts/gawah-frontend/dist/public` |
| SPA rewrites | all routes → `/index.html` |

Build must run from **`frontend/`** so pnpm workspace deps (`@workspace/*`) resolve.

Production API base URL is set in code when `VITE_API_URL` is empty:

- `frontend/artifacts/gawah-frontend/src/lib/api.ts` → `https://gawah-backend.vercel.app`
- `frontend/artifacts/gawah-frontend/src/lib/gawah-tools.ts` → same fallback

Optional override: Vercel env `VITE_API_URL` (also documented in `.env.example`).

### Backend — `gawah-backend/vercel.json`

| Setting | Value |
|---------|--------|
| Entry | `app/main.py` (`app = FastAPI(...)`) |
| `maxDuration` | 60s (STT / LLM / TTS pipelines) |
| `excludeFiles` | `data/**`, `scripts/**`, `.venv/**` |

Python version: `gawah-backend/.python-version` → **3.12**.

On Vercel, local JSON/audio defaults to **`/tmp/gawah/`** (see `app/config.py`). Data is **ephemeral** across cold starts unless you add Supabase.

### Demo data on production

On API startup, `app/main.py` calls `ensure_demo_seed()`, which loads three statements, one cluster, and three calls if missing — **but only against the local-JSON/`/tmp` store.** `ensure_demo_seed()` explicitly no-ops ("Skipped automatically when Supabase is the backend") once `SUPABASE_URL` is set, which it now is in production. **This means the live Supabase-backed deployment does not auto-seed**, and as of this writing its `statements` table is genuinely empty — `GET /api/statements/NBRA7K` on the live API returns 404, not the demo tour.

To seed the live Supabase project, run the CLI directly (this calls `seed_demo_store()`, which — unlike `ensure_demo_seed()` — does write through to Supabase) with production Supabase credentials in scope:

```bash
python gawah-backend/scripts/seed_demo.py --replace
```

Refs: **NBRA7K**, **SHPK2M**, **NBRC9Q** · Cluster: `26980a20-demo-hussain-abad-0001`.

Note `--replace`'s purge step only *warns* on Supabase instead of deleting old seed rows first — re-running it repeatedly upserts rather than cleanly resetting. Logic lives in `gawah-backend/app/services/demo_seed.py`.

Also note: the repo's local `.env` files already point `SUPABASE_URL` at the **same production project**, not a separate dev database — running the seed script locally has the same live effect as running it against Vercel.

---

## Environment variables (Vercel)

Set these in the Vercel dashboard or via `vercel env add`. **Never commit secrets.**

### Frontend project (`upliftaixreplit-gawah`)

| Variable | Required | Example / notes |
|----------|----------|-----------------|
| `VITE_API_URL` | Recommended | `https://gawah-backend.vercel.app` — baked at build time if set; otherwise code fallback applies |
| `VITE_SUPABASE_URL` | Yes (for staff login) | Browser Auth client (`src/lib/supabase.ts`). Public — same URL as the backend's `SUPABASE_URL` |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Yes (for staff login) | Publishable key only — never the secret/service key, never a `VITE_`-prefixed secret. RLS bounds what it can do even if exposed |
| `VITE_TURNSTILE_SITE_KEY` | Optional, recommended before wide public traffic | Public Cloudflare Turnstile sitekey. Unset = `components/turnstile-widget.tsx` renders nothing on `/login` and the `/demo` "Call me" form — both flows still work, just without a CAPTCHA gate. Pair with the backend's `TURNSTILE_SECRET_KEY` below |

Without the two Supabase vars, `/login` and every `RequireAuth`-gated route (`/dashboard`, `/statements/:ref`, `/calls`, `/clusters`, `/clusters/:id`) has no way to obtain a token — the SPA still loads, but staff can't sign in.

### Backend project (`gawah-backend`)

| Variable | Required | Notes |
|----------|----------|--------|
| `UPLIFTAI_API_KEY` | Yes (live voice) | Uplift realtime / STT / TTS |
| `UPLIFT_BASE_URL` | Yes | `https://ap-southeast-1.api.upliftai.org/v1` |
| `UPLIFT_ASSISTANT_ID` | Recommended | Avoid creating a new assistant every cold path |
| `OPENROUTER_API_KEY` | Recommended | §161 structuring / flags |
| `OPENROUTER_MODEL` | Optional | Default in code |
| `CASE_ID_SECRET` | No | Unused leftover default, not read anywhere in `app/`; safe to ignore |
| `CORS_ORIGINS` | Yes | Must include the live UI origin(s) |
| `APP_ENV` | Recommended | `production` — also hard-disables `DEV_AUTH_BYPASS` regardless of that flag's value |
| `DEBUG` | Recommended | `false` |
| `SUPABASE_URL` | Yes (for staff auth + durable storage) | `https://<project-ref>.supabase.co` |
| `SUPABASE_SERVICE_KEY` | Yes (for durable storage) | Secret/service-role key — bypasses RLS, backend uses it for all reads/writes today |
| `SUPABASE_KEY` | Optional | Publishable key; used only if service key is absent |
| `DEV_AUTH_BYPASS` | No — leave unset in production | Local dev only; hard-refused when `APP_ENV=production` |
| `TURNSTILE_SECRET_KEY` | Optional, recommended before wide public traffic | Enforces the CAPTCHA gate on `POST /api/sessions/call` (real, free, unauthenticated outbound dialing) once set — see `app/services/captcha.py`. Unset = verification skipped, not required. Also enable "CAPTCHA protection" in Supabase's Authentication settings with this same secret to gate `/login` sign-in/up too |
| `CALL_COOLDOWN_SECONDS` / `CALL_MAX_PER_HOUR_GLOBAL` | Optional | Defaults (600s per-number cooldown, 20/hour global cap) are usually fine — persisted rate limits on outbound calls, active regardless of Turnstile config |

**Without `SUPABASE_URL` set**, `Settings.auth_enabled` is `False` and every gated route (`/api/dashboard/*`, `/api/kpis`, review, PDFs, staff call routes) **fails closed with 503**, not open — there is no unauthenticated fallback for those routes. Confirm `GET /health` reports `db_backend: supabase` in production; `local_json` there means the Supabase env vars are missing or misconfigured, not a valid production state.

**Before opening the site to real public traffic**, set `TURNSTILE_SECRET_KEY` + `VITE_TURNSTILE_SITE_KEY` and enable CAPTCHA protection in Supabase's dashboard (Authentication > Bot and Abuse Protection). Without this, `POST /api/sessions/call` is protected only by the persisted rate limits above (real, but not a full bot defense), and `/login` signup relies only on Supabase's built-in default rate limits (a 60s cooldown between signup confirmation requests, a handful of confirmation emails/hour on the default SMTP).

**CORS example** (comma-separated, no spaces required):

```text
https://upliftaixreplit-gawah.vercel.app,http://localhost:5173,http://localhost:3000
```

The backend also appends known Vercel UI hosts in `app/config.py` (`cors_origin_list`) so renames are less brittle.

Templates: [`.env.example`](../.env.example), [`gawah-backend/.env.example`](../gawah-backend/.env.example).

---

## First-time setup (CLI)

Prerequisites: [Vercel CLI](https://vercel.com/docs/cli), logged in (`vercel login`), team **Muhammad Faheem's projects**.

### 1. Backend

```bash
cd gawah-backend
vercel link --yes --project gawah-backend --scope muhammad-faheems-projects-103f1618
vercel project update gawah-backend --framework fastapi --scope muhammad-faheems-projects-103f1618

# Add env vars (repeat per key / environment)
vercel env add UPLIFTAI_API_KEY production,preview,development --sensitive --scope muhammad-faheems-projects-103f1618
vercel env add CORS_ORIGINS production,preview,development --no-sensitive --scope muhammad-faheems-projects-103f1618

vercel deploy --prod --yes --scope muhammad-faheems-projects-103f1618
```

### 2. Frontend

```bash
cd frontend
vercel link --yes --project upliftaixreplit-gawah --scope muhammad-faheems-projects-103f1618

vercel env add VITE_API_URL production,preview,development \
  --value "https://gawah-backend.vercel.app" --no-sensitive --force \
  --scope muhammad-faheems-projects-103f1618

# Public access (disable SSO on preview/production if enabled)
vercel project protection disable upliftaixreplit-gawah --sso --scope muhammad-faheems-projects-103f1618

vercel deploy --prod --yes --scope muhammad-faheems-projects-103f1618

# Ensure primary hostname points at latest production deployment
vercel alias set <deployment-url> upliftaixreplit-gawah.vercel.app --scope muhammad-faheems-projects-103f1618
```

---

## Redeploy (routine)

```bash
# After backend code or env changes
cd gawah-backend && vercel deploy --prod --yes --scope muhammad-faheems-projects-103f1618

# After frontend code changes
cd frontend && vercel deploy --prod --yes --scope muhammad-faheems-projects-103f1618
vercel alias set <new-deployment-url> upliftaixreplit-gawah.vercel.app --scope muhammad-faheems-projects-103f1618
```

**Important:** Changing backend `CORS_ORIGINS` or other env vars requires a **new deployment** before they take effect.

Changing `VITE_API_URL` requires a **frontend rebuild** (`vercel deploy --prod`).

---

## Verify

```bash
# Health
curl -sS https://gawah-backend.vercel.app/health

# CORS (must return access-control-allow-origin for your UI host)
curl -sS -D- -o /dev/null \
  -H 'Origin: https://upliftaixreplit-gawah.vercel.app' \
  https://gawah-backend.vercel.app/health

# Demo statements
curl -sS 'https://gawah-backend.vercel.app/api/dashboard/statements'

# UI (title should be "Gawah — The Witness That Cannot Be Silenced")
curl -sS https://upliftaixreplit-gawah.vercel.app/ | head
```

With Vercel CLI (handles deployment protection when logged in):

```bash
cd gawah-backend && vercel curl /health --scope muhammad-faheems-projects-103f1618
cd frontend && vercel curl / --scope muhammad-faheems-projects-103f1618
```

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|----------------|-----|
| **"Backend offline — connect FastAPI at …"** banner | Browser blocked cross-origin request, or API down | Redeploy backend after setting `CORS_ORIGINS`; confirm `/health` returns 200 with `Access-Control-Allow-Origin` for the UI host |
| Empty Dashboard / Calls / Clusters | Cold start on empty `/tmp` store before seed runs | Hit `/health` once, refresh UI; or redeploy backend (seed runs on lifespan) |
| Wrong app at `gawah.vercel.app` | Hostname owned by another Vercel user | Use **upliftaixreplit-gawah.vercel.app** |
| Vercel login page on UI | SSO / deployment protection enabled | `vercel project protection disable <project> --sso` |
| Frontend build: `pnpm install` lockfile error | Frozen lockfile mismatch | `frontend/vercel.json` uses `--no-frozen-lockfile` |
| Backend build: `services` framework error | Project preset wrong | `vercel project update gawah-backend --framework fastapi` |
| Live call works locally but not prod | Missing `UPLIFTAI_API_KEY` on Vercel | Set on **backend** project, redeploy |
| Statements disappear after a while | Serverless `/tmp` is ephemeral | Add Supabase (`SUPABASE_URL` + key) for durable storage |

---

## Production limitations

- **Storage:** Default is local JSON under `/tmp` on Vercel. Witness statements and calls from real sessions may not persist across instances or cold starts. Supabase is supported in code but not required for the hackathon demo seed.
- **Audio / PDF files:** Written to `/tmp/gawah/audio` on Vercel; not durable. Protection PDFs and readback MP3s may 404 after cold start.
- **Long jobs:** Single function timeout 60s; very long STT+LLM runs may need Railway or Supabase + object storage for production hardening (see `gawah-backend/railway.toml` for an alternate host).

---

## Related docs

| Doc | Content |
|-----|---------|
| [`LOCAL_SETUP.md`](./LOCAL_SETUP.md) | Local dev install |
| [`BACKEND_PRD_FOR_FRONTEND.md`](./BACKEND_PRD_FOR_FRONTEND.md) | API contract |
| [`gawah-backend/README.md`](../gawah-backend/README.md) | API runbook |
| [Vercel FastAPI guide](https://vercel.com/docs/frameworks/backend/fastapi) | Platform reference |
