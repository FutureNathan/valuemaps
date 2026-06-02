-- Value Maps — shared community responses.
-- Applied automatically if you use Supabase CLI migrations / GitHub branching.
-- Otherwise just paste this (or supabase/schema.sql) into the Supabase SQL Editor.

create table if not exists public.value_aggregates (
  world      text        not null,
  region     text        not null,
  data       jsonb       not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (world, region)
);

-- The app talks to Supabase only from the server using the service-role key,
-- which bypasses RLS. With RLS on and no policies, the table is private.
alter table public.value_aggregates enable row level security;
