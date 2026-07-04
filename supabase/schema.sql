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

-- SELECT: la propria presenza e quella degli amici accettati.
drop policy if exists "presence read authenticated" on public.user_presence;
drop policy if exists "presence read own or friends" on public.user_presence;
create policy "presence read own or friends"
  on public.user_presence for select
  to authenticated
  using (
    (select auth.uid()) = user_id
    or exists (
      select 1
      from public.friend_requests fr
      where fr.status = 'accepted'
        and (
          (fr.requester_id = (select auth.uid()) and fr.addressee_id = user_presence.user_id)
          or (fr.addressee_id = (select auth.uid()) and fr.requester_id = user_presence.user_id)
        )
    )
  );

drop policy if exists "presence insert own" on public.user_presence;
create policy "presence insert own"
  on public.user_presence for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "presence update own" on public.user_presence;
create policy "presence update own"
  on public.user_presence for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

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

-- Membri che hanno effettuato join con il codice stanza (per RLS ristretta).
create table if not exists public.watch_party_members (
  room_code text not null references public.watch_party_rooms (code) on delete cascade,
  user_id uuid not null references public.cloud_profiles (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (room_code, user_id)
);

create index if not exists watch_party_members_user_idx
  on public.watch_party_members (user_id);

alter table public.watch_party_members enable row level security;

drop policy if exists "party members read own or host" on public.watch_party_members;
create policy "party members read own or host"
  on public.watch_party_members for select
  to authenticated
  using (
    user_id = (select auth.uid())
    or exists (
      select 1
      from public.watch_party_rooms r
      where r.code = room_code
        and r.host_id = (select auth.uid())
    )
  );

alter table public.cloud_profiles enable row level security;
alter table public.friend_requests enable row level security;
alter table public.watch_party_rooms enable row level security;

-- cloud_profiles
-- SELECT: propria riga, amici accettati, o chi ti ha inviato una richiesta
-- pendente (per mostrare nome in inbox). Chi invia una richiesta non vede
-- email/codice del destinatario finché non è accettata (usa lookup_friend_by_code).
drop policy if exists "profiles read authenticated" on public.cloud_profiles;
drop policy if exists "profiles read own or connected" on public.cloud_profiles;
create policy "profiles read own or connected"
  on public.cloud_profiles for select
  to authenticated
  using (
    (select auth.uid()) = id
    or exists (
      select 1
      from public.friend_requests fr
      where fr.status = 'accepted'
        and (
          (fr.requester_id = (select auth.uid()) and fr.addressee_id = cloud_profiles.id)
          or (fr.addressee_id = (select auth.uid()) and fr.requester_id = cloud_profiles.id)
        )
    )
    or exists (
      select 1
      from public.friend_requests fr
      where fr.status = 'pending'
        and fr.addressee_id = (select auth.uid())
        and fr.requester_id = cloud_profiles.id
    )
  );

drop policy if exists "profiles insert own" on public.cloud_profiles;
create policy "profiles insert own"
  on public.cloud_profiles for insert
  to authenticated
  with check (auth.uid() = id);

drop policy if exists "profiles update own" on public.cloud_profiles;
create policy "profiles update own"
  on public.cloud_profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

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
drop policy if exists "friend_requests update addressee only" on public.friend_requests;
create policy "friend_requests update addressee only"
  on public.friend_requests for update
  to authenticated
  using (auth.uid() = addressee_id)
  with check (auth.uid() = addressee_id);

-- Il richiedente annulla con DELETE, non UPDATE.
-- Solo la colonna status è modificabile: impedisce di riassegnare
-- requester_id/addressee_id e creare amicizie fittizie.
revoke update on table public.friend_requests from authenticated;
grant update (status) on table public.friend_requests to authenticated;

-- DELETE: le parti coinvolte possono rimuovere l'amicizia / la richiesta.
drop policy if exists "friend_requests delete involved" on public.friend_requests;
create policy "friend_requests delete involved"
  on public.friend_requests for delete
  to authenticated
  using (auth.uid() = addressee_id or auth.uid() = requester_id);

-- watch_party_rooms
-- SELECT: solo host o membri che hanno fatto join con il codice.
-- L'ingresso ospite passa da join_watch_party_room (registra membership).
drop policy if exists "rooms read authenticated" on public.watch_party_rooms;
drop policy if exists "rooms read host or member" on public.watch_party_rooms;
create policy "rooms read host or member"
  on public.watch_party_rooms for select
  to authenticated
  using (
    auth.uid() = host_id
    or (
      is_active = true
      and exists (
        select 1
        from public.watch_party_members m
        where m.room_code = watch_party_rooms.code
          and m.user_id = (select auth.uid())
      )
    )
  );

drop policy if exists "rooms insert host" on public.watch_party_rooms;
create policy "rooms insert host"
  on public.watch_party_rooms for insert
  to authenticated
  with check (auth.uid() = host_id);

drop policy if exists "rooms update host" on public.watch_party_rooms;
create policy "rooms update host"
  on public.watch_party_rooms for update
  to authenticated
  using (auth.uid() = host_id)
  with check (auth.uid() = host_id);

drop policy if exists "rooms delete host" on public.watch_party_rooms;
create policy "rooms delete host"
  on public.watch_party_rooms for delete
  to authenticated
  using (auth.uid() = host_id);

-- Join stanza cloud: registra membership e restituisce la stanza attiva.
drop function if exists public.join_watch_party_room(text);
create function public.join_watch_party_room(lookup_code text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text := upper(trim(lookup_code));
  v_room public.watch_party_rooms%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Non autenticato';
  end if;

  select * into v_room
  from public.watch_party_rooms
  where code = v_code
    and is_active = true
  limit 1;

  if not found then
    return null;
  end if;

  insert into public.watch_party_members (room_code, user_id)
  values (v_code, auth.uid())
  on conflict do nothing;

  return row_to_json(v_room);
end;
$$;

revoke all on function public.join_watch_party_room(text) from public;
grant execute on function public.join_watch_party_room(text) to authenticated;

-- Rimosso: lookup per email.
-- registrata (enumerazione). La ricerca amici usa solo il codice amico.
drop function if exists public.lookup_friend_by_email(text);

-- Ricerca amico per codice: security definer per scavalcare la RLS in modo
-- controllato — espone solo user_id e display_name a fronte del codice esatto.
drop function if exists public.lookup_friend_by_code(text);
create function public.lookup_friend_by_code(lookup_code text)
returns table (user_id uuid, display_name text)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Non autenticato';
  end if;
  return query
  select p.id, p.display_name
  from public.cloud_profiles p
  where upper(p.friend_code) = upper(trim(lookup_code))
    and p.id <> auth.uid()
  limit 1;
end;
$$;

revoke all on function public.lookup_friend_by_code(text) from public;
grant execute on function public.lookup_friend_by_code(text) to authenticated;

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

-- Feedback utenti: bug, suggerimenti, richieste funzioni e titoli
create table if not exists public.app_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.cloud_profiles (id) on delete set null,
  profile_name text not null,
  profile_role text not null,
  feedback_type text not null check (
    feedback_type in ('bug', 'feedback', 'feature', 'title')
  ),
  subject text,
  message text not null,
  context_json jsonb,
  app_version text,
  platform text,
  created_at timestamptz not null default now()
);

create index if not exists app_feedback_created_idx
  on public.app_feedback (created_at desc);

create index if not exists app_feedback_type_idx
  on public.app_feedback (feedback_type, created_at desc);

alter table public.app_feedback enable row level security;

drop policy if exists "feedback insert authenticated" on public.app_feedback;
drop policy if exists "feedback insert own" on public.app_feedback;
create policy "feedback insert own"
  on public.app_feedback for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "feedback read dev admin" on public.app_feedback;
create policy "feedback read dev admin"
  on public.app_feedback for select
  to authenticated
  using (public.is_dev_admin());

-- Stato gestione feedback (dev console)
alter table public.app_feedback
  add column if not exists status text not null default 'open';

alter table public.app_feedback
  add column if not exists resolved_at timestamptz;

alter table public.app_feedback
  add column if not exists deleted_at timestamptz;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'app_feedback_status_check'
  ) then
    alter table public.app_feedback
      add constraint app_feedback_status_check
      check (status in ('open', 'resolved'));
  end if;
