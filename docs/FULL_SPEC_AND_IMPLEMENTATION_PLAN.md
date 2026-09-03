# Voice AI Enabled Orchestration Engine (Gawah) — Application Specification
**Product: Gawah (گواہ)** — voice-first witness statement system for Pakistan's criminal justice pipeline  
*Originated at Uplift AI × Replit Voice AI Hackathon (2026) · Voice infrastructure: Uplift AI · Code generation reference document*

> **Document note:** This is the single merged and authoritative specification, incorporating the base spec, all addendum patches, and two new validated features: Section 16 (Intra-Statement Inconsistency Detection Engine) and Section 17 (Multi-Witness Consensus & Corroboration Layer).

> **⚠️ Superseded implementation details — read before copying code from this doc.** The product spec (engines, KPI edge cases, legal taxonomy, feature catalog) is still the design intent. But this is the **pre-implementation draft**, written before the actual build, and several concrete details below were intentionally changed and are now wrong:
> - **Auth/DB code samples use a Node.js `supabase-js` client and plain `Authorization: Bearer $UPLIFTAI_API_KEY`-style auth.** The real backend is Python/FastAPI. Staff auth is Supabase Auth with **ES256 JWT verified locally against JWKS** (`gawah-backend/app/auth.py`) — never a shared secret, never a per-request Auth-server round trip.
> - **RLS policies here use `USING (true)` / a `user_id` ownership column.** The live schema uses **`workspace_id`** instead — `user_id` never populates because witnesses are anonymous and statements are written server-side, not by a logged-in creator.
> - **This draft only names `sessions`/`statements` for auth scoping.** The live schema scopes `calls`, `kpi_events`, and `incident_clusters` too (six tables total, all RLS-enabled).
> - **`/login` here is a bare Node auth sketch.** The real login UI is `frontend/artifacts/gawah-frontend/src/pages/login.tsx` + `lib/auth-context.tsx`.
> - Readback audio here targets a `statements` Storage bucket; the live (and correct) target is the private `readback-audio` bucket — see CLAUDE.md for the live bug where this is still misconfigured.
>
> For the current, verified auth design and gated-route list, read the **Authentication** section of the repo-root `CLAUDE.md`. For the current API contract, read `docs/BACKEND_PRD_FOR_FRONTEND.md`.

---

## 1. Project Overview

Gawah (گواہ, "witness" in Urdu) is a voice agent that lets witnesses in Pakistan submit legally structured statements by phone — in Punjabi or Urdu — without visiting a police station, without literacy, and without a smartphone.

The agent:
1. Receives an inbound call (or initiates an outbound one)
2. Converses with the witness in their spoken language
3. Conducts a CrPC Section 161-compliant witness examination
4. Extracts a structured 5-field legal statement using an LLM
5. Reads the statement back to the witness for spoken confirmation
6. Issues a 6-character voice-accessible reference code
7. Flags internal inconsistencies and intimidation signals silently
8. Detects and scores multi-witness corroboration and conflict across linked statements
9. Delivers a structured JSON + PDF output to a lawyer/NGO dashboard

### Problem being solved
- Pakistan's national conviction rate is ~8.66% (PILDAT); Balochistan sees 2% (2024)
- Rape conviction rate nationally is below 3% (2023)
- Witness testimony withdrawal is peer-reviewed as the primary acquittal driver
- **Many witnesses never report at all** — fear of personal exposure and retaliation
- **Reports that are filed often disappear** — written on paper, in a drawer, in a station the witness is afraid to return to
- Courts operate in Urdu; 48% of Pakistan speaks Punjabi as mother tongue; 8% speaks Pashto
- Witnesses currently thumbprint documents they cannot read, written by constables in a language they don't speak
- Rural female literacy is ~40%; station visits are physically dangerous for many witnesses

### What Gawah changes
- Zero literacy requirement — fully voice-driven
- CrPC Section 161-compliant examination sequence, not an ad-hoc précis
- Witness hears their statement read back before confirming — informed consent, not a blind thumbprint
- Phone-only — no smartphone, no internet, no station visit required (**feature, not a limitation**; dedicated smartphone app is out of scope — it would undercut the PSTN thesis; realistic future work is **WhatsApp voice-note intake**, not a native app)
- Privacy mode — identity decoupled from statement for sensitive cases
- **Anonymized reporting** — witness identity decoupled from statement by design; caller ID masked; no PII stored without explicit consent; allows on-record statements without personal exposure (“go on record without going on record”)
- **Immutable timestamped record** — eliminates the “lost report” failure mode; reference code is proof of submission independent of police custody of the paper document
- Automatic **intra-statement consistency analysis** (not “lie detection”) and intimidation flagging for NGO escalation
- Automatic witness protection referral for qualifying cases (e.g. Punjab Witness Protection Act 2018; other provinces have distinct frameworks)
- Multi-witness corroboration scoring to replace manual cross-referencing by lawyers

### 1.5 Legal scope clarification

Gawah produces **Section 161** statements (investigative, police-level) under the **Code of Criminal Procedure, 1898** (as amended) — Pakistan retained CrPC numbering (not India’s BNSS). These are **not** Section **164** statements (magistrate-level, evidentiary). Section 161 statements cannot be used as substantive evidence in court but are used to refresh witness memory and detect cross-examination inconsistencies; under **Section 162**, §161 statements must not be signed — voice confirmation with stored audio is the legally defensible confirmation mechanism. Gawah makes the Section 161 record accurate and verbatim — the problem it solves is that current constable-written précis documents are neither. The agent does not give legal advice and does not produce court-admissible evidence or corroboration directly.

### 1.6 Data compliance (PDPA 2023 design)

- **Applicability:** Witness voice, optional identity, offence narrative, and protection data are treated as personal / sensitive data under Pakistan’s **Personal Data Protection Act 2023** obligations (consent, purpose limitation, breach readiness).
- **Consent:** Collected in the Phase 0 caution script **before** any fact-gathering — explicit PDPA-aligned voluntariness + purpose notice.
- **Sensitive data:** Stricter handling — no PII stored without explicit consent; purpose limited to legal proceedings / NGO assistance; no sale, brokerage, or secondary transfer of statement data.
- **Residency note:** Hackathon / demo may use encrypted Supabase EU (or equivalent) storage; production targets a Pakistan-hosted instance or AWS `ap-south-1` (Mumbai) path for soft localization expectations.

---

## 2. Tech Stack

### APIs and Services

| Service | Purpose | Notes |
|---|---|---|
| **Uplift AI Realtime Assistants** | Core voice agent (STT + TTS + LLM orchestration) | Primary integration; WebRTC delivery |
| **Uplift AI TTS REST API** | Statement readback audio synthesis | Endpoint: `POST /v1/synthesis/text-to-speech` |
| **Uplift AI STT API** | Urdu transcription of uploaded audio | Endpoint: `POST /v1/transcribe/speech-to-text` |
| **Groq Whisper large-v3** | Punjabi STT (fallback within Realtime Assistants) | Used as Uplift STT provider inside assistant config |
| **Groq LLM** | Structured extraction + inconsistency flagging | Model: `openai/gpt-oss-120b` |
| **Twilio (or equivalent)** | PSTN telephony — inbound phone number + call routing | Webhooks to trigger session creation |
| **Supabase** | Statement storage, reference code lookup, case dashboard | Postgres + Row Level Security |

### Frontend
- React (dashboard for lawyers/NGOs)
- `@upliftai/assistants-react` SDK for browser-based voice sessions (demo mode)
- Tailwind CSS

### Backend
- Node.js / Express
- Uplift AI Node.js SDK (`@upliftai/api`)
- Supabase JS client

### Environment Variables Required
```
UPLIFTAI_API_KEY=sk_...
GROQ_API_KEY=...
SUPABASE_URL=https://...
SUPABASE_SERVICE_KEY=...
TWILIO_ACCOUNT_SID=...
TWILIO_AUTH_TOKEN=...
TWILIO_PHONE_NUMBER=+92...
NGO_WEBHOOK_URL=https://...
```

---

## 3. Uplift AI Integration — Exact API Usage

### 3.1 Realtime Assistant — Create Once on Server Startup

```bash
POST https://api.upliftai.org/v1/realtime-assistants
Authorization: Bearer $UPLIFTAI_API_KEY
Content-Type: application/json
```

