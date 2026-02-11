-- Harden permissive RLS policies that used USING (true) / WITH CHECK (true).
-- This targets Security Advisor warnings "RLS Policy Always True" for:
-- - public.users
-- - public.flux_presets

-- Ensure link table exists (used by flux_presets policies).
create table if not exists public.user_auth_identities (
  user_id uuid not null references public.users(id) on delete cascade,
  auth_user_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (user_id, auth_user_id),
  unique (auth_user_id)
);

alter table if exists public.users enable row level security;
alter table if exists public.flux_presets enable row level security;
alter table if exists public.user_auth_identities enable row level security;

-- Drop old permissive users policies from supabase-fix-rls.sql.
drop policy if exists "Enable read access for all users" on public.users;
drop policy if exists "Enable insert for all users" on public.users;
drop policy if exists "Enable update for own record" on public.users;

-- Users table still needs anonymous-session access for PIN flow.
-- We remove "always true", but keep explicit "has Supabase session" requirement.
drop policy if exists "users_select_with_session" on public.users;
create policy "users_select_with_session"
  on public.users
  for select
  using (auth.uid() is not null);

drop policy if exists "users_insert_with_session" on public.users;
create policy "users_insert_with_session"
  on public.users
  for insert
  with check (auth.uid() is not null);

-- Optional update: allow only linked session to update row (mainly last_login).
drop policy if exists "users_update_linked" on public.users;
create policy "users_update_linked"
  on public.users
  for update
  using (
    exists (
      select 1
      from public.user_auth_identities uai
      where uai.user_id = users.id
        and uai.auth_user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.user_auth_identities uai
      where uai.user_id = users.id
        and uai.auth_user_id = auth.uid()
    )
  );

-- Flux presets: replace open policy with linked-identity policy.
drop policy if exists "flux_presets_all" on public.flux_presets;

drop policy if exists "flux_presets_select_linked" on public.flux_presets;
create policy "flux_presets_select_linked"
  on public.flux_presets
  for select
  using (
    exists (
      select 1
      from public.user_auth_identities uai
      where uai.user_id = flux_presets.user_id
        and uai.auth_user_id = auth.uid()
    )
  );

drop policy if exists "flux_presets_insert_linked" on public.flux_presets;
create policy "flux_presets_insert_linked"
  on public.flux_presets
  for insert
  with check (
    exists (
      select 1
      from public.user_auth_identities uai
      where uai.user_id = flux_presets.user_id
        and uai.auth_user_id = auth.uid()
    )
  );

drop policy if exists "flux_presets_update_linked" on public.flux_presets;
create policy "flux_presets_update_linked"
  on public.flux_presets
  for update
  using (
    exists (
      select 1
      from public.user_auth_identities uai
      where uai.user_id = flux_presets.user_id
        and uai.auth_user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.user_auth_identities uai
      where uai.user_id = flux_presets.user_id
        and uai.auth_user_id = auth.uid()
    )
  );

drop policy if exists "flux_presets_delete_linked" on public.flux_presets;
create policy "flux_presets_delete_linked"
  on public.flux_presets
  for delete
  using (
    exists (
      select 1
      from public.user_auth_identities uai
      where uai.user_id = flux_presets.user_id
        and uai.auth_user_id = auth.uid()
    )
  );
