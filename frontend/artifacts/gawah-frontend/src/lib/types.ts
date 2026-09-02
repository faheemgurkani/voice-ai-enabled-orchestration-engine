// Gawah — TypeScript contracts aligned with FastAPI backend PRD

export type StatementStatus =
  | 'pending_review'
  | 'urgent_escalation'
  | 'reviewed'
  | 'submitted'
  | 'incomplete'
  | 'archived';

export type LanguageCode = 'ur' | 'pa' | 'ps' | 'mixed';

export type WitnessType = 'eyewitness' | 'hearsay' | 'character' | 'expert' | string;

export interface InconsistencyFlag {
  contradiction_type?: string;
  category?: string; // temporal | spatial | identity | sequence | sensory | numerical
  segment_a: string;
  segment_b: string;
  analysis?: string;
  contradiction_description?: string;
  score?: number;
  hybrid_score?: number;
  legal_risk?: string;
  source?: 'realtime' | 'post_call_analysis';
}

export interface ProtectionReferral {
  status: 'none' | 'referral_generated' | 'submitted';
  applicable_act?: string;
  grounds?: string[];
  referral_pdf_url?: string;
}

export interface StatementSummary {
  ref_code: string;
  created_at: string;
  location: string;
  status: StatementStatus;
  intimidation_flag: boolean;
  inconsistency_flags: InconsistencyFlag[];
  corroboration_score?: number | null;
  incident_cluster_id?: string | null;
  privacy_mode: boolean;
  language_of_call: LanguageCode;
  witness_type?: WitnessType;
}

export interface StatementDetail extends StatementSummary {
  // 5 legal fields
  time_of_incident?: string;
  persons_present?: string[];
  sequence_of_events?: string;
  relationship_to_accused?: string;
  relationship_to_parties?: string;

  // Edge-case metadata
  temporal_uncertainty?: boolean;
  delayed_statement_high_risk?: boolean;
  call_phase_at_disconnect?: string;

  // Confirmation
  confirmed_by_witness?: boolean;

  // Readback
  readback_text?: string;
  readback_audio_url?: string;

  // Protection
  protection?: ProtectionReferral;
  protection_referral?: ProtectionReferral;

  // Corroboration
  corroboration_detail?: string;

  // Review
  reviewed_by?: string;
  reviewer_notes?: string;
  reviewed_at?: string;
}

// Field-level corroboration result inside a cluster
export interface FieldCorroboration {
  field: string;
  status: 'agreement' | 'partial_agreement' | 'conflict' | 'collusion_warning';
  agreement_score?: number | null; // 0–1
  values?: string[];
  conflict_detail?: string;
  note?: string;
}

export interface ClusterSummary {
  id: string;
  cluster_label: string;
  statement_count: number;
  composite_score?: number | null;
  collusion_warning: boolean;
}

export interface ClusterDetail extends ClusterSummary {
  field_results: FieldCorroboration[];
  consensus_recommendation?: string;
  linked_statements: StatementSummary[];
}

export interface KpiResponse {
  total_statements?: number;
  urgent_count?: number;
  cluster_count?: number;
  avg_corroboration?: number | null;
  edge_case_coverage?: Record<string, boolean>;
  roi_proxies?: Record<string, number | string>;
  [key: string]: unknown;
}

export interface SessionCreateResponse {
  token?: string;
  wsUrl?: string;
  ws_url?: string;
  roomName?: string;
  room_name?: string;
  sessionId?: string;
  callId?: string;
  assistantId?: string;
  channel?: string;
  status?: string;
  label?: string;
  message?: string;
  demo?: boolean;
  ok?: boolean;
  detail?: string;
}

export interface ActivityItem {
  call_id?: string;
  channel?: string;
  status?: string;
  at?: string;
  type?: string;
  detail?: string;
  ref_code?: string;
}

export interface ActivityResponse {
  ok: boolean;
  counts?: {
    total_calls?: number;
    web?: number;
    phone?: number;
    active?: number;
    completed?: number;
  };
  items: ActivityItem[];
}

export interface ReviewPayload {
  reviewer_notes: string;
  /** @deprecated Ignored by the API — attribution comes from the session token. */
  reviewed_by?: string;
}

export interface StatementsListResponse {
  items: StatementSummary[];
  total: number;
  page: number;
  page_size: number;
}

export interface ClustersListResponse {
  items: ClusterSummary[];
}

export interface HealthResponse {
  status: string;
  db_backend?: string;
  uplift_configured?: boolean;
  openrouter_configured?: boolean;
  openrouter_model?: string;
  llm_enabled?: boolean;
}

// Badge color tokens (matches PRD §7)
export const STATUS_META: Record<StatementStatus, { label: string; color: string }> = {
  pending_review:    { label: 'Pending',    color: 'amber' },
  urgent_escalation: { label: 'Urgent',     color: 'red' },
  reviewed:          { label: 'Reviewed',   color: 'teal' },
  submitted:         { label: 'Submitted',  color: 'green' },
  incomplete:        { label: 'Incomplete', color: 'gray' },
  archived:          { label: 'Archived',   color: 'gray' },
};

export const LANGUAGE_META: Record<LanguageCode, { label: string; rtl: boolean }> = {
  ur:    { label: 'Urdu',             rtl: true },
  pa:    { label: 'Punjabi',          rtl: true },
  ps:    { label: 'Pashto (limited)', rtl: true },
  mixed: { label: 'Mixed',            rtl: false },
};

// §162 disclaimer text — must appear wherever corroboration scores are shown
export const SECTION_162_DISCLAIMER =
  'Pre-litigation intelligence only — not admissible corroboration under CrPC Section 162.';