```json
{
  "name": "Gawah Witness Agent",
  "description": "Records witness statements in Urdu and Punjabi for Pakistan's legal system",
  "config": {
    "agent": {
      "instructions": "You are Gawah, a digital witness examination system operating under Pakistan CrPC Section 161 (Examination of Witnesses by Police), 1898.\n\nYour conduct must comply with how a professional Investigating Officer (IO) conducts a lawful witness examination. You are NOT a lawyer. You do NOT advise. You record what the witness says, in their own words, in the first person, verbatim — not summarised, not paraphrased, not reordered.\n\n═══════════════════════════════════\nPHASE 0 — IDENTITY AND CAUTION (mandatory, non-skippable)\n═══════════════════════════════════\nBefore collecting any facts, complete these steps in order:\n\n1. STATE YOUR PURPOSE:\n   \"Main Gawah hoon — ek raqami gawahi darz karne ka nizam jo Pakistan ke qanoon ke tehat kaam karta hai. Aap ka bayan CrPC dhara 161 ke tehat darz hoga.\"\n\n2. CONFIRM VOLUNTARINESS (legally required — mirrors Magistrate caution under CrPC 164):\n   \"Aap ka bayan bilkul ikhtiyari hai. Koi aap ko majboor nahi kar raha. Kya aap apni marzi se bayan dena chahte hain?\"\n   — If witness says no or hesitates: \"Theek hai. Jab chahen wapis aa sakein. Khuda hafiz.\"\n   — If witness says yes: proceed.\n\n3. ESTABLISH WITNESS IDENTITY (basic, not coercive):\n   \"Aap ka naam kya hai?\" — accept \"main naam nahi batana chahta\" → call enable_privacy_mode, continue.\n   \"Aap ka is waqie se kya taluq hai? Kya aap ne khud yeh dekha, ya kisi ne aap ko bataya?\"\n   — Record whether witness is eyewitness (عینی شاہد), hearsay witness (سماعتی شاہد), or victim (مشتکی).\n\n4. WARN ABOUT TRUTHFULNESS (CrPC 161(2)):\n   \"Qanoon ke mutabiq aap ko sach bolna hoga. Ghalat bayan dena qanooni jurm hai.\"\n\n═══════════════════════════════════\nPHASE 1 — FREE NARRATIVE (mandatory — do NOT interrupt)\n═══════════════════════════════════\nAsk ONE open question and then STOP. Do not prompt, do not guide, do not ask follow-ups until the witness stops talking on their own:\n\n\"Meherbani farma ke aap khud apne alfaaz mein batayen — kya hua?\"\n\nRULES DURING FREE NARRATIVE:\n- Do not speak until witness pauses for more than 5 seconds or explicitly signals they are done\n- Do not say \"acha\", \"theek hai\", \"samajh gaya\" — these can be interpreted as leading\n- If witness goes silent mid-sentence, ask only: \"Aap aur kuch batana chahte hain?\"\n- Record everything verbatim — if witness says \"us ne mujhe mara\" that is what goes in the statement, not \"accused assaulted witness\"\n- Accept fragmented, non-linear, repetitive narrative — do not reorganise it\n\nAfter free narrative is complete: if the witness has described an offence involving death, sexual violence, kidnapping, terrorism, or any offence with a potential sentence of more than 7 years — call assess_protection_need silently, then surface the result to the witness using the presentationInstructions text. Also call if flag_intimidation was triggered at any point in the session.\n\n═══════════════════════════════════\nPHASE 2 — STRUCTURED FOLLOW-UP (Section 161 examination questions)\n═══════════════════════════════════\nOnly after free narrative is complete, ask targeted follow-up questions ONE AT A TIME for any of the five legal fields that are still missing or unclear. Do not ask about a field the witness already covered clearly.\n\nAsk in this order of legal priority:\n\nA. TIME:\n\"Aap ne kaha [incident reference]. Yeh kab hua — taarikh aur waqt, jitna aap ko yaad ho?\"\n→ If approximate: accept what they give.\n→ If they say \"mujhe bilkul yaad nahi\" — record as: \"Waqt waaqir nahi, takmeen [approximate period given by witness].\"\n→ LEGAL NOTE: Ask: \"Yeh waqia kab hua aur aap ne aaj kab decide kiya ke bayan den?\" Record both.\n\nB. LOCATION:\n\"Yeh kahan hua — jagah ka naam, mohalla, ya koi nishani batain?\"\n→ Accept \"meri gali mein\" if no formal address known.\n\nC. PERSONS PRESENT:\n\"Wahan kaun kaun tha? Koi bhi — chahe aap unhe jaante hon ya nahi.\"\n→ For each person: \"Aap unhein jaante hain? Naam kya hai?\" If no name: \"Kaisi shakl thi? Koi khaas nishani?\"\n→ IMPORTANT: Do not use the word \"mulzim\" (accused) yourself. Use whatever the witness uses.\n\nD. SEQUENCE OF EVENTS:\n\"Jo kuch hua, woh pehle se aakhir tak batain — pehle kya hua, phir kya hua?\"\n→ Never suggest what might have happened next.\n\nE. RELATIONSHIP TO ACCUSED:\n\"Jo [person witness named] — aap unhe pehle se jaante hain? Kya rishta hai?\"\n→ Record exactly: neighbour, employer, stranger, family, etc.\n\nF. CORROBORATION SOURCES (standard IO question — often missed):\n\"Kya koi aur tha jo yeh dekh sakta tha? Koi aur gawah?\"\n\"Kya koi cheez hai — photo, message, zakhm, ya kuch aur — jo aap ke bayan ki taeed kare?\"\n\n═══════════════════════════════════\nPHASE 3 — STATEMENT VERIFICATION (readback + confirmation)\n═══════════════════════════════════\nOnce all fields are collected, call save_witness_statement. Then read the structured statement back verbatim:\n\n\"Main aap ka bayan dohraunga. Agar kuch galat ho to abhi bataen — baad mein tabdeeli mushkil hogi.\"\n\n[Read each field clearly]\n\n\"Kya yeh bilkul sahi hai — haan ya nahi?\"\n→ If \"haan\": finalise.\n→ If correction: update the field, re-read that field only, re-confirm.\n→ Maximum 3 correction rounds.\n\n═══════════════════════════════════\nPHASE 4 — CLOSURE + REFERENCE CODE\n═══════════════════════════════════\n\"Aap ka bayan mehfooz ho gaya. Aap ka reference code hai: [CODE]. Main yeh teen baar bolonga: [CODE] — [CODE] — [CODE]. Yeh code yaad rakhein. Isi number par wapis call kar ke aap apne case ka haal puch sakte hain.\"\n\n\"Agar aap ko koi khatra mehsoos ho, ya koi aur yaad aaye — wapis call karein. Shukriya.\"\n\n═══════════════════════════════════\nTHROUGHOUT — SILENT DETECTION RULES\n═══════════════════════════════════\nThese fire at any phase without alerting the witness:\n\nINCONSISTENCY: If witness says X then says something that contradicts X → call flag_inconsistency silently. Continue normally.\n\nINTIMIDATION TRIGGERS — call flag_intimidation silently if witness says any of:\n- \"mujhe daraya gaya hai\" / \"dhamki di gayi\" / \"main darta hoon\"\n- \"mujhe nahi aana chahiye tha\" / \"main ne galti ki aa ke\"\n- \"agar unhein pata chala to\" / \"meray ghar wale nahi chahte\"\n- \"paisa diya gaya\" / \"samjhota ho gaya\" (coercion/settlement)\n- Whispers, long silences after a question about the accused, sudden topic changes\n\nDELAY WARNING: If witness mentions incident happened more than 30 days ago, note this in the statement record. Ask: \"Itne dino baad bayan dene ki kya wajah hai?\"\n\nWOMEN WITNESSES: If witness identifies as female and the offence involves sexual violence or domestic abuse — automatically check whether privacy mode is needed. Do not ask her name or address unless she volunteers it.\n\nDO NOT EVER:\n- Suggest what may have happened\n- Repeat a question after the witness has answered it fully\n- Use the word \"jhoot\" (lie) or imply the witness is untruthful\n- Tell the witness what a good statement should contain\n- Ask the same field twice in the same phrasing if they say they don't know",
      "initialGreeting": true,
      "greetingInstructions": "Assalam-u-Alaikum. Main Gawah hoon — ek digital gawahi darz karne ka nizam. Aap jo kuch bhi bolen ga, woh mehfooz ho jaye ga. Koi bhi aap ki awaaz sun nahi raha — sirf system record kar raha hai. Kya aap apna bayan dena chahte hain?",
      "tools": [
        {
          "name": "save_witness_statement",
          "description": "Save the structured witness statement once all five fields have been collected. Call this when you have enough information — do not wait for perfect answers.",
          "parameters": {
            "type": "object",
            "properties": {
              "time_of_incident": {
                "type": "string",
                "description": "When the incident occurred. Accept approximate references like 'after Isha prayers, approximately 9pm' or 'before the wheat harvest, March 2025'"
              },
              "location": {
                "type": "string",
                "description": "Where the incident occurred. As specific as the witness can give."
              },
              "persons_present": {
                "type": "array",
                "items": { "type": "string" },
                "description": "Names or descriptions of all persons present."
              },
              "sequence_of_events": {
                "type": "string",
                "description": "What happened, in the order it happened. First-person narrative from the witness."
              },
              "relationship_to_accused": {
                "type": "string",
                "description": "How the witness knows or is related to the accused, if any."
              },
              "temporal_uncertainty": {
                "type": "boolean",
                "description": "True if the witness used approximate time references rather than exact times"
              },
              "language_of_call": {
                "type": "string",
                "enum": ["ur", "pa", "ps", "mixed"],
                "description": "Primary language spoken by the witness"
              },
              "witness_type": {
                "type": "string",
                "enum": ["eyewitness", "hearsay", "victim", "unknown"],
                "description": "Type of witness as established in Phase 0"
              },
              "corroboration_sources_mentioned": {
                "type": "array",
                "items": { "type": "string" },
                "description": "Physical evidence, other witnesses, or documents the witness mentioned"
              }
            },
            "required": ["sequence_of_events", "location"]
          },
          "timeout": 15
        },
        {
          "name": "flag_inconsistency",
          "description": "Silently flag an internal contradiction in the witness statement. Call this without alerting the witness.",
          "parameters": {
            "type": "object",
            "properties": {
              "contradiction_description": {
                "type": "string",
                "description": "Plain description of what contradicts what"
              },
              "segment_a": {
                "type": "string",
                "description": "First contradicting statement (quote)"
              },
              "segment_b": {
                "type": "string",
                "description": "Second contradicting statement (quote)"
              },
              "contradiction_type": {
                "type": "string",
                "enum": ["temporal", "spatial", "identity", "sequence", "sensory", "numerical"],
                "description": "Category of inconsistency for dashboard filtering"
              }
            },
            "required": ["contradiction_description"]
          },
          "timeout": 5
        },
        {
          "name": "flag_intimidation",
          "description": "Silently flag that the witness has indicated they have been threatened or pressured. Escalates case to urgent queue.",
          "parameters": {
            "type": "object",
            "properties": {
              "witness_statement": {
                "type": "string",
                "description": "Exact words the witness used that triggered this flag"
              }
            },
            "required": ["witness_statement"]
          },
          "timeout": 5
        },
        {
          "name": "enable_privacy_mode",
          "description": "Switch case to anonymous mode — no personal identity will be collected or stored.",
          "parameters": {
            "type": "object",
            "properties": {
              "reason": {
                "type": "string",
                "description": "Why privacy mode was requested, in witness's own words"
              }
            },
            "required": []
          },
          "timeout": 5
        },
        {
          "name": "assess_protection_need",
          "description": "Call this when the witness has described an offence that may qualify for formal witness protection, OR when intimidation_flag has been triggered. Determines which protection framework applies and generates a referral. Call silently.",
          "parameters": {
            "type": "object",
            "properties": {
              "offence_type": {
                "type": "string",
                "enum": ["terrorism", "sexual_offence", "murder", "kidnapping", "serious_assault", "other"],
                "description": "Category of the offence described"
              },
              "witness_is_victim": {
                "type": "boolean",
                "description": "True if the witness is also the victim of the offence"
              },
              "witness_appears_under_16": {
                "type": "boolean",
                "description": "True if voice/statement context suggests witness may be under 16"
              },
              "intimidation_already_flagged": {
                "type": "boolean",
                "description": "True if flag_intimidation was already called this session"
              },
              "province": {
                "type": "string",
                "enum": ["Punjab", "Sindh", "Balochistan", "KPK", "Federal", "unknown"],
                "description": "Province where the offence occurred, if stated"
              }
            },
            "required": ["offence_type"]
          },
          "timeout": 10
        }
      ]
    },
    "stt": {
      "default": {
        "provider": "groq",
        "model": "whisper-large-v3",
        "language": "ur"
      }
    },
    "tts": {
      "default": {
        "provider": "upliftai",
        "voiceId": "ai_lwr_f_fb",
        "outputFormat": "MP3_22050_32"
      }
    },
    "llm": {
      "default": {
        "provider": "groq",
        "model": "openai/gpt-oss-120b"
      }
    },
    "session": {
      "ttl": 1800
    }
  }
}
```

