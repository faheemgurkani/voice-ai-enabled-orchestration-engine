# Voice AI Enabled Orchestration Engine (Gawah) — Backend PRD

**Product:** Gawah (گواہ) · **Project:** Voice AI Enabled Orchestration Engine (Gawah)  
**Origin:** [Uplift AI × Replit Voice AI Hackathon (2026)](https://upliftai.org) · Voice stack: **Uplift AI**  
**Primary UI:** Vite app at `frontend/artifacts/gawah-frontend` (legacy Next.js under `client/` is optional)  
**Backend:** FastAPI — Vite proxies `/api` → `http://localhost:8000`  
**Interactive API docs:** `http://localhost:8000/docs`  
**Status:** Live in production (Vercel + Supabase) — live-tested with Uplift AI + OpenRouter  
**Auth:** Supabase Auth (staff only) now gates the dashboard/review/KPI/PDF routes — see §2 and §6 below, and the Authentication section of the repo-root `CLAUDE.md` for the full design

This document is the contract for wiring the demo UI to these endpoints and shapes.

---

## 1. Product one-liner

**Gawah (گواہ)** lets witnesses in Pakistan give a legally structured statement by voice (Urdu / Punjabi), get it read back for confirmation, receive a 6-character reference code, and lets NGO/lawyer staff review statements, inconsistencies, protection referrals, and multi-witness corroboration on a dashboard.

---

## 2. User roles (frontend surfaces)

| Role | Primary UI | Goal |
|---|---|---|
| **Witness** | `/demo` (browser voice) or phone | Speak statement → hear readback → confirm → get ref code |
| **NGO / Lawyer / Officer** | `/dashboard`, `/clusters` | Review, escalate, prepare counsel, export |
| **Demo operator / judge** | Landing + KPIs | Show end-to-end story in 3–5 minutes |

Staff/NGO routes now require a Supabase Auth login (`/login`, email+password) — `RequireAuth` redirects unauthenticated visitors there. Witnesses never authenticate; `/demo` and the ref-code lookup stay open. `lib/api.ts`'s `gawahFetch` attaches the bearer token automatically when a session exists.

---

## 3. Screens the frontend must cover

| Route | Purpose | Backend deps |
|---|---|---|
| `/` | Brand landing + CTAs (Demo, Dashboard) | Optional `/health` |
| `/demo` | Start Uplift voice session; show connection + tool activity | `POST /api/sessions/create` (+ `@upliftai/assistants-react` if available) |
| `/dashboard` | Filterable statement list + KPI strip | `GET /api/dashboard/statements`, `GET /api/kpis` |
| `/dashboard/[refCode]` | Full statement detail | `GET /api/statements/{ref}`, review, audio, protection, inconsistencies |
| `/clusters` | Incident cluster list | `GET /api/dashboard/clusters` |
| `/clusters/[clusterId]` | Field-level corroboration map | `GET /api/dashboard/clusters/{id}` |

Optional later: `/lookup` public status by ref code (limited fields).

---

## 4. System architecture (what frontend talks to)

```text
[Vite UI (frontend/artifacts/gawah-frontend)]
    |  fetch JSON / audio, Authorization: Bearer <staff-jwt> on 🔒 routes
    v
[FastAPI gawah-backend :8000]
    |-- Uplift AI (Realtime Assistants, TTS)   Singapore base URL
    |-- OpenRouter (DeepSeek V4 Flash)        structuring / engines
    |-- Supabase Postgres (or local JSON fallback)
    |-- Supabase Auth (JWKS/ES256) — verifies the staff JWT above

[Browser]  →  Supabase Auth directly (sign in/up) for the JWT itself
```

**Frontend never holds** `UPLIFTAI_API_KEY`, `OPENROUTER_API_KEY`, or the Supabase **service/secret** key. Only `VITE_API_URL` and the Supabase **publishable** key (`VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY`).

---

## 5. Feature catalog (backend → UI mapping)

### 5.1 Voice demo session
- **Backend:** `POST /api/sessions/create` → `{ token, wsUrl, roomName, callId/sessionId, demo? }`
- **UI:** “Start voice session” → connect WebRTC room → mic on → show live status
- **Layout:** call controls **left**; live Agent/گواہ dialogue **right** (fixed height, scrolls)
- **End call:** `POST /api/sessions/web/{callId}/recording` (+ optional `dialogue` JSON) → STT → statement; then `/complete`
- **TTS / language:** `defense-advocate` (male Standard Urdu); agent output Nastaliq for captions; STT `ur`
- **Tools** (agent → backend, usually not called by UI directly): save statement, flag inconsistency/intimidation, privacy mode, protection assess, confirm
- **UI should show:** connecting / live / ended; full dialogue after end (no truncation); activity log
- **Details:** [`WEB_CALL_AND_DIALOGUE.md`](./WEB_CALL_AND_DIALOGUE.md)

### 5.2 Statement intake (5 legal fields)
Stored / displayed fields:

| Field | Key | Notes for UI |
|---|---|---|
| Time | `time_of_incident` | May be approximate; badge if `temporal_uncertainty` |
| Location | `location` | Required |
| Persons | `persons_present` | string[] |
| Sequence | `sequence_of_events` | Verbatim narrative (may be long, RTL for ur/pa) |
| Relationship | `relationship_to_accused` / `relationship_to_parties` | Optional |

Also show: `witness_type`, `language_of_call` (`ur` \| `pa` \| `ps` \| `mixed`), `ref_code`, `status`.

### 5.3 Reference code
- 6 chars, unambiguous alphabet (`A–Z` minus O/I, digits minus 0/1)
- Shown large after save/confirm; used as URL param `/dashboard/[refCode]`

### 5.4 Readback audio
- `GET /api/statements/{refCode}/audio` → `audio/mpeg`
- UI: `<audio controls src={getStatementAudioUrl(ref)} />`
- Also show `readback_text` as transcript

### 5.5 Witness confirmation
- Backend tool `confirm_statement` sets `confirmed_by_witness`
- UI badge: Confirmed / Not confirmed  
- **Do not** show signature/thumbprint UI (by design / CrPC §162)

### 5.6 Privacy mode
- `privacy_mode: true` → badge “Anonymous”; hide/avoid collecting name/address in UI copy

### 5.7 Intimidation / urgent escalation
- `intimidation_flag`, `status: urgent_escalation`
- UI: red **URGENT** badge; pin to top of list filter `flags=intimidation`

### 5.8 Inconsistency panel (Section 16)
- `inconsistency_flags[]` with:
  - `contradiction_type` / `category` (`temporal`, `spatial`, `identity`, `sequence`, `sensory`, `numerical`, …)
  - `segment_a`, `segment_b`
  - `analysis` / `contradiction_description`
  - `score` / `hybrid_score`
  - `legal_risk`, `source` (`realtime` \| `post_call_analysis`)
- UI: side-by-side A/B quotes + type chip + score

### 5.9 Witness protection
- `protection` / `protection_referral`:
  - `status`: `none` \| `referral_generated` \| `submitted`
  - `applicable_act`, `grounds[]`, `referral_pdf_url`
- UI section only when referral generated or intimidation/serious offence

### 5.10 Multi-witness corroboration (Section 17)
- Cluster list + detail with `field_results[]`:
  - `field`, `status` (`agreement` \| `partial_agreement` \| `conflict` \| `collusion_warning` \| …)
  - `agreement_score` 0–1
  - `values`, `conflict_detail`, `note`
- **Mandatory disclaimer everywhere scores appear:**  
  *“Pre-litigation intelligence only — not admissible corroboration under CrPC Section 162.”*
- Yellow badge on `collusion_warning`

### 5.11 NGO review workflow
- `POST /api/statements/{ref}/review` body `{ reviewed_by, reviewer_notes }`
- Sets `status: reviewed`
- UI form on detail page

### 5.12 KPIs / demo metrics
- `GET /api/kpis` → totals, urgent, clusters, avg corroboration, `edge_case_coverage`, `roi_proxies`
- UI: compact strip on dashboard (not on marketing hero)

### 5.13 PDF export
- `POST /api/statements/{ref}/pdf` → PDF download  
- Button on detail: “Download printable statement”

---

## 6. API reference (frontend-facing)

Base URL: `process.env.NEXT_PUBLIC_API_URL`  
CORS allows `http://localhost:3000` by default.

### 6.1 Health
```http
GET /health
```
```json
{
  "status": "healthy",
  "db_backend": "local_json",
  "uplift_configured": true,
  "openrouter_configured": true,
  "openrouter_model": "deepseek/deepseek-v4-flash-0731",
  "llm_enabled": true
}
```

### 6.2 Create voice session
```http
POST /api/sessions/create
Content-Type: application/json

{ "participantName": "Witness" }
```
```json
{
  "token": "...",
  "wsUrl": "wss://...",
  "ws_url": "wss://...",
  "roomName": "...",
  "room_name": "...",
  "demo": false,
  "ok": true
}
```
Use `token` + `wsUrl` with Uplift React SDK (`UpliftAIRoom`).

Response also includes a tracked **`callId` / `sessionId`** used for web recording + events.

Agent TTS defaults to male Standard Urdu (`defense-advocate`); STT language `ur`. Spoken agent text should be Nastaliq Urdu so live captions match audio.

### 6.2a Web activity events
```http
POST /api/sessions/web/{callId}/events
{ "type": "webrtc_connected", "detail": "…", "status": "connected" }
```

### 6.2b Upload web recording (+ optional dialogue)
```http
POST /api/sessions/web/{callId}/recording
Content-Type: multipart/form-data

file: <audio/webm>
language: ur
participantName: Witness
dialogue: [{"role":"agent","text":"…","id":"…"},{"role":"witness","text":"…"}]   # optional JSON string
```

```json
{
  "ok": true,
  "call_id": "…",
  "ref_code": "X5QB2H",
  "status": "completed",
  "transcript": "ایجنٹ: …\n\nگواہ: …",
  "witness_transcript": "…",
  "dialogue": [
    { "role": "agent", "text": "السلام علیکم۔…", "id": "…" },
    { "role": "witness", "text": "…", "id": "…" }
  ],
  "stt_ok": true,
  "label": "Completed — web testimony processed"
}
```

**UI contract:**

- During the call: show LiveKit transcriptions as Agent / گواہ chat (right of call panel; **fixed height, scroll inside**).
- On end: show full `dialogue` (preferred) or `transcript` — **do not truncate** for display.
- §161 fields are structured from witness-only text (dialogue witness turns or STT).

### 6.2c Complete web session
```http
POST /api/sessions/web/{callId}/complete
→ { "ok": true, "item": { …tracked call… } }
```

Marks the session ended and ensures a dashboard statement exists when transcript/recording is available.

### 6.3 List statements 🔒
```http
GET /api/dashboard/statements?page=1&status=pending_review&flags=intimidation
Authorization: Bearer <staff-jwt>
```
🔒 = requires a signed-in staff Supabase JWT; 401 without one.
Query:
- `page` (int, default 1)
- `status` optional: `pending_review` \| `urgent_escalation` \| `reviewed` \| `submitted` \| `incomplete` \| `archived`
- `flags` optional: `intimidation` \| `inconsistency`

```json
{
  "items": [
    {
      "ref_code": "X5QB2H",
      "created_at": "2026-08-08T10:00:00+00:00",
      "location": "Mohalla Hussain Abad Rawalpindi",
      "status": "urgent_escalation",
      "intimidation_flag": true,
      "inconsistency_flags": [],
      "corroboration_score": 0.71,
      "incident_cluster_id": "uuid",
      "privacy_mode": true,
      "language_of_call": "ur",
      "witness_type": "eyewitness"
    }
  ],
  "total": 2,
  "page": 1,
  "page_size": 20
}
```

### 6.4 Statement detail
```http
GET /api/statements/{refCode}
```
**Default (`full` omitted or `false`) is the anonymous callback-safe view** — only `ref_code`, `status`, `created_at`, `location`, `time_of_incident`. This is what the witness-facing "check my statement" flow should call; no token needed.

`GET /api/statements/{refCode}?full=true` 🔒 returns the full object — 401 without a staff token, checked *before* the DB lookup so it can't be used to probe which ref codes exist:
- Core fields + `core_fields` mirror
- `inconsistency_flags`
- `protection` / `protection_referral`
- `corroboration_score`, `corroboration_detail`
- `readback_text`, `readback_audio_url`
- `confirmed_by_witness`, review fields

### 6.5 Review 🔒
```http
POST /api/statements/{refCode}/review
Authorization: Bearer <staff-jwt>
{ "reviewer_notes": "Ready for counsel" }
```
`reviewed_by` is **ignored if sent** — attribution comes from the verified token's `sub`/`email`, not the request body. Don't render a free-text "reviewer name" input; show the signed-in staff email instead.

### 6.6 Audio
```http
GET /api/statements/{refCode}/audio
→ audio/mpeg
```
**Unauthenticated by design, currently** — this feeds an `<audio src>` tag directly, which can't carry an `Authorization` header. Known open gap (not yet a signed-URL flow); don't build UI that assumes this is staff-only.

### 6.7 PDF 🔒
```http
POST /api/statements/{refCode}/pdf
Authorization: Bearer <staff-jwt>
→ application/pdf
```

### 6.8 Clusters 🔒
```http
GET /api/dashboard/clusters
→ { "items": [ { "id", "cluster_label", "statement_count", "composite_score", "collusion_warning", ... } ] }

GET /api/dashboard/clusters/{clusterId}
→ {
  "id", "cluster_label", "statement_count", "composite_score",
  "field_results": [...],
  "consensus_recommendation": "...",
  "linked_statements": [...],
  "collusion_warning": false
}
```

### 6.9 KPIs 🔒
```http
GET /api/kpis
```
(also mirrored at `GET /api/dashboard/kpis`)

### 6.10 Tool endpoints (agent / advanced demo)
Normally invoked by the voice agent, not the dashboard. Useful for scripted demos:

| Method | Path |
|---|---|
| POST | `/api/tools/save_witness_statement` |
| POST | `/api/tools/flag_inconsistency` |
| POST | `/api/tools/flag_intimidation` |
| POST | `/api/tools/enable_privacy_mode` |
| POST | `/api/tools/assess_protection_need` |
| POST | `/api/tools/confirm_statement` |

Common envelope:
```json
{
  "session_id": "room-or-session-id",
  "arguments": { "...tool fields..." }
}
```
Tool responses often include `{ "result": {...}, "presentationInstructions": "..." }` for the agent to speak.

### 6.11 Internal (not for public UI)
- `POST /api/internal/trigger-corroboration-analysis`
- `POST /api/internal/generate-protection-referral`

---

## 7. Status & badge design tokens (suggested)

| Status / flag | Badge | Color intent |
|---|---|---|
| `pending_review` | Pending | Amber |
| `urgent_escalation` | Urgent | Red |
| `reviewed` | Reviewed | Green/teal |
| `incomplete` | Incomplete | Gray |
| `intimidation_flag` | Threatened | Red outline |
| `inconsistency_flags.length > 0` | Flagged | Orange |
| `privacy_mode` | Anonymous | Slate |
| `corroboration_score >= 0.7` | Corroborated* | Green |
| `corroboration_score < 0.4` | Conflicting* | Amber |
| `collusion_warning` | Collusion check | Yellow |

\*Always with §162 disclaimer.

Language chips: `ur` → Urdu, `pa` → Punjabi, `ps` → Pashto (limited), `mixed` → Mixed.

RTL: for `ur` / `pa` / `ps` narrative blocks use `dir="rtl"`.

---

## 8. End-to-end demo flow (frontend choreography)

1. Landing → **Start demo**
2. `/demo` → `createSession` → connect Uplift room
3. Agent runs Phase 0–4 (voice); tools hit backend
4. On save: note `refCode` from tool result / poll dashboard
5. Open `/dashboard/{refCode}` → play readback → show flags/protection
6. Open linked `/clusters/{id}` → show corroboration map + disclaimer
7. Mark reviewed → show KPI strip update

Fallback if WebRTC SDK unavailable: button that calls `createSession` and displays token/wsUrl + “connected (mock)” while you seed tools via REST for the demo.

---

## 9. TypeScript contracts (copy into frontend)

Prefer keeping these in `lib/types.ts` / `lib/api.ts` (already sketched under `client/`).

Critical types:
- `StatementStatus`
- `StatementSummary` / `StatementDetail`
- `InconsistencyFlag`
- `ProtectionReferral`
- `ClusterSummary` / `ClusterDetail` / `FieldCorroboration`
- `KpiResponse`
- `SessionCreateResponse`
- `ReviewPayload`

Fetch helper rules:
- `cache: "no-store"` for dashboard data
- Throw on non-2xx with `detail` from FastAPI
- Encode `refCode` in URLs
- Attach `Authorization: Bearer <token>` on every 🔒 route when a Supabase session exists; send no header otherwise (this is what `gawahFetch` in `lib/api.ts` already does — reuse it rather than raw `fetch`)

---

## 10. Env for frontend template

This is a **Vite** app (`frontend/artifacts/gawah-frontend`), not Next.js — env vars are `VITE_`-prefixed and read via `import.meta.env`, not `NEXT_PUBLIC_`.

```env
VITE_API_URL=http://localhost:8000        # usually leave blank locally; Vite proxies /api
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your_publishable_key   # publishable key only, never the secret key
```

Backend (never in frontend env): Uplift + OpenRouter + `SUPABASE_SERVICE_KEY` live in `gawah-backend/.env` only.

---

## 11. Error handling (UI)

| Situation | UX |
|---|---|
| Backend down | Banner from `/health` failure |
| 401 on a 🔒 route | Redirect to `/login?next=…` (handled by `RequireAuth`); don't retry silently |
| 404 statement | “Reference code not found” |
| 404 audio | Hide player / “Readback audio not ready” |
| Session create fails | Show error; allow retry |
| `demo: true` session | Badge “Offline demo session” (no real Uplift) |
| Empty dashboard | Empty state + link to Demo |

---

## 12. Edge cases the UI should respect

| Edge case | UI behavior |
|---|---|
| Approximate time | Show verbatim; “approximate” chip if `temporal_uncertainty` |
| Delay > 30 days | Warning chip (`delayed_statement_high_risk`) |
| Privacy mode | No name/address fields; anonymous badge |
| Intimidation | Urgent styling; protection panel |
| Incomplete call | Status incomplete; show `call_phase_at_disconnect` if present |
| Pashto | Honest “limited support” copy — don’t fake full Pashto UX |
| Joint statement | Copy: separate session / separate ref code per speaker |
| Collusion warning | Yellow warning, not “perfect agreement” celebration |
| §162 scores | Always disclaimer; never “court corroboration” |

---

## 13. What NOT to build in frontend (MVP)

- Building your own JWT verification or session storage — Supabase Auth + `AuthProvider`/`useAuth` (`lib/auth-context.tsx`) already handle this; `RequireAuth` already wraps the gated routes
- A public "free dashboard" reading live `/api/dashboard/*` — discussed as a possible future mock/demo surface over the seeded data, not built; don't wire the public site to the real gated API to fake open access
- Thumbprint / e-sign capture
- Claiming PDPA compliance (see `COMPLIANCE_FUTURE_WORK.md`)
- Editing witness narrative as “truth” without audit (review notes only)
- Showing full statement on unverified public callback lookup

---

## 14. Local run checklist (for integration day)

```bash
# Terminal A — backend
source .venv/bin/activate
.venv/bin/uvicorn app.main:app --app-dir gawah-backend --reload --port 8000

# Terminal B — frontend
cd client   # or your new template folder
# set NEXT_PUBLIC_API_URL=http://localhost:8000
npm run dev
```

Verify: `http://localhost:8000/health` then hit dashboard pages.

---

## 15. Existing client scaffold

There is already a Next.js scaffold under `client/` with routes and API helpers aligned to this PRD. When you provide a new template, we will:

1. Map template screens → routes above  
2. Reuse / port `lib/api.ts` + `lib/types.ts`  
3. Wire env + CORS  
4. Keep visual system from your template; keep data contracts from this PRD  

---

## 16. Glossary

| Term | Meaning |
|---|---|
| Ref code | 6-char public reference (e.g. `X5QB2H`) |
| Readback | Structured statement spoken/played back for confirmation |
| Cluster | Group of statements about the same incident |
| Corroboration score | Pre-litigation agreement score across witnesses |
| Protection referral | Suggested provincial/federal witness-protection pathway |

---

*PRD generated from the implemented FastAPI backend (Gawah hackathon MVP). For live OpenAPI schemas always prefer `/docs`.*
