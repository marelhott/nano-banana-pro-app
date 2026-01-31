alter table public.generated_images
add column if not exists params jsonb not null default '{}'::jsonb;
