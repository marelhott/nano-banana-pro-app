-- DOČASNÉ ŘEŠENÍ: Vypnout RLS pro testování
-- Spusťte tento SQL v Supabase SQL Editoru

-- Vypnout RLS na všech tabulkách
ALTER TABLE saved_images DISABLE ROW LEVEL SECURITY;
ALTER TABLE generated_images DISABLE ROW LEVEL SECURITY;
ALTER TABLE user_settings DISABLE ROW LEVEL SECURITY;
ALTER TABLE users DISABLE ROW LEVEL SECURITY;

-- Poznámka: Toto je POUZE pro testování!
-- V produkci byste měli používat správné RLS policies
