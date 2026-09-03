// Gawah — API fetch helpers
// Backend: FastAPI at VITE_API_URL (default http://localhost:8000)
// All fetches use cache: 'no-store' for dashboard data.

import { getAccessToken } from '@/lib/supabase';
import type {
  HealthResponse,
  SessionCreateResponse,
  StatementsListResponse,
  StatementDetail,
  ReviewPayload,
  KpiResponse,
  ClustersListResponse,
  ClusterDetail,
} from './types';

function getBaseUrl(): string {
  // When VITE_API_URL is explicitly set, use it (supports pointing at FastAPI
  // on http://localhost:8000 or any other host).
  //
  // Default: empty string → relative URLs.
  //   • Dev: Vite proxy (vite.config.ts) forwards /api/* and /health to FastAPI :8000.
  //   • Production static host has no proxy — fall back to the deployed FastAPI.
  const v = import.meta.env.VITE_API_URL;
  if (typeof v === 'string' && v.length > 0) return v.replace(/\/$/, '');
  if (import.meta.env.PROD) return 'https://gawah-backend.vercel.app';
  return '';
}

class ApiError extends Error {
  constructor(
    public status: number,
    public detail: string,
  ) {
    super(detail);
    this.name = 'ApiError';
  }
}

/**
 * Authorization header for the current staff session, or `{}` when anonymous.
 *
 * Witness-facing calls go through the same helper: sending no header is what
 * keeps them on the anonymous path, so this must never throw or block.
 */
async function authHeaders(): Promise<Record<string, string>> {
  const token = await getAccessToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function gawahFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const url = `${getBaseUrl()}${path}`;
  const res = await fetch(url, {
    cache: 'no-store',
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(await authHeaders()),
      ...(options.headers ?? {}),
    },
  });

  if (!res.ok) {
    let detail = `${res.status} ${res.statusText}`;
    try {
      const body = await res.json();
      if (body.detail) {
        detail =
          typeof body.detail === 'string'
            ? body.detail
            : JSON.stringify(body.detail);
      }
    } catch {
      // ignore parse errors
    }
    throw new ApiError(res.status, detail);
  }

  return res.json() as Promise<T>;
}

// ── Health ────────────────────────────────────────────────────────────────
// FastAPI exposes GET /health. Vite proxy also maps /api/healthz → /health.
export const fetchHealth = (): Promise<HealthResponse> =>
  gawahFetch<HealthResponse>('/health');

// ── Sessions ──────────────────────────────────────────────────────────────
export const createSession = (
  participantName = 'Witness',
): Promise<SessionCreateResponse> =>
  gawahFetch<SessionCreateResponse>('/api/sessions/create', {
    method: 'POST',
    body: JSON.stringify({ participantName }),
  });

export interface PlaceCallResponse {
  ok: boolean;
  mocked?: boolean;
  callId?: string;
  status?: string;
  to?: string;
  assistantId?: string;
  channel?: string;
  message?: string;
  label?: string;
  active_calls_warning?: boolean;
}

export interface TrackedCall {
  call_id?: string;
  callId?: string;
  to?: string;
  from_number?: string;
  status?: string;
  state?: string;
  outcome?: string;
  failure_reason?: string;
  connected?: boolean;
  channel?: string;
  direction?: string;
  label?: string;
  mocked?: boolean;
  created_at?: string;
  updated_at?: string;
  duration_sec?: number;
  answered_at?: string;
  ended_at?: string;
  ended_by?: string;
  transport_provider?: string;
  recording_url?: string | null;
  local_recording_path?: string | null;
  transcript?: string | Record<string, unknown> | null;
  analysis?: unknown;
  artifacts_status?: string;
  artifacts_available?: boolean;
  events?: Array<Record<string, unknown>>;
  ref_code?: string;
  participant_name?: string;
  room_name?: string;
  [key: string]: unknown;
}

export interface CallsListResponse {
  ok: boolean;
  mocked?: boolean;
  sync_error?: string | null;
  note?: string;
  counts?: {
    total: number;
    active: number;
    completed: number;
    failed: number;
    with_artifacts?: number;
  };
  items: TrackedCall[];
}

