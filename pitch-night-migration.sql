-- Pitch Night — one-hour live pitch event
-- Paste this whole file into the Supabase SQL Editor and click Run.

create table arena_players (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table arena_companies (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references arena_players(id),
  name text not null,
  tagline text not null default '',
  created_at timestamptz not null default now()
);

create table arena_investments (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references arena_players(id),
  company_id uuid not null references arena_companies(id),
  amount integer not null check (amount > 0),
  created_at timestamptz not null default now()
);

-- Everyone starts with $100,000. The only rule the database enforces:
-- you can't invest more than you have. Everything else is on the honor system.
create or replace function arena_invest(p_player uuid, p_company uuid, p_amount int)
returns text
language plpgsql
security definer
as $$
declare
  spent int;
begin
  if p_amount <= 0 then
    return 'Amount must be positive';
  end if;
  select coalesce(sum(amount), 0) into spent
  from arena_investments where player_id = p_player;
  if spent + p_amount > 100000 then
    return 'Not enough funds left';
  end if;
  insert into arena_investments (player_id, company_id, amount)
  values (p_player, p_company, p_amount);
  return 'ok';
end;
$$;

create view arena_leaderboard as
  select
    c.id,
    c.name,
    c.tagline,
    p.name as founder,
    coalesce(sum(i.amount), 0)::int as raised,
    count(distinct i.player_id)::int as backers
  from arena_companies c
  join arena_players p on p.id = c.player_id
  left join arena_investments i on i.company_id = c.id
  group by c.id, c.name, c.tagline, p.name
  order by raised desc, c.created_at asc;

-- RLS: anyone (anon key) can join and add a company, nobody can update or
-- delete from the browser, and investing must go through arena_invest().
alter table arena_players enable row level security;
alter table arena_companies enable row level security;
alter table arena_investments enable row level security;

create policy "anyone can join" on arena_players
  for insert with check (true);
create policy "players are public" on arena_players
  for select using (true);

create policy "anyone can pitch" on arena_companies
  for insert with check (true);
create policy "companies are public" on arena_companies
  for select using (true);

-- select only — inserts happen inside arena_invest() (security definer)
create policy "investments are public" on arena_investments
  for select using (true);

grant select on arena_leaderboard to anon, authenticated;

-- ─────────────────────────────────────────────────────────────
-- To reset between events, run:
--   truncate arena_investments, arena_companies, arena_players;
-- ─────────────────────────────────────────────────────────────
