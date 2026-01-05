-- Nano Banana Pro - Supabase Database Schema
-- Spusťte tento skript v SQL Editoru na: https://supabase.com/dashboard/project/poregdcgfwokxgmhpvac/sql

-- 1. Vytvořit tabulku uživatelů (PIN autentizace)
CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pin_hash text UNIQUE NOT NULL,
  created_at timestamptz DEFAULT now(),
  last_login timestamptz DEFAULT now()
);

-- 2. Uložené obrázky (nahrané z počítače)
CREATE TABLE IF NOT EXISTS saved_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  file_name text NOT NULL,
  storage_path text NOT NULL,
  category text NOT NULL CHECK (category IN ('reference', 'style')),
  file_size bigint,
  created_at timestamptz DEFAULT now()
);

-- 3. Vygenerované obrázky (Gemini)
CREATE TABLE IF NOT EXISTS generated_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  prompt text NOT NULL,
  storage_path text NOT NULL,
  thumbnail_path text,
  resolution text,
  aspect_ratio text,
  created_at timestamptz DEFAULT now()
);

-- 4. Nastavení uživatele
CREATE TABLE IF NOT EXISTS user_settings (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  settings jsonb DEFAULT '{}'::jsonb,
  updated_at timestamptz DEFAULT now()
);

-- 5. Zapnout Row Level Security (RLS)
ALTER TABLE saved_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE generated_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;

-- 6. Vytvořit RLS policies (každý vidí jen svá data)
-- Pro saved_images
DROP POLICY IF EXISTS "Users manage own saved images" ON saved_images;
CREATE POLICY "Users manage own saved images"
  ON saved_images
  FOR ALL
  USING (user_id = auth.uid()::uuid)
  WITH CHECK (user_id = auth.uid()::uuid);

-- Pro generated_images
DROP POLICY IF EXISTS "Users manage own generated images" ON generated_images;
CREATE POLICY "Users manage own generated images"
  ON generated_images
  FOR ALL
  USING (user_id = auth.uid()::uuid)
  WITH CHECK (user_id = auth.uid()::uuid);

-- Pro user_settings
DROP POLICY IF EXISTS "Users manage own settings" ON user_settings;
CREATE POLICY "Users manage own settings"
  ON user_settings
  FOR ALL
  USING (user_id = auth.uid()::uuid)
  WITH CHECK (user_id = auth.uid()::uuid);

-- 7. Vytvořit storage bucket pro obrázky
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'images',
  'images',
  true,
  52428800, -- 50MB limit
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/jpg']
)
ON CONFLICT (id) DO NOTHING;

-- 8. Storage policies (každý uploaduje do své složky)
DROP POLICY IF EXISTS "Users upload own images" ON storage.objects;
CREATE POLICY "Users upload own images"
  ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'images' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "Users delete own images" ON storage.objects;
CREATE POLICY "Users delete own images"
  ON storage.objects
  FOR DELETE
  USING (
    bucket_id = 'images' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "Anyone can view images" ON storage.objects;
CREATE POLICY "Anyone can view images"
  ON storage.objects
  FOR SELECT
  USING (bucket_id = 'images');

-- 9. Vytvořit indexy pro rychlejší dotazy
CREATE INDEX IF NOT EXISTS idx_saved_images_user_id ON saved_images(user_id);
CREATE INDEX IF NOT EXISTS idx_saved_images_created_at ON saved_images(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_generated_images_user_id ON generated_images(user_id);
CREATE INDEX IF NOT EXISTS idx_generated_images_created_at ON generated_images(created_at DESC);

-- Hotovo! Databáze je připravena.
