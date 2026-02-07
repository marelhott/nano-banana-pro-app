-- Disable RLS for app tables because the app uses custom PIN auth (not Supabase Auth)

ALTER TABLE IF EXISTS public.saved_images DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.generated_images DISABLE ROW LEVEL SECURITY;
-- Keep RLS on user_settings because it may contain sensitive configuration metadata.
ALTER TABLE IF EXISTS public.user_settings ENABLE ROW LEVEL SECURITY;

-- Storage: allow the frontend (anon key) to upload/delete in the public 'images' bucket
DROP POLICY IF EXISTS "Users upload own images" ON storage.objects;
DROP POLICY IF EXISTS "Users delete own images" ON storage.objects;

DROP POLICY IF EXISTS "Public upload images" ON storage.objects;
CREATE POLICY "Public upload images"
  ON storage.objects
  FOR INSERT
  WITH CHECK (bucket_id = 'images');

DROP POLICY IF EXISTS "Public delete images" ON storage.objects;
CREATE POLICY "Public delete images"
  ON storage.objects
  FOR DELETE
  USING (bucket_id = 'images');
