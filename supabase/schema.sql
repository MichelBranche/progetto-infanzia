-- Branchefy cloud: account, amici, watch party relay
-- Esegui nel SQL Editor di Supabase (Dashboard → SQL → New query)
-- Sicuro da rieseguire: policy e publication vengono ricreate solo se mancanti.

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

-- Presenza online amici (heartbeat client)
create table if not exists public.user_presence (
  user_id uuid primary key references public.cloud_profiles (id) on delete cascade,
  status text not null default 'online' check (status in ('online', 'away', 'offline')),
  last_seen_at timestamptz not null default now(),
  activity text,
  updated_at timestamptz not null default now()
);

create index if not exists user_presence_last_seen_idx on public.user_presence (last_seen_at desc);

alter table public.user_presence enable row level security;

drop policy if exists "presence read authenticated" on public.user_presence;
create policy "presence read authenticated"
  on public.user_presence for select
  to authenticated
  using (true);

drop policy if exists "presence insert own" on public.user_presence;
create policy "presence insert own"
  on public.user_presence for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "presence update own" on public.user_presence;
create policy "presence update own"
  on public.user_presence for update
  to authenticated
  using (auth.uid() = user_id);

alter table public.user_presence replica identity full;

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
drop policy if exists "profiles read authenticated" on public.cloud_profiles;
create policy "profiles read authenticated"
  on public.cloud_profiles for select
  to authenticated
  using (true);

drop policy if exists "profiles insert own" on public.cloud_profiles;
create policy "profiles insert own"
  on public.cloud_profiles for insert
  to authenticated
  with check (auth.uid() = id);

drop policy if exists "profiles update own" on public.cloud_profiles;
create policy "profiles update own"
  on public.cloud_profiles for update
  to authenticated
  using (auth.uid() = id);

-- friend_requests
drop policy if exists "friend_requests read involved" on public.friend_requests;
create policy "friend_requests read involved"
  on public.friend_requests for select
  to authenticated
  using (auth.uid() = requester_id or auth.uid() = addressee_id);

drop policy if exists "friend_requests insert self" on public.friend_requests;
create policy "friend_requests insert self"
  on public.friend_requests for insert
  to authenticated
  with check (auth.uid() = requester_id);

drop policy if exists "friend_requests update addressee" on public.friend_requests;
create policy "friend_requests update addressee"
  on public.friend_requests for update
  to authenticated
  using (auth.uid() = addressee_id or auth.uid() = requester_id);

-- watch_party_rooms
drop policy if exists "rooms read authenticated" on public.watch_party_rooms;
create policy "rooms read authenticated"
  on public.watch_party_rooms for select
  to authenticated
  using (is_active = true);

drop policy if exists "rooms insert host" on public.watch_party_rooms;
create policy "rooms insert host"
  on public.watch_party_rooms for insert
  to authenticated
  with check (auth.uid() = host_id);

drop policy if exists "rooms update host" on public.watch_party_rooms;
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

-- Realtime: replica identity per postgres_changes
alter table public.watch_party_rooms replica identity full;
alter table public.friend_requests replica identity full;

-- Aggiungi tabelle a Realtime solo se non già presenti
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'watch_party_rooms'
  ) then
    alter publication supabase_realtime add table public.watch_party_rooms;
  end if;
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'friend_requests'
  ) then
    alter publication supabase_realtime add table public.friend_requests;
  end if;
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'user_presence'
  ) then
    alter publication supabase_realtime add table public.user_presence;
  end if;
end $$;

-- Cronologia visione cloud (sync client per analytics dev)
create table if not exists public.cloud_watch_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.cloud_profiles (id) on delete cascade,
  title_name text not null,
  content_type text,
  catalog_prefix text,
  slug text,
  episode_label text,
  seconds_watched double precision not null default 0,
  watched_at timestamptz not null default now()
);

create index if not exists cloud_watch_events_user_watched_idx
  on public.cloud_watch_events (user_id, watched_at desc);

alter table public.cloud_watch_events enable row level security;

drop policy if exists "watch events insert own" on public.cloud_watch_events;
create policy "watch events insert own"
  on public.cloud_watch_events for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "watch events read own" on public.cloud_watch_events;
create policy "watch events read own"
  on public.cloud_watch_events for select
  to authenticated
  using (auth.uid() = user_id);

create or replace function public.is_dev_admin()
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from auth.users u
    where u.id = auth.uid()
      and lower(u.email) = 'yutubecraft1234@gmail.com'
  );
$$;

revoke all on function public.is_dev_admin() from public;
grant execute on function public.is_dev_admin() to authenticated;

create or replace function public.dev_users_overview()
returns json
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if not public.is_dev_admin() then
    raise exception 'Accesso negato';
  end if;

  return coalesce((
    select json_agg(row_to_json(t) order by t.auth_created_at desc nulls last)
    from (
      select
        u.id as user_id,
        u.email,
        u.created_at as auth_created_at,
        u.last_sign_in_at,
        (u.email_confirmed_at is not null) as email_confirmed,
        (p.id is not null) as has_profile,
        p.display_name,
        p.friend_code,
        p.created_at as profile_created_at,
        coalesce(fr.friends_count, 0) as friends_count,
        pr.status as presence_status,
        pr.last_seen_at,
        pr.activity as presence_activity,
        (
          select coalesce(json_agg(f order by f.display_name), '[]'::json)
          from (
            select
              fp.id as friend_id,
              fp.display_name,
              fp.email,
              fp.friend_code
            from public.friend_requests frx
            join public.cloud_profiles fp on fp.id = case
              when frx.requester_id = p.id then frx.addressee_id
              else frx.requester_id
            end
            where frx.status = 'accepted'
              and p.id is not null
              and (frx.requester_id = p.id or frx.addressee_id = p.id)
          ) f
        ) as friends,
        (
          select coalesce(json_agg(e order by e.watched_at desc), '[]'::json)
          from (
            select
              cwe.title_name,
              cwe.content_type,
              cwe.episode_label,
              cwe.seconds_watched,
              cwe.watched_at
            from public.cloud_watch_events cwe
            where cwe.user_id = p.id
            order by cwe.watched_at desc
            limit 50
          ) e
        ) as recent_watches,
        (
          select coalesce(json_agg(top order by top.total_seconds desc), '[]'::json)
          from (
            select
              cwe.title_name,
              sum(cwe.seconds_watched)::double precision as total_seconds,
              count(*)::int as play_count
            from public.cloud_watch_events cwe
            where cwe.user_id = p.id
            group by cwe.title_name
            order by sum(cwe.seconds_watched) desc
            limit 10
          ) top
        ) as top_titles
      from auth.users u
      left join public.cloud_profiles p on p.id = u.id
      left join public.user_presence pr on pr.user_id = p.id
      left join lateral (
        select count(*)::int as friends_count
        from public.friend_requests fr2
        where fr2.status = 'accepted'
          and p.id is not null
          and (fr2.requester_id = p.id or fr2.addressee_id = p.id)
      ) fr on true
    ) t
  ), '[]'::json);
end;
$$;

revoke all on function public.dev_users_overview() from public;
grant execute on function public.dev_users_overview() to authenticated;
