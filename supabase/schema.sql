-- Branchefy cloud: account, amici, watch party relay
-- Esegui nel SQL Editor di Supabase (Dashboard → SQL → New query)

create extension if not exists "pgcrypto";

-- Profilo pubblico collegato ad auth.users
create table if not exists public.cloud_profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  display_name text not null,
  friend_code text not null unique,
  created_at timestamptz not null default now()
);

create index if not exists cloud_profiles_email_idx on public.cloud_profiles (lower(email));

-- Richieste di amicizia
create table if not exists public.friend_requests (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.cloud_profiles (id) on delete cascade,
  addressee_id uuid not null references public.cloud_profiles (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now(),
  unique (requester_id, addressee_id)
);

-- Stanze watch party (sync online)
create table if not exists public.watch_party_rooms (
  code text primary key,
  host_id uuid not null references public.cloud_profiles (id) on delete cascade,
  host_name text not null,
  content jsonb not null,
  playing boolean not null default false,
  position_secs double precision not null default 0,
  is_active boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table public.cloud_profiles enable row level security;
alter table public.friend_requests enable row level security;
alter table public.watch_party_rooms enable row level security;

-- cloud_profiles
create policy "profiles read authenticated"
  on public.cloud_profiles for select
  to authenticated
  using (true);

create policy "profiles insert own"
  on public.cloud_profiles for insert
  to authenticated
  with check (auth.uid() = id);

create policy "profiles update own"
  on public.cloud_profiles for update
  to authenticated
  using (auth.uid() = id);

-- friend_requests
create policy "friend_requests read involved"
  on public.friend_requests for select
  to authenticated
  using (auth.uid() = requester_id or auth.uid() = addressee_id);

create policy "friend_requests insert self"
  on public.friend_requests for insert
  to authenticated
  with check (auth.uid() = requester_id);

create policy "friend_requests update addressee"
  on public.friend_requests for update
  to authenticated
  using (auth.uid() = addressee_id or auth.uid() = requester_id);

-- watch_party_rooms
create policy "rooms read authenticated"
  on public.watch_party_rooms for select
  to authenticated
  using (is_active = true);

create policy "rooms insert host"
  on public.watch_party_rooms for insert
  to authenticated
  with check (auth.uid() = host_id);

create policy "rooms update host"
  on public.watch_party_rooms for update
  to authenticated
  using (auth.uid() = host_id);

-- Cerca utente per email (solo se autenticato)
create or replace function public.lookup_friend_by_email(lookup_email text)
returns table (user_id uuid, display_name text, friend_code text)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Non autenticato';
  end if;
  return query
  select p.id, p.display_name, p.friend_code
  from public.cloud_profiles p
  where lower(p.email) = lower(trim(lookup_email))
    and p.id <> auth.uid()
  limit 1;
end;
$$;

revoke all on function public.lookup_friend_by_email(text) from public;
grant execute on function public.lookup_friend_by_email(text) to authenticated;

-- Realtime per watch party (abilita in Dashboard → Database → Replication se necessario)
alter publication supabase_realtime add table public.watch_party_rooms;
