-- ============================================
-- MIGRATION: Attendance roster - manual present/absent marks
-- Run this in Supabase SQL Editor
--
-- Adds attendance_marks only. Does NOT touch attendance_sessions or
-- attendance_submissions from attendance-migration.sql. A row here is
-- an exec override for one person in one session; no row means "go by
-- whether they submitted a post-it" (checked client-side by matching
-- profiles.name against attendance_submissions.member_name the same
-- lower(trim()) way the duplicate-submission index already does -
-- there's no FK between those two tables, so this is a soft match).
-- ============================================

create table if not exists attendance_marks (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references attendance_sessions(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  present boolean not null,
  marked_at timestamptz not null default now()
);

-- One manual mark per person per session; re-toggling updates it via upsert.
create unique index if not exists attendance_marks_one_per_profile
  on attendance_marks (session_id, profile_id);

create index if not exists idx_attendance_marks_session
  on attendance_marks (session_id);

-- RLS: permissive, matching attendance_sessions/attendance_submissions -
-- the admin-only UI is the gate (client-side, same as the rest of the
-- Admin Panel), not row-level auth.
alter table attendance_marks enable row level security;

drop policy if exists "Anyone can read marks" on attendance_marks;
drop policy if exists "Anyone can insert marks" on attendance_marks;
drop policy if exists "Anyone can update marks" on attendance_marks;
drop policy if exists "Anyone can delete marks" on attendance_marks;
create policy "Anyone can read marks" on attendance_marks for select using (true);
create policy "Anyone can insert marks" on attendance_marks for insert with check (true);
create policy "Anyone can update marks" on attendance_marks for update using (true);
create policy "Anyone can delete marks" on attendance_marks for delete using (true);
