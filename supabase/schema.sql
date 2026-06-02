-- Value Maps — Supabase schema
-- Run this once in your Supabase project: SQL Editor → New query → paste → Run.
-- Then set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in your environment.

create table if not exists public.value_aggregates (
  world      text        not null,
  region     text        not null,
  data       jsonb       not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (world, region)
);

-- Lock the table down. The app talks to Supabase only from the server using the
-- service-role key, which bypasses RLS — so no public policies are needed and
-- the table is not readable/writable with the public anon key.
alter table public.value_aggregates enable row level security;
