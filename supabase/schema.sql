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
  max_tokens  int  not null check (max_tokens between 16 and 4096),
  -- [{ "temperature": 0, "output": "...", "tokens": 42, "latencyMs": 812, "error": null }, ...]
  results     jsonb not null check (jsonb_typeof(results) = 'array')
);

-- Upgrade from the earlier 1024-token limit (no-op on a fresh install).
alter table public.runs drop constraint if exists runs_max_tokens_check;
alter table public.runs add constraint runs_max_tokens_check check (max_tokens between 16 and 4096);

comment on table public.runs is 'Each prompt run at temperatures 0, 0.7 and 1.5 (written by /api/run).';

create index if not exists runs_created_at_idx on public.runs (created_at desc);
create index if not exists runs_model_idx on public.runs (model, created_at desc);

-- ---------------------------------------------------------------------------
-- 2. Chat logs table: one row per message sent from the Chat box (/api/chat)
-- ---------------------------------------------------------------------------
create table if not exists public.chat_logs (
  id               uuid primary key default gen_random_uuid(),
  created_at       timestamptz not null default now(),
  -- Groups the turns of one conversation; resets when the user clicks Clear.
  conversation_id  uuid,
  model            text not null,
  temperature      numeric not null,
  max_tokens       int  not null check (max_tokens between 16 and 4096),
  prompt           text not null,          -- the latest user message
  -- The full conversation sent to the model: [{ "role": "user", "content": "..." }, ...]
  messages         jsonb not null check (jsonb_typeof(messages) = 'array'),
  output           text,
  reasoning        text,
  finish_reason    text,
  tokens           int,
  latency_ms       int,
  error            text                    -- set when the NVIDIA call failed
);

comment on table public.chat_logs is 'Every Chat box request and response (written by /api/chat).';

create index if not exists chat_logs_created_at_idx on public.chat_logs (created_at desc);
create index if not exists chat_logs_conversation_idx on public.chat_logs (conversation_id, created_at);

-- ---------------------------------------------------------------------------
-- 3. Security: only the server may touch these tables
-- ---------------------------------------------------------------------------
-- The Cloudflare Worker uses the secret key (or legacy service_role key), which bypasses RLS.
-- With RLS on and no policies, the public anon key can read or write nothing.
alter table public.runs enable row level security;
revoke all on table public.runs from anon, authenticated;
alter table public.chat_logs enable row level security;
revoke all on table public.chat_logs from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Comparison view: one row per (run, temperature)
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
  res ->> 'error'                        as error,
  res ->> 'reasoning'                    as reasoning,
  res ->> 'finishReason'                 as finish_reason
from public.runs r
cross join lateral jsonb_array_elements(r.results) as res;

revoke all on public.run_outputs from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. Everything in one place: every query and response from the website
-- ---------------------------------------------------------------------------
--   select * from all_queries order by created_at desc limit 50;
create or replace view public.all_queries
with (security_invoker = true) as
select 'playground'::text as source, run_id as id, null::uuid as conversation_id, created_at, model,
       temperature, prompt, output, reasoning, finish_reason, tokens, latency_ms, error
from public.run_outputs
union all
select 'chat', id, conversation_id, created_at, model,
       temperature, prompt, output, reasoning, finish_reason, tokens, latency_ms, error
from public.chat_logs;

revoke all on public.all_queries from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 6. Optional cleanup: delete runs and chat logs older than N days
-- ---------------------------------------------------------------------------
-- Run by hand:  select public.delete_old_runs(90);
-- Or schedule it with the pg_cron extension (Database → Extensions → pg_cron):
--   select cron.schedule('delete-old-runs', '0 3 * * *', 'select public.delete_old_runs(90)');
create or replace function public.delete_old_runs(days int default 90)
returns int
language sql
as $$
  with deleted_runs as (
    delete from public.runs
    where created_at < now() - make_interval(days => days)
    returning 1
  ), deleted_chats as (
    delete from public.chat_logs
    where created_at < now() - make_interval(days => days)
    returning 1
  )
  select ((select count(*) from deleted_runs) + (select count(*) from deleted_chats))::int;
$$;

revoke execute on function public.delete_old_runs(int) from public, anon, authenticated;
