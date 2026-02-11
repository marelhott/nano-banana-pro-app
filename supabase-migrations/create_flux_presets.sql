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

alter table public.flux_presets enable row level security;

create table if not exists public.user_auth_identities (
  user_id uuid not null references public.users(id) on delete cascade,
  auth_user_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (user_id, auth_user_id),
  unique (auth_user_id)
);

alter table public.user_auth_identities enable row level security;

drop policy if exists "flux_presets_all" on public.flux_presets;

create policy "flux_presets_select_linked"
  on public.flux_presets
  for select
  using (
    exists (
      select 1 from public.user_auth_identities uai
      where uai.user_id = flux_presets.user_id
        and uai.auth_user_id = auth.uid()
    )
  );

create policy "flux_presets_insert_linked"
  on public.flux_presets
  for insert
  with check (
    exists (
      select 1 from public.user_auth_identities uai
      where uai.user_id = flux_presets.user_id
        and uai.auth_user_id = auth.uid()
    )
  );

create policy "flux_presets_update_linked"
  on public.flux_presets
  for update
  using (
    exists (
      select 1 from public.user_auth_identities uai
      where uai.user_id = flux_presets.user_id
        and uai.auth_user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.user_auth_identities uai
      where uai.user_id = flux_presets.user_id
        and uai.auth_user_id = auth.uid()
    )
  );

create policy "flux_presets_delete_linked"
  on public.flux_presets
  for delete
  using (
    exists (
      select 1 from public.user_auth_identities uai
      where uai.user_id = flux_presets.user_id
        and uai.auth_user_id = auth.uid()
    )
  );
