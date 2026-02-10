-- Flux LoRA Generator: saveable presets
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor → New query)

create table if not exists public.flux_presets (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null,
  name        text not null,
  cfg         real not null default 3.5,
  strength    real not null default 0.35,
  steps       integer not null default 28,
  num_images  integer not null default 1,
  seed        integer,                       -- null = random
  image_size  text default 'landscape_4_3',  -- enum preset or JSON "{width,height}"
  output_format text default 'jpeg',         -- jpeg | png
  loras       jsonb not null default '[]',   -- [{path,scale}]
  prompt      text default '',               -- custom prompt (empty = auto)
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  -- Each user can have at most one preset with a given name.
  unique (user_id, name)
);

-- Index for fast listing by user.
create index if not exists idx_flux_presets_user on public.flux_presets (user_id);

-- Allow all operations (RLS disabled for simplicity, same pattern as saved_prompts).
alter table public.flux_presets enable row level security;

-- Policies (match existing app pattern: PIN-based user_id, no auth RLS).
-- If your project uses permissive RLS, add appropriate policies here.
-- For now, we keep it open (same as other app tables):
create policy "flux_presets_all" on public.flux_presets
  for all
  using (true)
  with check (true);
