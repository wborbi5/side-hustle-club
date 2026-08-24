-- ============================================
-- MIGRATION: Attendance "post-it board" feature
-- Run this in Supabase SQL Editor
--
-- Named attendance_sessions / attendance_submissions (not sessions /
-- submissions) to avoid colliding with the "sessions" table referenced
-- in migration-auth.sql, which is still unapplied in this project.
-- ============================================

create extension if not exists pgcrypto;

create table if not exists attendance_sessions (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  created_at timestamptz not null default now(),
  ended_at timestamptz,
  active boolean not null default true
);

create table if not exists attendance_submissions (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references attendance_sessions(id) on delete cascade,
  member_name text not null,
  content text not null,
  created_at timestamptz not null default now()
);

-- One post-it per person per session, case/whitespace-insensitive.
create unique index if not exists attendance_submissions_one_per_member
  on attendance_submissions (session_id, lower(trim(member_name)));

create index if not exists idx_attendance_submissions_session
  on attendance_submissions (session_id);

create index if not exists idx_attendance_sessions_active
  on attendance_sessions (active) where active = true;

-- RLS: permissive, matching this app's existing model (access_codes,
-- profiles) where the access code / attendance code is the security
-- gate, not row-level auth. Exec-only actions (start/end session) are
-- enforced client-side by role, same as the rest of the Admin Panel.
alter table attendance_sessions enable row level security;
alter table attendance_submissions enable row level security;

drop policy if exists "Anyone can read sessions" on attendance_sessions;
drop policy if exists "Anyone can insert sessions" on attendance_sessions;
drop policy if exists "Anyone can update sessions" on attendance_sessions;
create policy "Anyone can read sessions" on attendance_sessions for select using (true);
create policy "Anyone can insert sessions" on attendance_sessions for insert with check (true);
create policy "Anyone can update sessions" on attendance_sessions for update using (true);

drop policy if exists "Anyone can read submissions" on attendance_submissions;
drop policy if exists "Anyone can insert submissions" on attendance_submissions;
create policy "Anyone can read submissions" on attendance_submissions for select using (true);
create policy "Anyone can insert submissions" on attendance_submissions for insert with check (true);

-- Enable Realtime so post-its appear on the board live, no refresh.
alter publication supabase_realtime add table attendance_submissions;
