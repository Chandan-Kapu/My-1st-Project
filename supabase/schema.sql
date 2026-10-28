-- Temperature Playground: Supabase schema
-- Paste this whole file into Supabase → SQL Editor → New query → Run.
-- Safe to run more than once.

-- ---------------------------------------------------------------------------
-- 1. Runs table: one row per click of "Run ×3"
-- ---------------------------------------------------------------------------
create table if not exists public.runs (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  prompt      text not null check (char_length(prompt) between 1 and 4000),
  model       text not null,
  max_tokens  int  not null check (max_tokens between 16 and 1024),
  -- [{ "temperature": 0, "output": "...", "tokens": 42, "latencyMs": 812, "error": null }, ...]
  results     jsonb not null check (jsonb_typeof(results) = 'array')
);

comment on table public.runs is 'Each prompt run at temperatures 0, 0.7 and 1.5 (written by /api/run).';

create index if not exists runs_created_at_idx on public.runs (created_at desc);
create index if not exists runs_model_idx on public.runs (model, created_at desc);

-- ---------------------------------------------------------------------------
-- 2. Security: only the server may touch this table
-- ---------------------------------------------------------------------------
-- The Cloudflare Functions use the service_role key, which bypasses RLS.
-- With RLS on and no policies, the public anon key can read or write nothing.
alter table public.runs enable row level security;
revoke all on table public.runs from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Comparison view: one row per (run, temperature)
-- ---------------------------------------------------------------------------
-- Handy in the Supabase table editor, e.g.:
--   select * from run_outputs where model = 'meta/llama-3.1-8b-instruct';
create or replace view public.run_outputs
with (security_invoker = true) as
select
  r.id                                   as run_id,
  r.created_at,
  r.model,
  r.prompt,
  (res ->> 'temperature')::numeric       as temperature,
  res ->> 'output'                       as output,
  (res ->> 'tokens')::int                as tokens,
  (res ->> 'latencyMs')::int             as latency_ms,
  res ->> 'error'                        as error
from public.runs r
cross join lateral jsonb_array_elements(r.results) as res;

revoke all on public.run_outputs from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Optional cleanup: delete runs older than N days
-- ---------------------------------------------------------------------------
-- Run by hand:  select public.delete_old_runs(90);
-- Or schedule it with the pg_cron extension (Database → Extensions → pg_cron):
--   select cron.schedule('delete-old-runs', '0 3 * * *', 'select public.delete_old_runs(90)');
create or replace function public.delete_old_runs(days int default 90)
returns int
language sql
as $$
  with deleted as (
    delete from public.runs
    where created_at < now() - make_interval(days => days)
    returning 1
  )
  select count(*)::int from deleted;
$$;

revoke execute on function public.delete_old_runs(int) from public, anon, authenticated;