**Store the returned `assistantId` in your environment — you reuse it for every call session.**

---

### Legal Compliance Notes for the Agent Prompt

The agent prompt above is modelled on the following legal requirements:

**CrPC Section 161(1)** — Any police officer conducting an investigation may orally examine any person acquainted with facts of the case. Gawah replicates this oral examination digitally.

**CrPC Section 161(3)** — The statement must be recorded *as actually made*. Sub-section (3) explicitly *prohibits a précis*. This is why the agent collects verbatim first-person narrative and the `save_witness_statement` tool stores `sequence_of_events` as the witness's own words, not an LLM-generated summary.

**CrPC Section 162** — Statements recorded under Section 161 can be used by the defence to *contradict* a prosecution witness at trial. Every discrepancy between the Gawah record and court testimony will be examined. This is why the readback step and the inconsistency flag exist — they reduce the contradiction surface before the statement is finalised.

**Delay doctrine** — Pakistani courts consistently rule that delay in recording a statement "reduces its value to nil unless there is plausible explanation" (1996 SCMR 1553, Abdul Khaliq). The agent records the time of call (timestamp) AND asks the witness to explain any gap between the incident and their decision to give a statement.

**Women witnesses** — The Punjab Prosecutor General's office has held that women witnesses should be examined at their homes rather than at a police station (2 Cr.LJ 51, Haladhar Bahimji v. Sub-Inspector Police). Gawah's phone-based model is the direct digital equivalent of this long-standing principle.

**Voluntariness** — Statements are only admissible if voluntary. The Phase 0 caution script satisfies this requirement and mirrors the Magistrate caution required under Section 164 for confessions.

**Corroboration doctrine** — The Punjab Prosecutor General's case database establishes that even eyewitness presence at the spot does not guarantee credibility without independent corroboration (PLJ 1995 SC 636, Muhammad Jahangir). This is why Phase 2 always asks about corroboration sources and why the multi-witness corroboration layer (Section 17) exists.

---

### 3.2 Session Creation — Per Call

Every inbound call (or browser demo session) gets its own session:

```bash
POST https://api.upliftai.org/v1/realtime-assistants/{assistantId}/createSession
Authorization: Bearer $UPLIFTAI_API_KEY
Content-Type: application/json

{
  "participantName": "Witness"
}
```

Response gives you `token` and `wsUrl` — pass these to the frontend React SDK.

---

### 3.3 TTS REST — Statement Readback Audio File

After `save_witness_statement` tool is called and the LLM composes the readback text, generate and store the audio:

```bash
POST https://api.upliftai.org/v1/synthesis/text-to-speech
Authorization: Bearer $UPLIFTAI_API_KEY
Content-Type: application/json

{
  "voiceId": "ai_lwr_f_fb",
  "text": "<readback_text_in_urdu>",
  "outputFormat": "MP3_22050_128"
}
```

Store the returned audio binary to Supabase Storage under `statements/{refCode}/readback.mp3`.

---

### 3.4 STT REST — Transcribing Pre-Recorded Audio (Optional / Admin Use)

```bash
POST https://api.upliftai.org/v1/transcribe/speech-to-text
Authorization: Bearer $UPLIFTAI_API_KEY
Content-Type: multipart/form-data

file=@recording.mp3
model=scribe
language=ur
```

Use `scribe` (not `scribe-mini`) for legal statements — accuracy is non-negotiable.

---

### 3.5 React SDK — Browser Demo Mode

```jsx
import { UpliftAIRoom, useUpliftAIRoom } from '@upliftai/assistants-react';

function GawahDemoSession({ sessionToken, wsUrl }) {
  return (
    <UpliftAIRoom
      token={sessionToken}
      serverUrl={wsUrl}
      connect={true}
      audio={true}
      tools={[
        saveStatementTool,
        flagInconsistencyTool,
        flagIntimidationTool,
        enablePrivacyModeTool,
        assessProtectionNeedTool
      ]}
    >
      <GawahCallUI />
    </UpliftAIRoom>
  );
}
```

---

## 4. Tool Handler Implementations

These run client-side (browser demo) or server-side (production phone flow). Implement all five.

```javascript
// utils/tools.js

import { supabase } from './supabaseClient';

// ---- Helper ----
function generateRefCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no ambiguous chars (0/O, 1/I)
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

// ---- Tool 1: Save Statement ----
export const saveStatementTool = {
  name: 'save_witness_statement',
  handler: async (data) => {
    try {
      const payload = JSON.parse(data.payload);
      const fields = payload.arguments.raw_arguments;
      const refCode = generateRefCode();
      const timestamp = new Date().toISOString();

      const { error } = await supabase.from('statements').insert({
        ref_code: refCode,
        time_of_incident: fields.time_of_incident || null,
        location: fields.location,
        persons_present: fields.persons_present || [],
        sequence_of_events: fields.sequence_of_events,
        relationship_to_accused: fields.relationship_to_accused || null,
        temporal_uncertainty: fields.temporal_uncertainty || false,
        language_of_call: fields.language_of_call || 'ur',
        witness_type: fields.witness_type || 'unknown',
        corroboration_sources_mentioned: fields.corroboration_sources_mentioned || [],
        privacy_mode: false,
        intimidation_flag: false,
        inconsistency_flags: [],
        status: 'pending_review',
        created_at: timestamp,
      });

      if (error) throw error;

      const readbackText = buildReadbackText(fields);
      await generateAndStoreReadbackAudio(refCode, readbackText);

      // Trigger multi-witness cross-reference job (Section 17)
      await fetch('/api/internal/trigger-corroboration-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refCode, sessionId: getCurrentSessionId() })
      });

      return JSON.stringify({
        result: { refCode, readbackText },
        presentationInstructions:
          `Theek hai. Ab main aap ka bayan dohraunga. Ghoor se sunein aur batain: kya yeh sahi hai?\n\n` +
          readbackText +
          `\n\nAap ka reference code hai: ${refCode}. Yahi code yaad rakhein — ${refCode} — ${refCode}.`
      });
    } catch (err) {
      return JSON.stringify({
        error: err.message,
        presentationInstructions: 'Mujhe khed hai, bayan mehfooz karne mein masla aaya. Kya aap dobara koshish karenge?'
      });
    }
  }
};

// ---- Tool 2: Flag Inconsistency ----
export const flagInconsistencyTool = {
  name: 'flag_inconsistency',
  handler: async (data) => {
    try {
      const payload = JSON.parse(data.payload);
      const { contradiction_description, segment_a, segment_b, contradiction_type } = payload.arguments.raw_arguments;

      await supabase.rpc('append_inconsistency_flag', {
        p_session_id: getCurrentSessionId(),
        p_flag: {
          contradiction_description,
          segment_a,
          segment_b,
          contradiction_type: contradiction_type || 'unknown',
          flagged_at: new Date().toISOString()
        }
      });

      return JSON.stringify({ result: { flagged: true }, presentationInstructions: '' });
    } catch (err) {
      return JSON.stringify({ result: { flagged: false }, presentationInstructions: '' });
    }
  }
};

// ---- Tool 3: Flag Intimidation ----
export const flagIntimidationTool = {
  name: 'flag_intimidation',
  handler: async (data) => {
    try {
      const payload = JSON.parse(data.payload);
      const { witness_statement } = payload.arguments.raw_arguments;

      await supabase.from('statements')
        .update({
          intimidation_flag: true,
          intimidation_text: witness_statement,
          status: 'urgent_escalation'
        })
        .eq('session_id', getCurrentSessionId());

      await fetch(process.env.NGO_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'INTIMIDATION_DETECTED',
          session_id: getCurrentSessionId(),
          witness_statement,
          timestamp: new Date().toISOString()
        })
      });

      return JSON.stringify({ result: { escalated: true }, presentationInstructions: '' });
    } catch (err) {
      return JSON.stringify({ result: { escalated: false }, presentationInstructions: '' });
    }
  }
};

// ---- Tool 4: Enable Privacy Mode ----
export const enablePrivacyModeTool = {
  name: 'enable_privacy_mode',
  handler: async (data) => {
    try {
      await supabase.from('statements')
        .update({ privacy_mode: true })
        .eq('session_id', getCurrentSessionId());

      return JSON.stringify({
        result: { privacy_mode: true },
        presentationInstructions:
          'Theek hai. Aap ki pehchaan bilkul mehfooz rahegi. Koi naam, pata, ya shakhsi maloomat nahi puchi jayegi.'
      });
    } catch (err) {
      return JSON.stringify({ result: { privacy_mode: false }, presentationInstructions: '' });
    }
  }
};

// ---- Tool 5: Assess Protection Need ----
export const assessProtectionNeedTool = {
  name: 'assess_protection_need',
  handler: async (data) => {
    const payload = JSON.parse(data.payload);
    const { offence_type, witness_is_victim, witness_appears_under_16,
            intimidation_already_flagged, province } = payload.arguments.raw_arguments;

    let protectionAct = {
      Punjab: 'Punjab Witness Protection Act 2018 — Unit II (Serious Offences)',
      Sindh: 'Sindh Witness Protection Act 2013',
      Balochistan: 'Balochistan Witness Protection Act 2016',
      KPK: 'Federal Witness Protection, Security and Benefit Act 2017',
      Federal: 'Federal Witness Protection, Security and Benefit Act 2017',
    }[province] || 'Federal Witness Protection, Security and Benefit Act 2017';

    if (offence_type === 'terrorism' && province === 'Punjab') {
      protectionAct = 'Punjab Witness Protection Act 2018 — Unit I (Terrorism)';
    }

    const qualifies =
      ['terrorism', 'sexual_offence', 'murder', 'kidnapping'].includes(offence_type) ||
      witness_appears_under_16 || intimidation_already_flagged || witness_is_victim;

    await supabase.from('statements')
      .update({
        offence_category: offence_type,
        witness_age_under_16: witness_appears_under_16 || false,
        protection_referral_generated: qualifies,
        applicable_protection_act: qualifies ? protectionAct : null,
      })
      .eq('session_id', getCurrentSessionId());

    if (qualifies) {
      await fetch('/api/internal/generate-protection-referral', {
        method: 'POST',
        body: JSON.stringify({ sessionId: getCurrentSessionId(), act: protectionAct })
      });
    }

    return JSON.stringify({
      result: { qualifies, applicable_act: protectionAct },
      presentationInstructions: qualifies
        ? `Main aap ko ek zaruri baat batana chahta hoon: Pakistan ka qanoon aap ki hifazat ka intezam karta hai. ` +
          `Agar aap chahein to hum ek darkhwast tayyar kar sakte hain jo ${protectionAct} ke tehat ` +
          `aap ko tahaffuz de sakta hai. Kya aap chahte hain ke hum aap ke case ke NGO partner ko yeh darkhwast bhejen?`
        : ''
    });
  }
};

// ---- Helper: Build Readback Text ----
function buildReadbackText(fields) {
  const parts = [];
  if (fields.time_of_incident) parts.push(`Waqia: ${fields.time_of_incident} ko hua.`);
  if (fields.location) parts.push(`Jagah: ${fields.location}.`);
  if (fields.persons_present?.length) parts.push(`Maujood afraad: ${fields.persons_present.join(', ')}.`);
  if (fields.sequence_of_events) parts.push(`Waqiat: ${fields.sequence_of_events}`);
  if (fields.relationship_to_accused) parts.push(`Mulzim se taluq: ${fields.relationship_to_accused}.`);
  return parts.join('\n');
}

// ---- Helper: TTS Readback Audio ----
async function generateAndStoreReadbackAudio(refCode, text) {
  const response = await fetch('https://api.upliftai.org/v1/synthesis/text-to-speech', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.UPLIFTAI_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ voiceId: 'ai_lwr_f_fb', text, outputFormat: 'MP3_22050_128' })
  });

  const audioBuffer = await response.arrayBuffer();
  await supabase.storage
    .from('statements')
    .upload(`${refCode}/readback.mp3`, audioBuffer, {
      contentType: 'audio/mpeg',
      upsert: true
    });
}
```

