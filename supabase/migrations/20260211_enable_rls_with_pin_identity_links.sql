-- Enable RLS for PIN-based app tables while keeping access tied to Supabase Auth session.
-- This removes Security Advisor warnings for:
-- - public.saved_images
-- - public.generated_images
-- - public.saved_prompts
-- - public.user_settings
--
-- Approach:
-- 1) Keep app-level PIN identity in public.users (existing behavior).
-- 2) Link current auth.uid() to that app user via public.user_auth_identities.
-- 3) RLS policies on app tables allow access only when that link exists.

create table if not exists public.user_auth_identities (
  user_id uuid not null references public.users(id) on delete cascade,
  auth_user_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (user_id, auth_user_id),
  unique (auth_user_id)
);

create index if not exists idx_user_auth_identities_user_id
  on public.user_auth_identities(user_id);

alter table public.user_auth_identities enable row level security;

drop policy if exists "user_auth_identities_select_own" on public.user_auth_identities;
create policy "user_auth_identities_select_own"
  on public.user_auth_identities
  for select
  using (auth.uid() = auth_user_id);

drop policy if exists "user_auth_identities_insert_own" on public.user_auth_identities;
create policy "user_auth_identities_insert_own"
  on public.user_auth_identities
  for insert
  with check (auth.uid() = auth_user_id);

drop policy if exists "user_auth_identities_update_own" on public.user_auth_identities;
create policy "user_auth_identities_update_own"
  on public.user_auth_identities
  for update
  using (auth.uid() = auth_user_id)
  with check (auth.uid() = auth_user_id);

drop policy if exists "user_auth_identities_delete_own" on public.user_auth_identities;
create policy "user_auth_identities_delete_own"
  on public.user_auth_identities
  for delete
  using (auth.uid() = auth_user_id);

alter table if exists public.saved_images enable row level security;
alter table if exists public.generated_images enable row level security;
alter table if exists public.user_settings enable row level security;
alter table if exists public.saved_prompts enable row level security;

drop policy if exists "Users manage own saved images" on public.saved_images;
drop policy if exists "saved_images_select_linked" on public.saved_images;
create policy "saved_images_select_linked"
  on public.saved_images
  for select
  using (
    exists (
      select 1
      from public.user_auth_identities uai
      where uai.user_id = saved_images.user_id
        and uai.auth_user_id = auth.uid()
    )
  );

drop policy if exists "saved_images_insert_linked" on public.saved_images;
create policy "saved_images_insert_linked"
  on public.saved_images
  for insert
  with check (
    exists (
      select 1
      from public.user_auth_identities uai
      where uai.user_id = saved_images.user_id
        and uai.auth_user_id = auth.uid()
    )
  );

drop policy if exists "saved_images_update_linked" on public.saved_images;
create policy "saved_images_update_linked"
  on public.saved_images
  for update
  using (
    exists (
      select 1
      from public.user_auth_identities uai
      where uai.user_id = saved_images.user_id
        and uai.auth_user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.user_auth_identities uai
      where uai.user_id = saved_images.user_id
        and uai.auth_user_id = auth.uid()
    )
  );

drop policy if exists "saved_images_delete_linked" on public.saved_images;
create policy "saved_images_delete_linked"
  on public.saved_images
  for delete
  using (
    exists (
      select 1
      from public.user_auth_identities uai
      where uai.user_id = saved_images.user_id
        and uai.auth_user_id = auth.uid()
    )
  );

drop policy if exists "Users manage own generated images" on public.generated_images;
drop policy if exists "generated_images_select_linked" on public.generated_images;
create policy "generated_images_select_linked"
  on public.generated_images
  for select
  using (
    exists (
      select 1
      from public.user_auth_identities uai
      where uai.user_id = generated_images.user_id
        and uai.auth_user_id = auth.uid()
    )
  );

drop policy if exists "generated_images_insert_linked" on public.generated_images;
create policy "generated_images_insert_linked"
  on public.generated_images
  for insert
  with check (
    exists (
      select 1
      from public.user_auth_identities uai
      where uai.user_id = generated_images.user_id
        and uai.auth_user_id = auth.uid()
    )
  );