export const placePhoneCall = (
  to: string,
  participantName = 'Witness',
  captchaToken?: string | null,
): Promise<PlaceCallResponse> =>
  gawahFetch<PlaceCallResponse>('/api/sessions/call', {
    method: 'POST',
    body: JSON.stringify({
      to,
      participantName,
      ...(captchaToken ? { captcha_token: captchaToken } : {}),
    }),
  });

export const fetchCalls = (limit = 25): Promise<CallsListResponse> =>
  gawahFetch(`/api/sessions/calls?limit=${limit}&sync=true`);

export const fetchCall = (
  callId: string,
): Promise<{ ok: boolean; mocked?: boolean; item: TrackedCall }> =>
  gawahFetch(`/api/sessions/calls/${encodeURIComponent(callId)}`);

export const refreshCallArtifacts = (
  callId: string,
): Promise<{
  ok: boolean;
  item: TrackedCall;
  artifacts_status?: string;
  artifacts_available?: boolean;
}> =>
  gawahFetch(`/api/sessions/calls/${encodeURIComponent(callId)}/refresh-artifacts`, {
    method: 'POST',
  });

export const callRecordingUrl = (callId: string): string =>
  `${getBaseUrl()}/api/sessions/calls/${encodeURIComponent(callId)}/recording`;

export interface WebEventResponse {
  ok: boolean;
  item?: TrackedCall;
  events?: Array<Record<string, unknown>>;
}

export interface WebDialogueTurn {
  role: 'agent' | 'witness';
  text: string;
  id?: string;
  at?: number;
}

export interface WebRecordingResponse {
  ok: boolean;
  call_id?: string;
  ref_code?: string;
  status?: string;
  /** Full Agent/Witness labelled transcript (not truncated) */
  transcript?: string;
  /** Structured chat turns when available */
  dialogue?: WebDialogueTurn[];
  witness_transcript?: string;
  readback_text?: string;
  statement_id?: string;
  local_recording_path?: string;
  stt_ok?: boolean;
  stt_detail?: string | null;
  label?: string;
  item?: TrackedCall;
}

export const postWebEvent = (
  callId: string,
  payload: { type: string; detail?: string; status?: string },
): Promise<WebEventResponse> =>
  gawahFetch(`/api/sessions/web/${encodeURIComponent(callId)}/events`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });

export const uploadWebRecording = async (
  callId: string,
  blob: Blob,
  opts: {
    language?: string;
    participantName?: string;
    filename?: string;
    dialogue?: WebDialogueTurn[];
  } = {},
): Promise<WebRecordingResponse> => {
  const form = new FormData();
  form.append(
    'file',
    blob,
    opts.filename || `web-testimony-${Date.now()}.webm`,
  );
  form.append('language', opts.language || 'ur');
  form.append('participantName', opts.participantName || 'Witness');
  if (opts.dialogue?.length) {
    form.append('dialogue', JSON.stringify(opts.dialogue));
  }

  const url = `${getBaseUrl()}/api/sessions/web/${encodeURIComponent(callId)}/recording`;
  // No Content-Type here on purpose — the browser must set the multipart
  // boundary itself.
  const res = await fetch(url, {
    method: 'POST',
    body: form,
    cache: 'no-store',
    headers: await authHeaders(),
  });
  if (!res.ok) {
    let detail = `${res.status} ${res.statusText}`;
    try {
      const body = await res.json();
      if (body.detail) {
        detail =
          typeof body.detail === 'string'
            ? body.detail
            : JSON.stringify(body.detail);
      }
    } catch {
      // ignore
    }
    throw new ApiError(res.status, detail);
  }
  return res.json() as Promise<WebRecordingResponse>;
};

export const completeWebSession = (
  callId: string,
): Promise<{ ok: boolean; item?: TrackedCall }> =>
  gawahFetch(`/api/sessions/web/${encodeURIComponent(callId)}/complete`, {
    method: 'POST',
  });

export const fetchActivity = (
  limit = 40,
): Promise<import('./types').ActivityResponse> =>
  gawahFetch(`/api/sessions/activity?limit=${limit}`);

// ── Statements ────────────────────────────────────────────────────────────
export interface StatementsParams {
  page?: number;
  status?: string;
  flags?: string;
}