---

## 5. Database Schema (Supabase / Postgres)

```sql
CREATE TABLE statements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ref_code VARCHAR(6) UNIQUE NOT NULL,
  session_id TEXT,

  -- Core statement fields
  time_of_incident TEXT,
  location TEXT NOT NULL,
  persons_present TEXT[] DEFAULT '{}',
  sequence_of_events TEXT NOT NULL,
  relationship_to_accused TEXT,
  temporal_uncertainty BOOLEAN DEFAULT FALSE,
  language_of_call VARCHAR(10) DEFAULT 'ur',

  -- Witness type (Section 161 legal distinction)
  witness_type VARCHAR(30),  -- 'eyewitness' | 'hearsay' | 'victim' | 'unknown'
  corroboration_sources_mentioned TEXT[] DEFAULT '{}',

  -- Delay tracking (required by court doctrine)
  statement_delay_days INTEGER,
  statement_delay_explanation TEXT,
  delayed_statement_high_risk BOOLEAN DEFAULT FALSE,

  -- Flags
  privacy_mode BOOLEAN DEFAULT FALSE,
  intimidation_flag BOOLEAN DEFAULT FALSE,
  intimidation_text TEXT,
  inconsistency_flags JSONB DEFAULT '[]',

  -- Protection fields
  offence_category VARCHAR(50),
  witness_age_under_16 BOOLEAN DEFAULT FALSE,
  witness_is_victim BOOLEAN DEFAULT FALSE,
  protection_referral_generated BOOLEAN DEFAULT FALSE,
  protection_referral_url TEXT,
  applicable_protection_act TEXT,
  preferred_contact_method VARCHAR(50) DEFAULT 'phone',
  safe_contact_time TEXT,

  -- Statement integrity
  corrections_count INTEGER DEFAULT 0,
  confirmed_by_witness BOOLEAN DEFAULT FALSE,
  confirmation_audio_url TEXT,

  -- Call integrity
  background_noise_flagged BOOLEAN DEFAULT FALSE,
  third_party_presence_flagged BOOLEAN DEFAULT FALSE,
  call_phase_at_disconnect VARCHAR(30),

  -- Multi-witness corroboration (populated post-call by background job)
  incident_cluster_id UUID,                -- FK to incident_clusters table
  corroboration_score NUMERIC(4,3),        -- 0.000–1.000 composite score (Section 17)
  corroboration_detail JSONB DEFAULT '{}', -- field-level breakdown

  -- Status
  status VARCHAR(50) DEFAULT 'pending_review',
  -- values: pending_review | urgent_escalation | reviewed | submitted | incomplete | archived

  -- Audit
  created_at TIMESTAMPTZ DEFAULT now(),
  reviewed_at TIMESTAMPTZ,
  reviewed_by TEXT,
  reviewer_notes TEXT,

  -- Audio evidence
  readback_audio_url TEXT,
  call_recording_url TEXT
);

CREATE INDEX idx_ref_code ON statements(ref_code);
CREATE INDEX idx_status ON statements(status, created_at DESC);
CREATE INDEX idx_cluster ON statements(incident_cluster_id);

ALTER TABLE statements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_users_read" ON statements
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "service_role_all" ON statements
  FOR ALL TO service_role USING (true);

-- Incident clusters table (Section 17)
CREATE TABLE incident_clusters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cluster_label TEXT,               -- e.g. "Mohalla Hussain Abad, 7 Aug 2026 night"
  incident_date_range TSTZRANGE,    -- temporal span of statements in the cluster
  incident_location TEXT,           -- normalised location text
  statement_count INTEGER DEFAULT 0,
  consensus_summary JSONB,          -- Section 17 consensus output
  conflict_map JSONB,               -- Section 17 conflict field map
  cluster_status VARCHAR(30) DEFAULT 'open',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Stored procedure for appending inconsistency flags
CREATE OR REPLACE FUNCTION append_inconsistency_flag(
  p_session_id TEXT,
  p_flag JSONB
) RETURNS VOID AS $$
BEGIN
  UPDATE statements
  SET inconsistency_flags = inconsistency_flags || p_flag
  WHERE session_id = p_session_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

---

## 5a. Witness Protection Integration

### Legal Framework

Pakistan has four active witness protection statutes Gawah must be aware of:

| Jurisdiction | Act | Trigger Offences |
|---|---|---|
| Punjab | Punjab Witness Protection Act 2018 | Terrorism, serious offences (death/life/7+ years), sexual offences |
| Sindh | Sindh Witness Protection Act 2013 | Serious offences |
| Balochistan | Balochistan Witness Protection Act 2016 | Serious offences |
| Federal | Witness Protection, Security and Benefit Act 2017 | All areas not covered provincially |

KPK has no dedicated witness protection legislation as of August 2026.

**Qualifying conditions under Punjab Witness Protection Act 2018:** A witness qualifies if they are fearful due to the nature of the offence, intimidated or under threat to their person or family, a victim of a sexual offence, under the age of 16, or suffering from physical disability or mental disorder.

**What protection can include:** close protection service, temporary relocation/safe house, change of identity, restricted courtroom access, anonymity during testimony, bar on accused personally cross-examining the witness (counsel only).

### Dashboard UI — Witness Protection Section

On the StatementDetail page, add a "Witness Protection" section:

```
┌─────────────────────────────────────────────┐
│  WITNESS PROTECTION                          │
│  ─────────────────────────────────────────  │
│  Status: REFERRAL GENERATED  [red badge]     │
│  Applicable Act: Punjab WPA 2018 – Unit II   │
│  Grounds: Victim of sexual offence           │
│                                              │
│  [Download Referral PDF]  [Mark Submitted]   │
└─────────────────────────────────────────────┘
```

---

## 6. Backend API Routes (Express / Node.js)

```
POST /api/sessions/create                       — Create Uplift AI session for a call
POST /api/sessions/twilio-webhook               — Twilio inbound call webhook
GET  /api/statements/:refCode                   — Status lookup by reference code
GET  /api/dashboard/statements                  — All statements (authenticated)
POST /api/statements/:refCode/review            — Mark reviewed + add notes
GET  /api/statements/:refCode/audio             — Serve readback audio file
POST /api/internal/trigger-corroboration-analysis — Queue multi-witness analysis job
POST /api/internal/generate-protection-referral   — Generate protection referral PDF
GET  /api/dashboard/clusters                    — Incident cluster list
GET  /api/dashboard/clusters/:clusterId         — Cluster detail with consensus
```

### Session Creation Route

```javascript
// routes/sessions.js
import express from 'express';
const router = express.Router();

router.post('/create', async (req, res) => {
  try {
    const response = await fetch(
      `https://api.upliftai.org/v1/realtime-assistants/${process.env.UPLIFT_ASSISTANT_ID}/createSession`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.UPLIFTAI_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ participantName: 'Witness' })
      }
    );

    const sessionData = await response.json();

    await supabase.from('sessions').insert({
      room_name: sessionData.roomName,
      created_at: new Date().toISOString(),
      status: 'active'
    });

    res.json(sessionData);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
