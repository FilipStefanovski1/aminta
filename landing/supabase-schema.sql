-- Run this in the Supabase SQL Editor

create table public.users (
  id uuid references auth.users(id) on delete cascade primary key,
  email text,
  plan text not null default 'free',
  paid_via text,
  subscription_status text,
  creem_customer_id text,
  creem_subscription_id text,
  created_at timestamptz default now(),
  -- A paid plan must always have a paid_via — enforced at the DB level so
  -- this can't drift even via a manual table-editor edit. See
  -- supabase-migration-plan-integrity.sql for the reasoning and the
  -- backfill needed if this is added to an existing project.
  constraint users_plan_requires_paid_via check (plan = 'free' or paid_via is not null)
);

create table public.aminta_state (
  user_id uuid references public.users(id) on delete cascade primary key,
  xp integer default 0,
  generations_total integer default 0,
  earned_hashes text[] default '{}',
  streak integer default 0,
  streak_date text default '',
  mission_date text default '',
  mission_generates integer default 0,
  mission_published integer default 0,
  voice_profile jsonb,
  style_profile jsonb,
  style_profile_hash text default '',
  templates jsonb default '[]'::jsonb,
  tweet_dna text[] default '{}',
  display_name text default '',
  bio text default '',
  interests text default '',
  onboarding_done boolean default false,
  updated_at timestamptz default now()
);

-- Row Level Security
alter table public.users enable row level security;
alter table public.aminta_state enable row level security;

create policy "Users can read own profile" on public.users
  for select using (auth.uid() = id);

create policy "Users can update own profile" on public.users
  for update using (auth.uid() = id);

create policy "Users can read own state" on public.aminta_state
  for select using (auth.uid() = user_id);

create policy "Users can upsert own state" on public.aminta_state
  for all using (auth.uid() = user_id);

-- Auto-create user profile on signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.users (id, email)
  values (new.id, new.email);
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ===========================================================================
-- Included AI (Pro/Founder/Gifted server-side generation) — additive.
-- BYOK (free users) never touches any of this; see supabase-setup.sql's
-- section 9 for the full commentary on why 'gifted' is a plan_limits-only
-- key and why ai_included_override exists instead of a new users.plan value.
-- ===========================================================================

alter table public.users
  add column ai_included_override boolean not null default false,
  add column provider_preference text not null default 'gemini-2.0-flash',
  add column generation_limit_daily integer,
  add column generation_limit_monthly integer;

create table public.plan_limits (
  plan text primary key,
  ai_included boolean not null default false,
  daily_limit integer not null,
  monthly_limit integer not null,
  max_concurrent integer not null default 1,
  updated_at timestamptz not null default now()
);

insert into public.plan_limits (plan, ai_included, daily_limit, monthly_limit, max_concurrent) values
  ('free', false, 0, 0, 1),
  ('pro', true, 60, 1200, 2),
  ('lifetime', true, 60, 1200, 2),
  ('gifted', true, 60, 1200, 2);

create table public.ai_usage_log (
  id bigint generated always as identity primary key,
  user_id uuid references public.users(id) on delete cascade,
  request_id uuid not null,
  generation_mode text not null,
  model text not null default 'gemini-2.0-flash',
  input_chars integer not null,
  image_count integer not null default 0,
  output_tokens_est integer,
  latency_ms integer,
  status text not null,
  result_text text,
  error_detail text,
  estimated_cost_usd numeric(10,6) default 0,
  client_ip text,
  device_id text,
  created_at timestamptz not null default now()
);

create unique index ai_usage_log_request_id_idx on public.ai_usage_log (request_id);
create index ai_usage_log_user_created_idx on public.ai_usage_log (user_id, created_at desc);

create table public.ai_rate_limit_counters (
  key text not null,
  window_start timestamptz not null,
  count integer not null default 1,
  primary key (key, window_start)
);

create index ai_rate_limit_counters_window_idx on public.ai_rate_limit_counters (window_start);

