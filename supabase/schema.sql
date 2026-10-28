-- Run this in the Supabase SQL editor.
create table if not exists public.runs (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  prompt      text not null,
  model       text not null,
  max_tokens  int  not null,
  -- [{ temperature, output, tokens, latencyMs, error? }, ...]
  results     jsonb not null
);

create index if not exists runs_created_at_idx on public.runs (created_at desc);

-- Lock the table down: only the server (service-role key, which bypasses RLS) can read/write.
-- The browser never talks to Supabase directly.
alter table public.runs enable row level security;