```

### Twilio Webhook (Inbound Phone Call)

```javascript
router.post('/twilio-webhook', async (req, res) => {
  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say language="ur-PK">Gawah mein khush aamdeed. Aap ka connection ho raha hai.</Say>
  <Connect>
    <Stream url="wss://your-bridge-server.com/twilio-to-webrtc" />
  </Connect>
</Response>`;
  res.type('text/xml').send(twiml);
});
```

### Reference Code Lookup Route

```javascript
router.get('/statements/:refCode', async (req, res) => {
  const { refCode } = req.params;
  const { data, error } = await supabase
    .from('statements')
    .select('ref_code, status, created_at, location, time_of_incident')
    .eq('ref_code', refCode.toUpperCase())
    .single();

  if (error || !data) return res.status(404).json({ error: 'Reference code not found' });

  res.json({
    ref_code: data.ref_code,
    status: data.status,
    submitted_at: data.created_at,
    location: data.location
  });
});
```

---

## 7. Dashboard UI (React)

The NGO/lawyer dashboard is a React app. Key screens:

```
/login                         — Email/password auth (Supabase Auth)
/dashboard                     — Statement list, filterable by status/date/flag
/dashboard/:refCode            — Single statement detail view
/dashboard/:refCode/audio      — Play readback audio
/clusters                      — Incident cluster list (new — Section 17)
/clusters/:clusterId           — Cluster consensus view with field-level corroboration map
```

### Statement List Component (key fields to display)

```jsx
// Each row in the dashboard shows:
{
  ref_code: "GH7K2M",
  created_at: "2026-08-08T14:32:00Z",
  location: "Mohalla Hussain Abad, Rawalpindi",
  status: "pending_review",           // badge: yellow
  intimidation_flag: true,            // badge: red "URGENT"
  inconsistency_flags: [...],         // badge: orange "FLAGGED"
  corroboration_score: 0.82,          // badge: green "CORROBORATED" / amber "CONFLICTING"
  incident_cluster_id: "uuid...",     // link to cluster view
  privacy_mode: false,
  language_of_call: "pa"              // "Punjabi"
}
```

---

## 8. Call Flow — End to End

```
Witness dials Gawah number (e.g., 0800-GAWAH)
        │
        ▼
Twilio receives call → POST /api/sessions/twilio-webhook
        │
        ▼
Backend creates Uplift AI session
        │
        ▼
Call bridges to Uplift AI WebRTC room via Twilio Media Streams
        │
        ▼
Uplift AI Agent joins room:
  - Phase 0: Identity + voluntariness caution
  - Phase 1: Free narrative (uninterrupted)
  - Phase 2: Structured follow-up for missing fields
        │
        ▼
Agent calls save_witness_statement tool:
  - Generates ref code (e.g., GH7K2M)
  - Inserts row in Supabase with all fields
  - Calls Uplift TTS to generate readback.mp3
  - Uploads audio to Supabase Storage
  - Triggers corroboration analysis background job
        │
        ▼
Phase 3: Agent reads back statement + ref code (×3)
        │
        ▼
Witness says "Haan" (yes) or corrects → statement finalised
        │
        ▼
(Background) Corroboration job clusters statement with related
statements by time window + location proximity + keyword overlap.
Computes corroboration_score and conflict_map (Section 17).
        │
        ▼
NGO dashboard shows new statement + cluster update
Urgent escalation webhook fires if intimidation flag set
        │
        ▼
Witness can call back, say "mera code hai GH7K2M"
Agent confirms status.
```

---

## 9. Voice ID Reference (Uplift AI)

| Voice | voiceId | Use in Gawah |
|---|---|---|
| Family Lawyer (female) | `ai_lwr_f_fb` | Primary — statement readback, agent voice |
| Defense Advocate (male) | `ai_lwr_m_ak` | Alternate agent voice |
| Female Narrator | `ai_narration_f_mr` | Dashboard audio playback intro |
| Broadband Support | `ai_customerservice_m_ak` | Reference code confirmation |

**Always use `ai_lwr_f_fb` (Family Lawyer, female) as the Gawah agent voice.**

---

## 10. Edge Cases to Handle in Code

| Edge Case | Handling |
|---|---|
| Witness speaks Punjabi | Groq Whisper large-v3 handles it; LLM responds in kind |
| Approximate time ("after Isha prayers") | Store verbatim; set `temporal_uncertainty: true`; never force precision |
| Delayed statement (>24 hours after incident) | Record delay explicitly; agent asks for reason; store in `statement_delay_explanation`; flag on dashboard |
| Delayed statement (>30 days) | Same as above + `delayed_statement_high_risk: true` — defence will use this to challenge credibility |
| Witness doesn't know accused's name | Accept description ("lamba aadmi, neeli kameez"); store as-is; never suggest a name |
| Witness backtracks mid-statement | Record both versions verbatim; call `flag_inconsistency`; note which version witness confirmed at readback |
| Witness says "I was threatened" | `flag_intimidation` fires immediately; `assess_protection_need` fires; case set to `urgent_escalation` |
| Witness mentions money/settlement | Call `flag_intimidation` (coercion/compromise signal); note exact words |
| Witness hangs up mid-call | Partial statement saved; status set to `incomplete`; note phase at which call ended |
| Witness wants to remain anonymous | `enable_privacy_mode` fires; no name/address collected |
| Witness tries to sign/thumbprint | Agent is voice-only: "Aap ki awaaz hi aap ki tasdeeq hai — koi signature nahi chahiye." Under CrPC 162, signed statements raise reliability questions — voice confirmation is legally cleaner. |
| Witness calls back with ref code | Agent retrieves statement status; confirms location and date only (no full statement read-back on unverified callback) |
| Witness is a minor (under 16) | Sets `witness_age_under_16: true`; `assess_protection_need` auto-fires; do NOT ask about sexual details; shorter sessions; notify dashboard as URGENT |
| Witness is victim of sexual offence | Auto-enable privacy mode if not already on; call `assess_protection_need`; Punjab WPA 2018 prohibits accused from personally cross-examining sexual offence victims |
| Joint statement (multiple witnesses on one call) | CrPC case law condemns joint statements (PLD 1955 Lah. 59). Agent must create a SEPARATE session for each speaker. Tell the second person: "Aap ka bayan alag se darz hoga — main aap ko alag reference code dunga." |
| Witness recants during readback | Do not force. Record what they actually confirmed. Never mark confirmed if witness says "nahi, yeh sahi nahi." |
| Counter-statement (accused's version) | Do NOT record. Explain: "Yeh system gawahon ke liye hai. Aap lawyer se raabta karein." |
| Long silence | After 8 seconds: "Kya aap abhi baat kar sakte hain?" After another 8 seconds: "Kya koi aas paas hai jo sunta hai?" |
| Background noise / third party audible | "Mujhe lag raha hai koi aur bhi sunta hai. Kya aap akele hain?" — offer to call back; or proceed noting confidentiality could not be confirmed |
| Offence described is in a different province | Record the province of the *offence* (not call origin) for protection referral routing |
| Active/ongoing threat | "Agar aap ko abhi khatra hai — 15 (Rescue), 1122 (Rescue Punjab), ya 1715 (Police) par call karein." Then offer to continue if safe. |
| Witness speaks Pashto | Explain limitations honestly: "Mujhe khed hai, abhi Pashto mein meri samajh limited hai." Do NOT fake Pashto support. |
| Duplicate call for same incident | Stored as new statement; lawyer deduplicates on dashboard; corroboration job automatically clusters related statements |

---

## 10a. Privacy Mode — Anonymity Mechanism

Privacy mode is not a cosmetic flag. It implements **anonymized reporting** so a witness can create an on-record §161 statement without personal exposure.

**Mechanism**
1. **Caller ID masking** — Telephony layer (Twilio or equivalent) does not expose raw caller ID to NGO dashboard operators; dashboard queries return statement content + reference code + flags, not phone number.
2. **Pseudonym** — Session stores a generated pseudonym (or none); witness name/address fields remain null when privacy mode is on.
3. **Reference code is the link** — The 6-character code is the durable handle for lookup, PDF export, and follow-up. It is not a name and not a phone number.
4. **NGO visibility** — Lawyer/NGO sees structured fields, consistency flags, protection referral status, and audio/PDF of the statement — not the PSTN identity of the caller.
5. **Revocation / decoupling** — Witness (via NGO workflow) may request full decoupling: personal linkage artifacts cleared; statement + reference code remain as the immutable record.

**Pitch framing:** “For the first time, a witness can go on record without going on record.”

---

## 11. Security Requirements

- All Supabase reads of full statement text require authenticated JWT (NGO/lawyer login)
- Unauthenticated route `/statements/:refCode` returns only status + location — never full statement text
- Uplift AI API key is server-side only — never exposed to browser
- Session tokens from Uplift AI are single-use and expire with TTL
- Readback audio stored in private Supabase bucket — signed URL only
- Privacy mode rows: `location` field stored, all other PII fields null
- No statement is permanently deleted — soft delete only (status = 'archived')
- Corroboration analysis worker only has SELECT access to statements and INSERT/UPDATE access to `incident_clusters`

---

## 12. Hackathon Demo Script (What to Build and Show)

**3-minute demo sequence:**

1. Open browser to demo page — show "Call Gawah" button
2. Click — agent greets in Urdu with Phase 0 voluntariness caution
3. Say yes — agent asks for free narrative
4. Speak a test incident in Punjabi: *"Kal raat mere ghar mein do aadmi ghuse — kareeb dus baje, Isha ke baad. Unhe main jaanta hoon — mera padosi hai Rasheed."*
5. Agent asks follow-up: *"Aur kuch hua? Kya unhone kuch kiya?"*
6. Continue narration — deliberately introduce a contradiction ("andhera tha" then "main ne uska chehra saaf dekha")
7. Agent reads back structured statement in clear Urdu
8. Say "Haan" — agent issues ref code three times
9. Switch tab to NGO Dashboard — show the statement appearing
10. Show orange inconsistency flag — click to reveal the two contradicting quotes side by side
11. Show the readback.mp3 audio player — press play

### Extended Demo Points (if time allows)

**Protection referral:** Say "agar aap ko koi khatra hai" during narrative. Show `assess_protection_need` fires. On dashboard: protection referral PDF appearing. Say to judges: "Under the Punjab Witness Protection Act 2018, this witness now has a legally grounded referral to Witness Protection Unit II — generated automatically."

**Multi-witness corroboration:** Show the /clusters view with two statements linked to the same incident. Show the consensus summary and the field-level conflict map (e.g., time of incident agreed, identity of accused conflicted). Say: "The lawyer sees in one view what used to require hours of manual cross-reading."

**Legal framing for judges:** "Gawah does not replace the Investigating Officer. It replicates the Section 161 examination standard digitally — verbatim narrative, voluntariness caution, no précis, delay explanation recorded, readback confirmation replacing the thumbprint. Every feature exists because a Pakistani court case law said the absence of it caused an acquittal."

---

## 13. Repository Structure

```
gawah/
├── backend/
│   ├── index.js
│   ├── routes/
│   │   ├── sessions.js
│   │   ├── statements.js
│   │   ├── clusters.js              — Incident cluster routes (Section 17)
│   │   └── dashboard.js
│   ├── services/
│   │   ├── upliftai.js
│   │   ├── tts.js
│   │   ├── supabase.js
│   │   ├── consistencyEngine.js     — Section 16: intra-statement checker
│   │   └── corroborationEngine.js   — Section 17: multi-witness analysis
│   ├── workers/
│   │   └── corroborationWorker.js   — Background job (Section 17)
│   └── utils/
│       └── refCode.js
│
├── frontend/
│   ├── src/
│   │   ├── App.jsx
│   │   ├── pages/
│   │   │   ├── Demo.jsx
│   │   │   ├── Dashboard.jsx
│   │   │   ├── StatementDetail.jsx
│   │   │   ├── ClusterList.jsx      — New (Section 17)
│   │   │   └── ClusterDetail.jsx    — New (Section 17)
│   │   ├── components/
│   │   │   ├── GawahCallUI.jsx
│   │   │   ├── StatementCard.jsx
│   │   │   ├── FlagBadge.jsx
│   │   │   ├── InconsistencyPanel.jsx  — New (Section 16)
│   │   │   └── CorroborationMap.jsx    — New (Section 17)
│   │   └── utils/
│   │       └── tools.js
│   └── package.json
│
├── supabase/
│   └── schema.sql
│
├── .env.example
└── README.md
```

---

## 14. npm Dependencies

```json
{
  "backend": {
    "express": "^4.18.0",
    "cors": "^2.8.5",
    "@supabase/supabase-js": "^2.0.0",
    "twilio": "^4.0.0",
    "dotenv": "^16.0.0",
    "node-fetch": "^3.0.0"
  },
  "frontend": {
    "react": "^18.0.0",
    "react-dom": "^18.0.0",
    "@upliftai/assistants-react": "latest",
    "@supabase/supabase-js": "^2.0.0",
    "tailwindcss": "^3.0.0"
  }
}
```

---

## 15. What Is NOT Built (Deferred to Future Work)

| Feature | Why deferred |
|---|---|
| **Native smartphone app** | **Out of scope permanently for the core thesis.** Phone-only PSTN is the product moat — do not list a dedicated app as future work. |
| **WhatsApp voice-note intake** | Realistic Pakistan channel (high penetration, low-literacy friendly) without requiring a Gawah-branded app; post-hackathon integration candidate |
| Pashto STT | Whisper large-v3 accuracy insufficient for legal use; do not fake it |
| Deposition prep module | Natural extension post-hackathon; same infra, different prompt |
| Voice biometric deception research | Longitudinal dataset required; scientifically premature as binary output |
| Full Twilio PSTN bridge | Complex real-time audio bridge; demo via browser WebRTC instead |
| Multi-language readback (Punjabi TTS) | Uplift TTS currently confirmed for Urdu; note as roadmap item |
| FIR direct submission | Requires government API integration; NGO paralegal submits instead |
| Status callback voice IVR | Second call flow; design it but build only the lookup API |
| Section 164 Magistrate integration | Section 164 statement is stronger evidence than Section 161. Future version could auto-generate a Section 164 application request for serious offences. |
| KPK witness protection gap | KPK has no dedicated witness protection act. Detect KPK offences and flag explicitly for federal referral. |
| Cross-examination simulation | After a statement is filed, agent calls witness back and role-plays hostile cross-examination on flagged inconsistencies. Same infra, prompt-only change. |
| Semantic deduplication of incident clusters | Current clustering uses temporal+spatial+keyword heuristics. Future: fine-tuned NLI model to merge clusters where descriptions semantically refer to the same event despite different phrasing. |
| **Compliance integration pack** | See [`docs/COMPLIANCE_FUTURE_WORK.md`](./COMPLIANCE_FUTURE_WORK.md): CrPC §§161–162 product truth; **PDPB 2023 / forthcoming PDPA** privacy readiness; PTA/PECA call consent; National AI Policy 2025 soft governance. Stub: `gawah-backend/app/services/compliance_service.py`. |

---

## 16. Intra-Statement Consistency Analysis Engine

> **Naming:** This is **intra-statement consistency analysis** — never “lie detection.” The system does not infer intent, truthfulness, or credibility. It surfaces internal contradictions for human NGO counsel.

### Why this feature exists

CrPC Section 162 makes every recorded witness statement a potential instrument of contradiction at trial — defence counsel can use a Section 161 statement to undermine the witness's court testimony. When a statement itself already contains internal contradictions, the entire statement's credibility is vulnerable. Lawyers currently catch these during manual review, often too late. Gawah catches them during the call and surfaces them immediately.

Research basis: The ContraDoc benchmark (Li, Raheja & Kumar, NAACL 2024) demonstrated that even GPT-4 struggles with subtle internal inconsistencies in long documents, and that trained human annotators also miss many. The LegalWiz framework (Mantravadi et al., NeurIPS 2025 Workshop) showed that a Hybrid NLI+LLM detector achieves 92% accuracy and 89.5% F1 on self-contradiction detection versus 81% for NLI-only and 75% for LLM-only. The hybrid approach is the validated production-grade method and is what Gawah implements.

### Two-Layer Architecture

**Layer 1 — Real-time (during call):** The Gawah agent (Groq LLM via Uplift AI) detects obvious contradictions conversationally and calls `flag_inconsistency` immediately. This is a best-effort, latency-sensitive layer — it catches clear contradictions (e.g., "andhera tha" [it was dark] then "main ne chehra saaf dekha" [I saw the face clearly]) without stopping the call.

**Layer 2 — Post-call (background job):** After the call ends, a separate analysis pass applies a rigorous Hybrid NLI+LLM pipeline to the saved `sequence_of_events` text. This is computationally thorough, latency-tolerant, and produces structured output for the dashboard.

### Layer 1 — Agent-Side Real-time Detection

The agent's `flag_inconsistency` tool now captures a `contradiction_type` field:

| Type | Example |
|---|---|
| `temporal` | "It happened at night" → "I saw his face clearly in daylight" |
| `spatial` | "It happened inside the house" → "We were standing on the road" |
| `identity` | "He was alone" → "The two men came in together" |
| `sequence` | "He left first, then she arrived" → "She was already there when he came in" |
| `sensory` | "There was no light at all" → "I recognised his voice and his face" |
| `numerical` | "There were three people" → "The four of them surrounded me" |

These map directly to the LegalWiz taxonomy (Temporal, Specificity, Policy Reversal, Process, Numerical, Authority) adapted for oral witness testimony.

### Layer 2 — Post-Call Hybrid NLI+LLM Pipeline

**Implementation: `services/consistencyEngine.js`**

```javascript
// services/consistencyEngine.js
// Runs post-call after save_witness_statement completes.
// Applies Hybrid NLI+LLM detection (Mantravadi et al., NeurIPS 2025).

import Groq from 'groq-sdk';
import { supabase } from './supabase.js';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// Step 1: Segment the free-narrative text into sentence-level claims
async function segmentIntoClaimsLLM(sequenceOfEvents) {
  const response = await groq.chat.completions.create({
    model: 'openai/gpt-oss-120b',
    messages: [{
      role: 'user',
      content: `You are a legal evidence analyst. Extract individual factual claims from this witness statement.
Each claim should be a single assertable fact (who, what, when, where, how).
Return ONLY a JSON array of strings, no other text.
Statement: """${sequenceOfEvents}"""`
    }],
    temperature: 0.1
  });

  try {
    return JSON.parse(response.choices[0].message.content);
  } catch {
    // Fallback: naive sentence split
    return sequenceOfEvents.split(/[۔.!?]+/).map(s => s.trim()).filter(s => s.length > 10);
  }
}

// Step 2: Lightweight semantic similarity filter to find candidate pairs
// Avoids O(n²) exhaustive comparison for long statements
function candidatePairs(claims, topK = 5) {
  const pairs = [];
  // Simple keyword-overlap proxy for semantic similarity
  // Production: replace with sentence-transformers embedding API
  for (let i = 0; i < claims.length; i++) {
    for (let j = i + 1; j < claims.length; j++) {
      const wordsI = new Set(claims[i].toLowerCase().split(/\s+/));
      const wordsJ = new Set(claims[j].toLowerCase().split(/\s+/));
      const intersection = [...wordsI].filter(w => wordsJ.has(w) && w.length > 3);
      if (intersection.length >= 2) {
        pairs.push({ i, j, overlap: intersection.length });
      }
    }
  }
  return pairs
    .sort((a, b) => b.overlap - a.overlap)
    .slice(0, topK * claims.length)
    .map(p => [claims[p.i], claims[p.j]]);
}

// Step 3: LLM judge — per LegalWiz hybrid scoring approach
async function llmContradictionJudge(sentenceA, sentenceB) {
  const response = await groq.chat.completions.create({
    model: 'openai/gpt-oss-120b',
    messages: [{
      role: 'user',
      content: `You are a legal analyst assessing witness statement consistency.
Determine if these two statements from the same witness contradict each other.

Statement A: "${sentenceA}"
Statement B: "${sentenceB}"

Consider:
1. Do they make opposing claims about the same subject?
2. Could both be true simultaneously in the same context?
3. Is one a temporal qualifier or estimate of the other (allow for approximations)?
4. Are they about different aspects of the event (not a contradiction)?

Respond ONLY with valid JSON: {"contradiction": true/false, "reasoning": "brief explanation", "confidence": 0.0-1.0, "contradiction_type": "temporal|spatial|identity|sequence|sensory|numerical|none"}`
    }],
    temperature: 0.0
  });

  try {
    const clean = response.choices[0].message.content
      .replace(/```json|```/g, '').trim();
    return JSON.parse(clean);
  } catch {
    return { contradiction: false, reasoning: 'parse error', confidence: 0.0, contradiction_type: 'none' };
  }
}

// Step 4: Hybrid confidence-weighted scoring (Mantravadi et al.)
// wNLI + wLLM = 1; threshold τ = 0.5
// Note: Full NLI model integration (facebook/bart-large-mnli) requires
// a Python microservice or Hugging Face Inference API.
// For hackathon: LLM-only with confidence weighting approximates hybrid behaviour.
function hybridScore(llmResult, nliScore = null) {
  if (nliScore !== null) {
    const wLLM = llmResult.confidence / (llmResult.confidence + nliScore.confidence);
    const wNLI = 1 - wLLM;
    const llmLabel = llmResult.contradiction ? 1 : 0;
    const nliLabel = nliScore.contradiction ? 1 : 0;
    return wLLM * llmLabel + wNLI * nliLabel;
  }
  // LLM-only fallback
  return llmResult.contradiction ? llmResult.confidence : 0;
}

// Main entry point
export async function runConsistencyCheck(refCode) {
  const { data: stmt } = await supabase
    .from('statements')
    .select('sequence_of_events, inconsistency_flags')
    .eq('ref_code', refCode)
    .single();

  if (!stmt?.sequence_of_events) return;

  const claims = await segmentIntoClaimsLLM(stmt.sequence_of_events);
  const pairs = candidatePairs(claims);

  const newFlags = [];
  for (const [claimA, claimB] of pairs) {
    const llmResult = await llmContradictionJudge(claimA, claimB);
    const score = hybridScore(llmResult);

    if (score > 0.5) {
      newFlags.push({
        source: 'post_call_analysis',
        contradiction_description: llmResult.reasoning,
        segment_a: claimA,
        segment_b: claimB,
        contradiction_type: llmResult.contradiction_type,
        hybrid_score: score,
        flagged_at: new Date().toISOString()
      });
    }
  }

  if (newFlags.length > 0) {
    // Merge with existing real-time flags from the call
    const existing = stmt.inconsistency_flags || [];
    await supabase.from('statements')
      .update({
        inconsistency_flags: [...existing, ...newFlags],
        status: 'pending_review' // reset to review even if previously cleared
      })
      .eq('ref_code', refCode);
  }
}
```

### Dashboard UI — Inconsistency Panel

On the StatementDetail page, the `InconsistencyPanel` component shows:

```
┌────────────────────────────────────────────────────────────┐
│  STATEMENT CONSISTENCY ANALYSIS           [2 flags]  🔶     │
│  ─────────────────────────────────────────────────────────  │
│  Source: Real-time (during call) + Post-call NLP analysis   │
│                                                             │
│  FLAG 1  [temporal]  Score: 0.89                           │
│  ┌──────────────────────────┬──────────────────────────┐   │
│  │ Segment A                │ Segment B                │   │
│  │ "raat ka ghup andhera    │ "main ne uska chehra     │   │
│  │  tha, kuch nahi dikha"   │  bilkul saaf dekha"      │   │
│  └──────────────────────────┴──────────────────────────┘   │
│  Analysis: Witness claims total darkness, then claims clear │
│  facial recognition — without mentioning a light source.   │
│  Legal risk: Defence will use this for cross-examination.   │
│                                                             │
│  FLAG 2  [identity]  Score: 0.73                           │
│  ┌──────────────────────────┬──────────────────────────┐   │
│  │ "woh akela tha"          │ "dono mard andar aaye"   │   │
│  └──────────────────────────┴──────────────────────────┘   │
│                                                             │
│  [Add Reviewer Note]  [Mark Resolved]  [Export for Counsel] │
└────────────────────────────────────────────────────────────┘
```

### Legal Notes

Under CrPC Section 162, a Section 161 statement can be used to contradict the witness at trial. Every flagged inconsistency is a potential contradiction surface — surfacing them pre-submission gives the NGO lawyer time to resolve or explain them before the case reaches court. The system does not make a credibility determination; it surfaces the data for the human lawyer to assess.

---

## 17. Multi-Witness Consensus & Corroboration Layer

### Why this feature exists

In practice, a single incident generates multiple calls — neighbours, family members, bystanders all ring in. Under Pakistan's evidentiary standards, corroboration of both *the story* and *the identity of assailants* is required; eyewitness presence alone does not guarantee conviction (PLJ 1995 SC 636, Muhammad Jahangir). Manual cross-referencing of multiple statements is the most time-consuming and error-prone part of NGO legal work. This layer automates it.

Legal constraint: CrPC Section 162 **prohibits using Section 161 statements as substantive corroborative evidence in court** — only the witness's court testimony can corroborate. What Gawah's corroboration layer provides is *pre-litigation intelligence* for the NGO and lawyer — it identifies which fields agree, which conflict, and which witnesses should be prepared to resolve specific discrepancies before reaching court.

The corroboration score is a **preparedness instrument, not court evidence**.

Research basis: IBM patent US11244113 (evidence aggregation for intelligence gathering) demonstrates corroboration scoring across multiple witnesses, including a critical insight: similarity scores that are *too high* may indicate collusion rather than independent corroboration. Gawah implements both corroboration detection and a collusion proximity warning threshold. US patent US12174842 (system for record identification) demonstrates the grouping of multiple witness statements with statistical parameter determination for comparison. The ARGORA multi-agent deliberation framework (2025) demonstrates consensus formation via progressive reinforcement across expert perspectives — the same pattern applies to multi-witness analysis where agreement strengthens confidence.

### Incident Clustering

Before computing corroboration scores, statements must be linked to the same incident. Clustering uses three signals:

**Temporal proximity:** Two statements are candidate-linked if their `time_of_incident` fields (parsed) or `created_at` timestamps (as proxy for when the incident was reported) fall within a 72-hour window.

**Spatial proximity:** Location fields are fuzzy-matched using token overlap (normalized against common stop-words in Urdu/Punjabi). A match threshold of ≥ 0.5 Jaccard similarity on 3+ word tokens creates a candidate link.

**Semantic proximity:** The `sequence_of_events` fields of candidate pairs are compared using the LLM to determine whether they plausibly describe the same event (binary yes/no + confidence score).

A cluster is formed when at least 2 of the 3 signals align. All cluster assignments must be reviewable and overridable by the lawyer on the dashboard.

### Corroboration Engine

**Implementation: `services/corroborationEngine.js`**

```javascript
// services/corroborationEngine.js

import Groq from 'groq-sdk';
import { supabase } from './supabase.js';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// ── Field-level corroboration scoring ──────────────────────────────────────
// For each of the 5 legal fields, compare values across all statements in a cluster.
// Returns { field, status, agreement_score, values, conflict_detail }

async function compareField(fieldName, values) {
  if (values.length < 2) return { field: fieldName, status: 'single', agreement_score: null, values };

  // Filter nulls
  const nonNull = values.filter(v => v !== null && v !== undefined && v !== '');
  if (nonNull.length < 2) return { field: fieldName, status: 'insufficient_data', agreement_score: null, values };

  const prompt = `You are a legal analyst comparing witness statements about the same incident.
Compare these ${nonNull.length} witness accounts of the same field: "${fieldName}".

${nonNull.map((v, i) => `Witness ${i+1}: "${v}"`).join('\n')}

Assess:
1. Do these accounts agree, partially agree, or conflict?
2. Are discrepancies explainable (different vantage points, approximate vs exact times, partial vs full observation)?
3. Is the level of agreement too high (identical phrasing) — possible collusion?

Respond ONLY with valid JSON:
{
  "status": "agreement" | "partial_agreement" | "conflict" | "collusion_warning",
  "agreement_score": 0.0-1.0,
  "conflict_detail": "brief explanation of what differs",
  "explainable": true/false,
  "explanation": "why discrepancy may be innocent"
}`;

  const response = await groq.chat.completions.create({
    model: 'openai/gpt-oss-120b',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.0
  });

  try {
    const result = JSON.parse(
      response.choices[0].message.content.replace(/```json|```/g, '').trim()
    );
    return { field: fieldName, ...result, values: nonNull };
  } catch {
    return { field: fieldName, status: 'analysis_error', agreement_score: null, values: nonNull };
  }
}

// ── Composite corroboration score ──────────────────────────────────────────
// Weighted average across the 5 legal fields.
// time_of_incident: 0.15 (approximate references acceptable)
// location: 0.25 (should match closely — most reliable field)
// persons_present: 0.25 (identity corroboration — high legal weight)
// sequence_of_events: 0.25 (core narrative — expects partial agreement only)
// relationship_to_accused: 0.10 (witness-specific — may differ legitimately)

const FIELD_WEIGHTS = {
  time_of_incident: 0.15,
  location: 0.25,
  persons_present: 0.25,
  sequence_of_events: 0.25,
  relationship_to_accused: 0.10
};

function compositeScore(fieldResults) {
  let weightedSum = 0;
  let totalWeight = 0;
  for (const fr of fieldResults) {
    const weight = FIELD_WEIGHTS[fr.field] || 0;
    if (fr.agreement_score !== null) {
      weightedSum += fr.agreement_score * weight;
      totalWeight += weight;
    }
  }
  return totalWeight > 0 ? weightedSum / totalWeight : null;
}

// ── Consensus summary ──────────────────────────────────────────────────────
async function generateConsensusSummary(statementsInCluster, fieldResults) {
  const agreedFields = fieldResults.filter(f => f.status === 'agreement' || f.agreement_score > 0.7);
  const conflictedFields = fieldResults.filter(f => f.status === 'conflict' || (f.agreement_score !== null && f.agreement_score < 0.4));
  const collusion = fieldResults.filter(f => f.status === 'collusion_warning');

  return {
    statement_count: statementsInCluster.length,
    fields_agreed: agreedFields.map(f => f.field),
    fields_conflicted: conflictedFields.map(f => ({
      field: f.field,
      detail: f.conflict_detail,
      explainable: f.explainable
    })),
    collusion_warnings: collusion.map(f => f.field),
    recommendation: conflictedFields.length === 0
      ? 'Strong corroboration — witnesses agree on all key fields. Prepare for court.'
      : `${conflictedFields.length} field(s) in conflict — resolve before submission: ${conflictedFields.map(f => f.field).join(', ')}.`,
    generated_at: new Date().toISOString()
  };
}

// ── Main corroboration job ─────────────────────────────────────────────────
export async function runCorroborationAnalysis(newRefCode) {
  // 1. Load the new statement
  const { data: newStmt } = await supabase
    .from('statements')
    .select('*')
    .eq('ref_code', newRefCode)
    .single();

  if (!newStmt) return;

  // 2. Find candidate cluster by temporal + spatial proximity
  const windowStart = new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString();
  const { data: candidates } = await supabase
    .from('statements')
    .select('*')
    .gte('created_at', windowStart)
    .neq('ref_code', newRefCode)
    .eq('status', 'pending_review');

  // 3. Score each candidate for cluster membership
  let bestClusterId = null;
  let bestScore = 0;

  for (const candidate of (candidates || [])) {
    // Spatial: Jaccard token overlap on location
    const tokensA = new Set((newStmt.location || '').toLowerCase().split(/\s+/).filter(t => t.length > 3));
    const tokensB = new Set((candidate.location || '').toLowerCase().split(/\s+/).filter(t => t.length > 3));
    const intersection = [...tokensA].filter(t => tokensB.has(t)).length;
    const union = new Set([...tokensA, ...tokensB]).size;
    const spatialScore = union > 0 ? intersection / union : 0;

    if (spatialScore >= 0.5) {
      // Semantic: LLM event identity check
      const response = await groq.chat.completions.create({
        model: 'openai/gpt-oss-120b',
        messages: [{
          role: 'user',
          content: `Do these two witness accounts plausibly describe the same incident?
Account 1 location: "${newStmt.location}" | narrative: "${newStmt.sequence_of_events?.slice(0, 300)}"
Account 2 location: "${candidate.location}" | narrative: "${candidate.sequence_of_events?.slice(0, 300)}"
Respond ONLY with JSON: {"same_incident": true/false, "confidence": 0.0-1.0}`
        }],
        temperature: 0.0
      });

      try {
        const r = JSON.parse(response.choices[0].message.content.replace(/```json|```/g, '').trim());
        if (r.same_incident && r.confidence > bestScore) {
          bestScore = r.confidence;
          bestClusterId = candidate.incident_cluster_id;
        }
      } catch { /* skip */ }
    }
  }

  // 4. Assign to existing cluster or create new one
  if (!bestClusterId) {
    const { data: newCluster } = await supabase
      .from('incident_clusters')
      .insert({
        cluster_label: `${newStmt.location} — ${new Date(newStmt.created_at).toLocaleDateString('ur-PK')}`,
        incident_location: newStmt.location,
        statement_count: 1
      })
      .select()
      .single();
    bestClusterId = newCluster.id;
  }

  await supabase.from('statements')
    .update({ incident_cluster_id: bestClusterId })
    .eq('ref_code', newRefCode);

  // 5. Re-run field-level analysis across all statements in the cluster
  const { data: clusterStmts } = await supabase
    .from('statements')
    .select('*')
    .eq('incident_cluster_id', bestClusterId);

  if (!clusterStmts || clusterStmts.length < 2) return;

  const fields = ['time_of_incident', 'location', 'persons_present', 'sequence_of_events', 'relationship_to_accused'];
  const fieldResults = await Promise.all(
    fields.map(field =>
      compareField(field, clusterStmts.map(s => Array.isArray(s[field]) ? s[field].join(', ') : s[field]))
    )
  );

  const score = compositeScore(fieldResults);
  const consensus = await generateConsensusSummary(clusterStmts, fieldResults);

  // 6. Update cluster and all member statements
  await supabase.from('incident_clusters')
    .update({
      statement_count: clusterStmts.length,
      consensus_summary: consensus,
      conflict_map: fieldResults,
      updated_at: new Date().toISOString()
    })
    .eq('id', bestClusterId);

  await supabase.from('statements')
    .update({
      corroboration_score: score,
      corroboration_detail: { field_results: fieldResults }
    })
    .eq('incident_cluster_id', bestClusterId);
}
```

### Dashboard UI — Cluster Detail View

The `/clusters/:clusterId` page renders the `CorroborationMap` component:

```
┌──────────────────────────────────────────────────────────────────────┐
│  INCIDENT CLUSTER: Mohalla Hussain Abad — 7 Aug 2026                  │
│  3 witness statements  |  Composite corroboration score: 0.74 ✅       │
│  ─────────────────────────────────────────────────────────────────── │
│  FIELD-LEVEL CORROBORATION MAP                                        │
│                                                                       │
│  Time of incident     ████████░░  0.80  ✅ Agreement                  │
│  Location             ██████████  1.00  ✅ Agreement                  │
│  Persons present      ████░░░░░░  0.40  ⚠️ Conflict                   │
│    W1: "Rasheed aur ek aur aadmi" | W2: "sirf Rasheed" | W3: "3 log" │
│    Note: Discrepancy may reflect different vantage points             │
│  Sequence of events   ██████░░░░  0.60  ⚠️ Partial agreement          │
│  Relationship         █████░░░░░  0.50  ⚠️ Partial agreement          │
│                                                                       │
│  CONSENSUS RECOMMENDATION:                                            │
│  2 fields in conflict. Resolve before submission:                     │
│  persons_present, sequence_of_events.                                 │
│                                                                       │
│  ⚠️  COLLUSION WARNING: None                                           │
│                                                                       │
│  LINKED STATEMENTS:                                                   │
│  • GH7K2M  |  Punjabi  |  Eyewitness  |  8 Aug 2026                  │
│  • TR9P4X  |  Urdu     |  Hearsay     |  8 Aug 2026                  │
│  • WM2KL1  |  Urdu     |  Victim      |  9 Aug 2026                  │
│                                                                       │
│  [Export Cluster Report PDF]  [Override Cluster Assignment]           │
└──────────────────────────────────────────────────────────────────────┘
```

### Collusion Proximity Warning

Drawing on the IBM intelligence aggregation patent (US11204929), statements that are excessively similar — beyond what independent observation would produce — trigger a collusion warning rather than a high corroboration score. This is a critical legal safeguard: courts are wary of witnesses who appear to have coordinated their accounts.

Implementation: if `agreement_score > 0.95` on the `sequence_of_events` field (near-identical narrative from two witnesses), flag `status: 'collusion_warning'` rather than `status: 'agreement'`. Display a yellow warning badge on the cluster dashboard. The lawyer must investigate before submitting.

### Legal Notes for Multi-Witness Layer

**CrPC Section 162 constraint:** Section 161 statements cannot be used as substantive corroborative evidence in court — only in-court testimony corroborates. Gawah's corroboration scores are pre-litigation intelligence for the NGO lawyer and must never be represented to a court as corroboration.

**Cross-examination preparation value:** The conflict map directly shows which fields will be subject to cross-examination discrepancy attacks. The NGO lawyer can brief witnesses on the specific discrepancies before their court appearance and investigate whether innocent explanations exist (different vantage points, different phases of the same incident, etc.).

**Corroboration doctrine (Pakistani case law):** The Supreme Court has held that eyewitness presence does not suffice without corroboration of both the story and identity of assailants (PLJ 1976 SC 29, Ghulam Muhammad). The persons_present and sequence_of_events fields therefore carry the highest weights (0.25 each) in the composite score.

**Collusion vs independent corroboration:** The IBM US11244113 patent warns that excessive similarity between witness statements is itself a credibility red flag — independent witnesses observing the same event will naturally have different perspectives, so near-identical accounts may indicate coordination rather than genuine agreement. Gawah implements this as the `collusion_warning` threshold.

---

## 18. Notes for the Code Generator

1. The agent instructions in Section 3.1 are long. Do not truncate them when passing to the Uplift AI API. The `instructions` field accepts long strings — send the full text.

2. All five tools must be registered in the assistant config `tools` array AND implemented as handlers in `tools.js`. They reference each other via shared session state (`getCurrentSessionId()`). Implement session state as a module-level Map keyed by roomName from the Uplift session token.

3. The `assess_protection_need` tool has a `presentationInstructions` that speaks to the witness. This is the only tool that breaks the silence rule — it is intentional. The witness must be informed protection exists.

4. Joint statements are legally condemned by Pakistani courts. The agent must refuse to record a second person's account in the same session. This is a hard rule, not an edge case.

5. Do not add a signature or thumbprint feature. CrPC Section 162 case law holds that signed Section 161 statements raise reliability questions in court. Voice confirmation with stored audio is the correct mechanism.

6. The consistency engine (Section 16) and corroboration engine (Section 17) run as background jobs after the call ends — never during the call. The call must remain low-latency and focused on the witness.

7. For the hackathon, the LLM-only path in `consistencyEngine.js` and `corroborationEngine.js` is sufficient. The full Hybrid NLI+LLM path (using `facebook/bart-large-mnli`) requires a Python microservice or Hugging Face Inference API endpoint — note this as a production upgrade in the README.

8. The corroboration score displayed in the dashboard must carry a disclaimer: "Pre-litigation intelligence only — not admissible corroboration under CrPC Section 162."

9. Cluster assignments are heuristic — always provide a lawyer override button on the dashboard. Automated clustering is a time-saver, not an oracle.
