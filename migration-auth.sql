-- ============================================
-- MIGRATION: Add Supabase Auth to Side Hustle Club
-- Run this in Supabase SQL Editor
-- ============================================

-- 1. Add user_id and email columns to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id);
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS email text;

-- 2. Create index for fast user_id lookups
CREATE INDEX IF NOT EXISTS idx_profiles_user_id ON profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_profiles_email ON profiles(email);

-- 3. Drop the sessions table (Supabase Auth handles sessions now)
DROP TABLE IF EXISTS sessions;

-- 4. Update RLS policies on profiles
-- Drop old policies
DROP POLICY IF EXISTS "Allow all reads" ON profiles;
DROP POLICY IF EXISTS "Allow all inserts" ON profiles;
DROP POLICY IF EXISTS "Allow all updates" ON profiles;
DROP POLICY IF EXISTS "Allow all deletes" ON profiles;

-- New policies: permissive (access code is the security gate)
CREATE POLICY "Anyone can read profiles" ON profiles FOR SELECT USING (true);
CREATE POLICY "Anyone can insert profiles" ON profiles FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update profiles" ON profiles FOR UPDATE USING (true);
CREATE POLICY "Anyone can delete profiles" ON profiles FOR DELETE USING (true);

-- Done! Now go to Supabase Dashboard:
-- Authentication > Settings > Email Auth
-- Turn OFF "Confirm email" (so users don't need to verify email to log in)