create table public.ai_inflight_requests (
  id uuid primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  started_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index ai_inflight_user_idx on public.ai_inflight_requests (user_id);
create index ai_inflight_expires_idx on public.ai_inflight_requests (expires_at);

create table public.ai_config (
  id boolean primary key default true check (id),
  ai_included_enabled boolean not null default false,
  global_daily_spend_cap_usd numeric(10,2) not null default 20.00,
  global_monthly_spend_cap_usd numeric(10,2) not null default 300.00,
  updated_at timestamptz not null default now()
);

insert into public.ai_config (id) values (true);

alter table public.plan_limits enable row level security;
alter table public.ai_usage_log enable row level security;
alter table public.ai_rate_limit_counters enable row level security;
alter table public.ai_inflight_requests enable row level security;
alter table public.ai_config enable row level security;
-- All five are service-role only — no anon/authenticated policies. The app
-- reads/writes them exclusively via the service client inside
-- app/api/generate, never via the user-scoped client.

-- ===========================================================================
-- Included AI — production-readiness hardening (pre-launch audit).
-- See supabase-setup.sql section 10 for the full commentary on why each of
-- these exists (idempotency scoping, atomic concurrency/rate-limit
-- functions, real token accounting).
-- ===========================================================================

drop index ai_usage_log_request_id_idx;
create unique index ai_usage_log_user_request_idx on public.ai_usage_log (user_id, request_id);

alter table public.ai_usage_log
  add column input_tokens integer,
  add column output_tokens integer,
  add column total_tokens integer;

create or replace function public.claim_inflight_slot(
  p_id uuid,
  p_user_id uuid,
  p_max_concurrent integer,
  p_ttl_seconds integer default 70
) returns boolean
language plpgsql
as $$
declare
  v_count integer;
begin
  perform pg_advisory_xact_lock(hashtext(p_user_id::text));

  delete from public.ai_inflight_requests where expires_at < now();

  select count(*) into v_count
  from public.ai_inflight_requests
  where user_id = p_user_id;

  if v_count >= p_max_concurrent then
    return false;
  end if;

  insert into public.ai_inflight_requests (id, user_id, expires_at)
  values (p_id, p_user_id, now() + make_interval(secs => p_ttl_seconds))
  on conflict (id) do nothing;

  return true;
end;
$$;

create or replace function public.increment_rate_limit(
  p_key text,
  p_window_start timestamptz,
  p_limit integer
) returns table(count integer, allowed boolean)
language sql
as $$
  insert into public.ai_rate_limit_counters (key, window_start, count)
  values (p_key, p_window_start, 1)
  on conflict (key, window_start)
  do update set count = public.ai_rate_limit_counters.count + 1
  returning public.ai_rate_limit_counters.count, public.ai_rate_limit_counters.count <= p_limit;
$$;

-- ===========================================================================
-- Final SQL-layer audit — see supabase-setup.sql section 11 for full
-- commentary. Three fixes:
--  (a) users_update_own (defined above, before Included AI existed) allowed
--      any authenticated user to PATCH their own public.users row directly
--      via PostgREST (NEXT_PUBLIC_SUPABASE_ANON_KEY is a public key), with
--      no WITH CHECK and no column restrictions — self-granting
--      ai_included_override, generation limits, or even `plan` itself. No
--      application code ever used this policy; all writes go through the
--      service-role client.
--  (b) no index supported the global spend-cap scan in
--      lib/ai/config.ts's getCurrentSpend(), which runs on every
--      /api/generate request and filters status/created_at with no user_id
--      predicate.
--  (c) explicit EXECUTE grants for the two RPC functions, independent of
--      Postgres's default PUBLIC execute grant.
-- ===========================================================================

drop policy if exists "Users can update own profile" on public.users;

create index ai_usage_log_status_created_idx
  on public.ai_usage_log (created_at)
  where status = 'success';

grant execute on function public.claim_inflight_slot(uuid, uuid, integer, integer) to service_role;
grant execute on function public.increment_rate_limit(text, timestamptz, integer) to service_role;
