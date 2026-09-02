-- Gawah schema — Supabase / Postgres.
--
-- This mirrors the migrations applied to the live project. Column types follow
-- the Pydantic models in app/models/ rather than the original spec: ids are
-- text because StatementRecord/IncidentCluster generate str(uuid4()) client
-- side and always supply them, and list fields are jsonb because supabase-py
-- serialises Python lists as JSON.
--
-- Applied migrations, in order:
--   core_schema
--   profiles_and_signup_trigger
--   indexes_and_rls
--   restrict_handle_new_user_execute

-- ─── Core tables ─────────────────────────────────────────────────────────────

create table public.incident_clusters (
  id text primary key,
  workspace_id uuid references auth.users(id) on delete set null,
  cluster_label text,
  incident_date_range text,
  incident_location text,
  statement_count integer not null default 0,
  consensus_summary jsonb not null default '{}'::jsonb,
  conflict_map jsonb not null default '[]'::jsonb,
  cluster_status text not null default 'open',
  composite_score double precision,
  collusion_warning boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.statements (
  id text primary key,
  ref_code text not null unique,
  session_id text,
  -- Ownership travels with the session, not the author: witnesses are
  -- anonymous, so this records which staff workspace the intake belongs to.
  workspace_id uuid references auth.users(id) on delete set null,

  time_of_incident text,
  location text not null default '',
  persons_present jsonb not null default '[]'::jsonb,
  sequence_of_events text not null default '',
  relationship_to_accused text,
  temporal_uncertainty boolean not null default false,
  language_of_call text not null default 'ur',

  witness_type text not null default 'unknown',
  corroboration_sources_mentioned jsonb not null default '[]'::jsonb,

  statement_delay_days integer,
  statement_delay_explanation text,
  delayed_statement_high_risk boolean not null default false,

  privacy_mode boolean not null default false,
  intimidation_flag boolean not null default false,
  intimidation_text text,
  inconsistency_flags jsonb not null default '[]'::jsonb,

  offence_category text,
  witness_age_under_16 boolean not null default false,
  witness_is_victim boolean not null default false,
  protection_referral_generated boolean not null default false,
  protection_referral_url text,
  applicable_protection_act text,
  preferred_contact_method text not null default 'phone',
  safe_contact_time text,

  corrections_count integer not null default 0,
  confirmed_by_witness boolean not null default false,
  confirmation_audio_url text,

  background_noise_flagged boolean not null default false,
  third_party_presence_flagged boolean not null default false,
  call_phase_at_disconnect text,

  incident_cluster_id text references public.incident_clusters(id) on delete set null,
  corroboration_score double precision,
  corroboration_detail jsonb not null default '{}'::jsonb,

  status text not null default 'pending_review',
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by text,
  reviewer_notes text,

  readback_text text,
  readback_audio_url text,
  call_recording_url text,
  raw_transcript text
);

create table public.sessions (
  id bigint generated always as identity primary key,
  call_id text,
  workspace_id uuid references auth.users(id) on delete set null,
  room_name text,
  status text,
  demo boolean not null default false,
  channel text,
  created_at timestamptz not null default now()
);

create table public.calls (
  call_id text primary key,
  workspace_id uuid references auth.users(id) on delete set null,
  ref_code text,
  status text,
  state text,
  outcome text,
  failure_reason text,
  connected boolean,
  channel text,
  direction text,
  label text,
  mocked boolean not null default false,
  "to" text,
  from_number text,
  participant_name text,
  room_name text,
  assistant_id text,
  duration_sec double precision,
  answered_at timestamptz,
  ended_at timestamptz,
  ended_by text,
  transport_provider text,
  recording_url text,
  local_recording_path text,
  transcript jsonb,
  analysis jsonb,
  events jsonb not null default '[]'::jsonb,
  artifacts_status text,
  artifacts_available boolean,
  statement_pipeline_status text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.kpi_events (
  id bigint generated always as identity primary key,
  workspace_id uuid references auth.users(id) on delete set null,
  type text not null,
  meta jsonb not null default '{}'::jsonb,
  at timestamptz not null default now()
);

-- ─── Profiles: role + early-access consent, 1:1 with auth.users ───────────────

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  role text not null default 'staff',
  early_access_opt_in boolean not null default false,
  use_case text,
  opted_in_at timestamptz,
  created_at timestamptz not null default now()
);

-- security definer so the trigger runs as postgres (supabase_auth_admin has no
-- write access to public), and an empty search_path so name resolution cannot
-- be hijacked by a malicious schema.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  wants_early_access boolean := coalesce((new.raw_user_meta_data ->> 'early_access_opt_in')::boolean, false);
begin
  insert into public.profiles (id, email, early_access_opt_in, opted_in_at, use_case)
  values (
    new.id,
    new.email,
    wants_early_access,
    case when wants_early_access then now() else null end,
    new.raw_user_meta_data ->> 'use_case'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Trigger-only function: without this it is reachable as an RPC at
-- /rest/v1/rpc/handle_new_user by anon and authenticated callers.
revoke execute on function public.handle_new_user() from public;
revoke execute on function public.handle_new_user() from anon;
revoke execute on function public.handle_new_user() from authenticated;

-- ─── Indexes ─────────────────────────────────────────────────────────────────
-- Every column named in an RLS policy is indexed; the policy predicate runs on
-- each candidate row otherwise.

create index statements_workspace_id_idx on public.statements(workspace_id);
create index statements_ref_code_idx on public.statements(ref_code);
create index statements_status_created_at_idx on public.statements(status, created_at desc);
create index statements_cluster_idx on public.statements(incident_cluster_id);
create index statements_session_id_idx on public.statements(session_id);
create index incident_clusters_workspace_id_idx on public.incident_clusters(workspace_id);
create index sessions_workspace_id_idx on public.sessions(workspace_id);
create index sessions_call_id_idx on public.sessions(call_id);
create index calls_workspace_id_idx on public.calls(workspace_id);
create index calls_created_at_idx on public.calls(created_at desc);
create index kpi_events_workspace_id_idx on public.kpi_events(workspace_id);

-- ─── Row Level Security ──────────────────────────────────────────────────────

alter table public.profiles enable row level security;
alter table public.statements enable row level security;
alter table public.incident_clusters enable row level security;
alter table public.sessions enable row level security;
alter table public.calls enable row level security;
alter table public.kpi_events enable row level security;

-- (select auth.uid()) is wrapped so Postgres hoists it into an initplan and
-- evaluates it once per query instead of once per row. `to authenticated`
-- keeps the predicate from running at all for anonymous requests.
--
-- No insert/update policies for the voice pipeline: it writes with the secret
-- key, which bypasses RLS. Authenticated users are read-only apart from
-- reviewing statements in their own workspace.

create policy "users read own profile"
  on public.profiles for select
  to authenticated
  using ( (select auth.uid()) = id );

create policy "users update own profile"
  on public.profiles for update
  to authenticated
  using ( (select auth.uid()) = id )
  with check ( (select auth.uid()) = id );

create policy "users read own workspace statements"
  on public.statements for select
  to authenticated
  using ( (select auth.uid()) = workspace_id );

create policy "users review own workspace statements"
  on public.statements for update
  to authenticated
  using ( (select auth.uid()) = workspace_id )
  with check ( (select auth.uid()) = workspace_id );

create policy "users read own workspace clusters"
  on public.incident_clusters for select
  to authenticated
  using ( (select auth.uid()) = workspace_id );

create policy "users read own workspace sessions"
  on public.sessions for select
  to authenticated
  using ( (select auth.uid()) = workspace_id );

create policy "users read own workspace calls"
  on public.calls for select
  to authenticated
  using ( (select auth.uid()) = workspace_id );

create policy "users read own workspace kpi events"
  on public.kpi_events for select
  to authenticated
  using ( (select auth.uid()) = workspace_id );