end $$;

create index if not exists app_feedback_status_idx
  on public.app_feedback (status, created_at desc);

create index if not exists app_feedback_deleted_idx
  on public.app_feedback (deleted_at desc)
  where deleted_at is not null;

drop policy if exists "feedback update dev admin" on public.app_feedback;
create policy "feedback update dev admin"
  on public.app_feedback for update
  to authenticated
  using (public.is_dev_admin())
  with check (public.is_dev_admin());

drop policy if exists "feedback delete dev admin" on public.app_feedback;
create policy "feedback delete dev admin"
  on public.app_feedback for delete
  to authenticated
  using (public.is_dev_admin());

create or replace function public.dev_feedback_purge_trash()
returns integer
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  removed integer;
begin
  if not public.is_dev_admin() then
    raise exception 'Accesso negato';
  end if;

  delete from public.app_feedback
  where deleted_at is not null
    and deleted_at < now() - interval '30 days';

  get diagnostics removed = row_count;
  return removed;
end;
$$;

revoke all on function public.dev_feedback_purge_trash() from public;
grant execute on function public.dev_feedback_purge_trash() to authenticated;

-- ---------------------------------------------------------------------------
-- Verifica post-migrazione (esegui come utente autenticato via API o SQL Editor)
-- ---------------------------------------------------------------------------
-- 1) RLS attiva su tutte le tabelle public:
--    select tablename, rowsecurity from pg_tables where schemaname = 'public';
--
-- 2) cloud_profiles: GET senza filtro id deve restituire solo la propria riga
--    (più eventuali amici / richieste in entrata), mai l'intera user base.
--
-- 3) friend_requests: il requester NON può fare UPDATE status = 'accepted'.
--
-- 4) watch_party_rooms: GET senza codice non deve elencare stanze altrui.
--    join_watch_party_room('CODICE') registra membership e abilita SELECT/Realtime.
