-- Hustle Swap — company uploads, live feed, and file storage
-- Paste this whole file into the Supabase SQL Editor and click Run.

create table swap_companies (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  founder text not null check (char_length(founder) between 1 and 80),
  website text,
  description text not null default '' check (char_length(description) <= 500),
  logo_url text,
  -- [{ name, url, size, type }] — the files themselves live in the hustle-swap bucket
  files jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table swap_posts (
  id uuid primary key default gen_random_uuid(),
  author text not null check (char_length(author) between 1 and 60),
  body text not null check (char_length(body) between 1 and 1000),
  link text,
  created_at timestamptz not null default now()
);

-- RLS: anyone (anon key) can submit and read; nobody can edit or delete from
-- the browser. Moderate from the Supabase dashboard (Table Editor → delete row).
alter table swap_companies enable row level security;
alter table swap_posts enable row level security;

create policy "anyone can submit a company" on swap_companies
  for insert with check (true);
create policy "companies are public" on swap_companies
  for select using (true);

create policy "anyone can post" on swap_posts
  for insert with check (true);
create policy "posts are public" on swap_posts
  for select using (true);

-- Public bucket so download links work without auth. 50 MB per file is the
-- free-plan ceiling; any file type is allowed (PDF, DOCX, PPTX, images...).
insert into storage.buckets (id, name, public, file_size_limit)
values ('hustle-swap', 'hustle-swap', true, 52428800)
on conflict (id) do nothing;

create policy "anyone can upload hustle swap files" on storage.objects
  for insert to anon, authenticated
  with check (bucket_id = 'hustle-swap');

-- ─────────────────────────────────────────────────────────────
-- To reset between events, run:
--   truncate swap_posts, swap_companies;
-- then empty the hustle-swap bucket in Storage.
-- ─────────────────────────────────────────────────────────────