drop policy if exists "generated_images_update_linked" on public.generated_images;
create policy "generated_images_update_linked"
  on public.generated_images
  for update
  using (
    exists (
      select 1
      from public.user_auth_identities uai
      where uai.user_id = generated_images.user_id
        and uai.auth_user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.user_auth_identities uai
      where uai.user_id = generated_images.user_id
        and uai.auth_user_id = auth.uid()
    )
  );

drop policy if exists "generated_images_delete_linked" on public.generated_images;
create policy "generated_images_delete_linked"
  on public.generated_images
  for delete
  using (
    exists (
      select 1
      from public.user_auth_identities uai
      where uai.user_id = generated_images.user_id
        and uai.auth_user_id = auth.uid()
    )
  );

drop policy if exists "Users manage own settings" on public.user_settings;
drop policy if exists "user_settings_select_own" on public.user_settings;
drop policy if exists "user_settings_insert_own" on public.user_settings;
drop policy if exists "user_settings_update_own" on public.user_settings;
drop policy if exists "user_settings_delete_own" on public.user_settings;

drop policy if exists "user_settings_select_linked" on public.user_settings;
create policy "user_settings_select_linked"
  on public.user_settings
  for select
  using (
    exists (
      select 1
      from public.user_auth_identities uai
      where uai.user_id = user_settings.user_id
        and uai.auth_user_id = auth.uid()
    )
  );

drop policy if exists "user_settings_insert_linked" on public.user_settings;
create policy "user_settings_insert_linked"
  on public.user_settings
  for insert
  with check (
    exists (
      select 1
      from public.user_auth_identities uai
      where uai.user_id = user_settings.user_id
        and uai.auth_user_id = auth.uid()
    )
  );

drop policy if exists "user_settings_update_linked" on public.user_settings;
create policy "user_settings_update_linked"
  on public.user_settings
  for update
  using (
    exists (
      select 1
      from public.user_auth_identities uai
      where uai.user_id = user_settings.user_id
        and uai.auth_user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.user_auth_identities uai
      where uai.user_id = user_settings.user_id
        and uai.auth_user_id = auth.uid()
    )
  );

drop policy if exists "user_settings_delete_linked" on public.user_settings;
create policy "user_settings_delete_linked"
  on public.user_settings
  for delete
  using (
    exists (
      select 1
      from public.user_auth_identities uai
      where uai.user_id = user_settings.user_id
        and uai.auth_user_id = auth.uid()
    )
  );

do $$
begin
  if to_regclass('public.saved_prompts') is not null then
    execute 'drop policy if exists "saved_prompts_select_linked" on public.saved_prompts';
    execute 'create policy "saved_prompts_select_linked"
      on public.saved_prompts
      for select
      using (
        exists (
          select 1
          from public.user_auth_identities uai
          where uai.user_id = saved_prompts.user_id
            and uai.auth_user_id = auth.uid()
        )
      )';

    execute 'drop policy if exists "saved_prompts_insert_linked" on public.saved_prompts';
    execute 'create policy "saved_prompts_insert_linked"
      on public.saved_prompts
      for insert
      with check (
        exists (
          select 1
          from public.user_auth_identities uai
          where uai.user_id = saved_prompts.user_id
            and uai.auth_user_id = auth.uid()
        )
      )';

    execute 'drop policy if exists "saved_prompts_update_linked" on public.saved_prompts';
    execute 'create policy "saved_prompts_update_linked"
      on public.saved_prompts
      for update
      using (
        exists (
          select 1
          from public.user_auth_identities uai
          where uai.user_id = saved_prompts.user_id
            and uai.auth_user_id = auth.uid()
        )
      )
      with check (
        exists (
          select 1
          from public.user_auth_identities uai
          where uai.user_id = saved_prompts.user_id
            and uai.auth_user_id = auth.uid()
        )
      )';

    execute 'drop policy if exists "saved_prompts_delete_linked" on public.saved_prompts';
    execute 'create policy "saved_prompts_delete_linked"
      on public.saved_prompts
      for delete
      using (
        exists (
          select 1
          from public.user_auth_identities uai
          where uai.user_id = saved_prompts.user_id
            and uai.auth_user_id = auth.uid()
        )
      )';
  end if;
end $$;