export const fetchStatements = (
  params: StatementsParams = {},
): Promise<StatementsListResponse> => {
  const q = new URLSearchParams();
  if (params.page != null) q.set('page', String(params.page));
  if (params.status) q.set('status', params.status);
  if (params.flags) q.set('flags', params.flags);
  const qs = q.toString();
  return gawahFetch<StatementsListResponse>(
    `/api/dashboard/statements${qs ? `?${qs}` : ''}`,
  );
};

/**
 * Staff view of a statement. `full=true` is explicit because the backend now
 * defaults to the limited witness payload — omitting it returns status and
 * location only, and requesting it without a session returns 401.
 */
export const fetchStatement = (refCode: string): Promise<StatementDetail> =>
  gawahFetch<StatementDetail>(
    `/api/statements/${encodeURIComponent(refCode)}?full=true`,
  );

/** Anonymous reference-code lookup: status and location, never statement text. */
export const fetchStatementStatus = (
  refCode: string,
): Promise<Partial<StatementDetail>> =>
  gawahFetch<Partial<StatementDetail>>(
    `/api/statements/${encodeURIComponent(refCode)}`,
  );

export const submitReview = (
  refCode: string,
  payload: ReviewPayload,
): Promise<StatementDetail> =>
  gawahFetch<StatementDetail>(
    `/api/statements/${encodeURIComponent(refCode)}/review`,
    { method: 'POST', body: JSON.stringify(payload) },
  );

// Audio URL — legacy direct URL string, only ever valid for local-disk
// (dev/demo) audio; the backend 404s this for anything stored in Supabase.
// Kept as the fallback getStatementAudioSrc() uses when the signed-URL
// fetch below 404s (i.e. non-Supabase local runs).
export const getStatementAudioUrl = (refCode: string): string =>
  `${getBaseUrl()}/api/statements/${encodeURIComponent(refCode)}/audio`;

/**
 * Staff-gated signed URL for Storage-backed readback audio (production).
 * Returns null when the statement's audio isn't in Storage — callers should
 * fall back to getStatementAudioUrl() in that case (local/dev runs only).
 * The returned URL is short-lived (backend default 300s) and carries its own
 * auth in the query string, so it's safe to hand straight to <audio src>.
 */
export const fetchStatementAudioSignedUrl = async (
  refCode: string,
): Promise<string | null> => {
  try {
    const res = await gawahFetch<{ url: string; expires_in: number }>(
      `/api/statements/${encodeURIComponent(refCode)}/audio-url`,
    );
    return res.url;
  } catch {
    return null;
  }
};

// PDF download — returns a Blob for client-side save
export const downloadStatementPdf = async (refCode: string): Promise<Blob> => {
  const url = `${getBaseUrl()}/api/statements/${encodeURIComponent(refCode)}/pdf`;
  const res = await fetch(url, { method: 'POST', headers: await authHeaders() });
  if (!res.ok) throw new ApiError(res.status, 'PDF generation failed');
  return res.blob();
};

// ── KPIs ──────────────────────────────────────────────────────────────────
export const fetchKpis = async (): Promise<KpiResponse> => {
  const raw = await gawahFetch<KpiResponse & { urgent?: number; clusters?: number }>(
    '/api/kpis',
  );
  // Normalize FastAPI field names → UI contract
  return {
    ...raw,
    urgent_count: raw.urgent_count ?? raw.urgent ?? 0,
    cluster_count: raw.cluster_count ?? raw.clusters ?? 0,
  };
};

// ── Clusters ──────────────────────────────────────────────────────────────
export const fetchClusters = (): Promise<ClustersListResponse> =>
  gawahFetch<ClustersListResponse>('/api/dashboard/clusters');

export const fetchCluster = (clusterId: string): Promise<ClusterDetail> =>
  gawahFetch<ClusterDetail>(
    `/api/dashboard/clusters/${encodeURIComponent(clusterId)}`,
  );

// ── Waitlist ──────────────────────────────────────────────────────────────
// No-auth lead capture (POST /api/waitlist) — one email field, no password,
// no account. Separate from Supabase Auth signup on /login: this never
// creates a login, just records an email for early access.
export const joinWaitlist = (
  email: string,
  source?: string,
): Promise<{ ok: boolean }> =>
  gawahFetch<{ ok: boolean }>('/api/waitlist', {
    method: 'POST',
    body: JSON.stringify({ email, source }),
  });

export { ApiError };
