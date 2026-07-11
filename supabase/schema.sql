-- Branchefy cloud: account, amici, watch party relay
-- Esegui nel SQL Editor di Supabase (Dashboard → SQL → New query)
-- Sicuro da rieseguire: policy e publication vengono ricreate solo se mancanti.
--
-- IMPORTANTE: non incollare tutto schema.sql in una sola query se il editor
-- segnala errori di sintassi sulle funzioni (righe con "end;").
-- Per aggiornamenti puntuali usa i file in supabase/migrations/.

create extension if not exists "pgcrypto";

-- Profilo pubblico collegato ad auth.users
create table if not exists public.cloud_profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  display_name text not null,
  friend_code text not null unique,
  avatar_url text,
  created_at timestamptz not null default now()
);

alter table public.cloud_profiles add column if not exists avatar_url text;

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
  status text not null default 'online' check (status in ('online', 'away', 'offline', 'dnd', 'invisible')),
  last_seen_at timestamptz not null default now(),
  activity text,
  app_version text,
  platform text,
  updated_at timestamptz not null default now()
);

alter table public.user_presence add column if not exists app_version text;
alter table public.user_presence add column if not exists platform text;

-- Estende gli stati presenza (online, assente, non disturbare, invisibile).
alter table public.user_presence drop constraint if exists user_presence_status_check;
alter table public.user_presence add constraint user_presence_status_check
  check (status in ('online', 'away', 'offline', 'dnd', 'invisible'));

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
drop policy if exists "party members read own" on public.watch_party_members;
create policy "party members read own"
  on public.watch_party_members for select
  to authenticated
  using (user_id = (select auth.uid()));

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

-- Pulizia stanze watch party: elimina stanze chiuse o senza heartbeat
-- dell'host da più di 15 minuti (il client host aggiorna updated_at ~ogni
-- 45 secondi anche in pausa). Così nessuna stanza resta attiva per sempre.
create or replace function public.purge_stale_watch_party_rooms()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.watch_party_rooms
  where is_active = false
     or updated_at < now() - interval '15 minutes';
$$;

revoke all on function public.purge_stale_watch_party_rooms() from public;

-- Pianificazione ogni 10 minuti con pg_cron (Supabase Cron).
-- Se l'estensione non è abilitabile via SQL, attivala da
-- Dashboard > Integrations > Cron: il blocco sotto riproverà alla prossima
-- esecuzione dello schema. Nel frattempo la pulizia lazy nel join copre i casi.
do $$
begin
  begin
    create extension if not exists pg_cron with schema pg_catalog;
  exception when others then
    null;
  end;

  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule(
      'purge-stale-watch-party-rooms',
      '*/10 * * * *',
      'select public.purge_stale_watch_party_rooms();'
    );
  end if;
end $$;

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

  -- Pulizia lazy: rimuove stanze chiuse o abbandonate prima della ricerca.
  perform public.purge_stale_watch_party_rooms();

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

  perform public.ensure_watch_party_chat(v_code);

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

-- ---------------------------------------------------------------------------
-- Chat: messaggi privati, gruppi, stanze watch party
-- ---------------------------------------------------------------------------

create table if not exists public.chat_conversations (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('direct', 'group', 'watch_party')),
  title text,
  watch_party_code text,
  created_by uuid references public.cloud_profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists chat_conversations_watch_party_code_idx
  on public.chat_conversations (watch_party_code)
  where watch_party_code is not null;

create table if not exists public.chat_members (
  conversation_id uuid not null references public.chat_conversations (id) on delete cascade,
  user_id uuid not null references public.cloud_profiles (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

create index if not exists chat_members_user_idx on public.chat_members (user_id);

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.chat_conversations (id) on delete cascade,
  sender_id uuid not null references public.cloud_profiles (id) on delete cascade,
  body text not null check (char_length(trim(body)) between 1 and 2000),
  created_at timestamptz not null default now()
);

create index if not exists chat_messages_conversation_created_idx
  on public.chat_messages (conversation_id, created_at desc);

create table if not exists public.chat_direct_pairs (
  user_a uuid not null references public.cloud_profiles (id) on delete cascade,
  user_b uuid not null references public.cloud_profiles (id) on delete cascade,
  conversation_id uuid not null references public.chat_conversations (id) on delete cascade,
  primary key (user_a, user_b),
  check (user_a < user_b)
);

alter table public.chat_conversations enable row level security;
alter table public.chat_members enable row level security;
alter table public.chat_messages enable row level security;
alter table public.chat_direct_pairs enable row level security;

create or replace function public.are_cloud_friends(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.friend_requests fr
    where fr.status = 'accepted'
      and (
        (fr.requester_id = a and fr.addressee_id = b)
        or (fr.requester_id = b and fr.addressee_id = a)
      )
  );
$$;

create or replace function public.is_chat_member(conv_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.chat_members cm
    where cm.conversation_id = conv_id
      and cm.user_id = (select auth.uid())
  );
$$;

revoke all on function public.are_cloud_friends(uuid, uuid) from public;
grant execute on function public.are_cloud_friends(uuid, uuid) to authenticated;
revoke all on function public.is_chat_member(uuid) from public;
grant execute on function public.is_chat_member(uuid) to authenticated;

drop policy if exists "chat conversations read members" on public.chat_conversations;
create policy "chat conversations read members"
  on public.chat_conversations for select
  to authenticated
  using (public.is_chat_member(id));

drop policy if exists "chat members read own" on public.chat_members;
create policy "chat members read own"
  on public.chat_members for select
  to authenticated
  using (
    user_id = (select auth.uid())
    or public.is_chat_member(conversation_id)
  );

drop policy if exists "chat messages read members" on public.chat_messages;
create policy "chat messages read members"
  on public.chat_messages for select
  to authenticated
  using (public.is_chat_member(conversation_id));

drop policy if exists "chat messages insert own" on public.chat_messages;
create policy "chat messages insert own"
  on public.chat_messages for insert
  to authenticated
  with check (
    sender_id = (select auth.uid())
    and public.is_chat_member(conversation_id)
  );

drop policy if exists "chat direct pairs read involved" on public.chat_direct_pairs;
create policy "chat direct pairs read involved"
  on public.chat_direct_pairs for select
  to authenticated
  using (
    user_a = (select auth.uid())
    or user_b = (select auth.uid())
  );

create or replace function public.open_direct_chat(other_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  a uuid;
  b uuid;
  conv_id uuid;
begin
  if me is null then raise exception 'Non autenticato'; end if;
  if other_user_id = me then raise exception 'Non puoi chattare con te stesso'; end if;
  if not public.are_cloud_friends(me, other_user_id) then
    raise exception 'Solo tra amici accettati';
  end if;
  if me < other_user_id then a := me; b := other_user_id;
  else a := other_user_id; b := me; end if;
  select conversation_id into conv_id from public.chat_direct_pairs where user_a = a and user_b = b;
  if conv_id is not null then return conv_id; end if;
  insert into public.chat_conversations (kind, created_by) values ('direct', me) returning id into conv_id;
  insert into public.chat_direct_pairs (user_a, user_b, conversation_id) values (a, b, conv_id);
  insert into public.chat_members (conversation_id, user_id) values (conv_id, a), (conv_id, b);
  return conv_id;
end;
$$;

create or replace function public.create_group_chat(chat_title text, member_ids uuid[])
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  conv_id uuid;
  member_id uuid;
  unique_members uuid[];
begin
  if me is null then raise exception 'Non autenticato'; end if;
  if trim(coalesce(chat_title, '')) = '' then raise exception 'Titolo gruppo obbligatorio'; end if;
  select coalesce(array_agg(distinct x), array[]::uuid[]) into unique_members
  from unnest(array_append(coalesce(member_ids, array[]::uuid[]), me)) as x;
  if coalesce(array_length(unique_members, 1), 0) < 2 then
    raise exception 'Servono almeno due partecipanti';
  end if;
  foreach member_id in array unique_members loop
    if member_id <> me and not public.are_cloud_friends(me, member_id) then
      raise exception 'Puoi aggiungere solo amici accettati';
    end if;
  end loop;
  insert into public.chat_conversations (kind, title, created_by)
  values ('group', trim(chat_title), me) returning id into conv_id;
  foreach member_id in array unique_members loop
    insert into public.chat_members (conversation_id, user_id) values (conv_id, member_id) on conflict do nothing;
  end loop;
  return conv_id;
end;
$$;

drop function if exists public.ensure_watch_party_chat(text);
create function public.ensure_watch_party_chat(lookup_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  v_code text := upper(trim(lookup_code));
  conv_id uuid;
  room_row public.watch_party_rooms%rowtype;
  member_row record;
begin
  if me is null then raise exception 'Non autenticato'; end if;
  select * into room_row from public.watch_party_rooms where code = v_code and is_active = true limit 1;
  if not found then raise exception 'Stanza non trovata'; end if;
  select id into conv_id from public.chat_conversations where watch_party_code = v_code limit 1;
  if conv_id is null then
    begin
      insert into public.chat_conversations (kind, title, watch_party_code, created_by)
      values ('watch_party', 'Stanza ' || v_code, v_code, room_row.host_id)
      returning id into conv_id;
    exception
      when unique_violation then
        select id into conv_id from public.chat_conversations where watch_party_code = v_code limit 1;
    end;
    if conv_id is null then
      select id into conv_id from public.chat_conversations where watch_party_code = v_code limit 1;
    end if;
  end if;
  if conv_id is null then
    raise exception 'Impossibile aprire la chat della stanza';
  end if;
  insert into public.chat_members (conversation_id, user_id) values (conv_id, room_row.host_id) on conflict do nothing;
  for member_row in
    select m.user_id
    from public.watch_party_members m
    where m.room_code = v_code
  loop
    insert into public.chat_members (conversation_id, user_id) values (conv_id, member_row.user_id) on conflict do nothing;
  end loop;
  insert into public.chat_members (conversation_id, user_id) values (conv_id, me) on conflict do nothing;
  return conv_id;
end;
$$;

create or replace function public.send_chat_message(conv_id uuid, message_body text)
returns public.chat_messages
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  trimmed text := trim(message_body);
  msg_row public.chat_messages;
begin
  if me is null then raise exception 'Non autenticato'; end if;
  if char_length(trimmed) < 1 or char_length(trimmed) > 2000 then
    raise exception 'Messaggio non valido';
  end if;
  if not public.is_chat_member(conv_id) then raise exception 'Non sei in questa conversazione'; end if;
  insert into public.chat_messages (conversation_id, sender_id, body) values (conv_id, me, trimmed) returning * into msg_row;
  update public.chat_conversations set updated_at = now() where id = conv_id;
  return msg_row;
end;
$$;

create or replace function public.purge_inactive_watch_party_chats()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.chat_conversations c
  where c.kind = 'watch_party'
    and c.watch_party_code is not null
    and not exists (
      select 1
      from public.watch_party_rooms r
      where upper(r.code) = c.watch_party_code
    );
end;
$$;

create or replace function public.list_my_chats()
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then raise exception 'Non autenticato'; end if;
  perform public.purge_inactive_watch_party_chats();
  return coalesce((
    select json_agg(row_to_json(t) order by t.updated_at desc)
    from (
      select
        c.id,
        c.kind,
        c.title,
        c.watch_party_code,
        c.updated_at,
        (
          select json_build_object('id', m.id, 'body', m.body, 'sender_id', m.sender_id, 'created_at', m.created_at)
          from public.chat_messages m where m.conversation_id = c.id order by m.created_at desc limit 1
        ) as last_message,
        (select count(*)::int from public.chat_members cm2 where cm2.conversation_id = c.id) as member_count,
        (
          select json_build_object('user_id', p.id, 'display_name', p.display_name, 'avatar_url', p.avatar_url, 'friend_code', p.friend_code)
          from public.chat_direct_pairs dp
          join public.cloud_profiles p on p.id = case when dp.user_a = me then dp.user_b else dp.user_a end
          where dp.conversation_id = c.id limit 1
        ) as direct_peer
      from public.chat_conversations c
      join public.chat_members cm on cm.conversation_id = c.id
      where cm.user_id = me
        and (
          c.kind <> 'watch_party'
          or (
            c.watch_party_code is not null
            and exists (
              select 1
              from public.watch_party_rooms r
              where upper(r.code) = c.watch_party_code
                and r.is_active = true
            )
          )
        )
    ) t
  ), '[]'::json);
end;
$$;

create or replace function public.delete_chat_conversation(conv_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  conv_kind text;
  conv_creator uuid;
begin
  if me is null then raise exception 'Non autenticato'; end if;
  if not public.is_chat_member(conv_id) then raise exception 'Non sei in questa conversazione'; end if;

  select kind, created_by into conv_kind, conv_creator
  from public.chat_conversations
  where id = conv_id;

  if conv_kind is null then return;
  if conv_kind = 'watch_party' then
    raise exception 'La chat della watch party si chiude con la stanza';
  end if;

  if conv_kind = 'direct' then
    delete from public.chat_conversations where id = conv_id;
    return;
  end if;

  if conv_creator = me then
    delete from public.chat_conversations where id = conv_id;
  else
    delete from public.chat_members
    where conversation_id = conv_id and user_id = me;
    if not exists (
      select 1 from public.chat_members where conversation_id = conv_id
    ) then
      delete from public.chat_conversations where id = conv_id;
    end if;
  end if;
  return;
end;
$$;

create or replace function public.delete_watch_party_chat(lookup_code text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text := upper(trim(lookup_code));
begin
  delete from public.chat_conversations
  where kind = 'watch_party' and watch_party_code = v_code;
end;
$$;

revoke all on function public.open_direct_chat(uuid) from public;
grant execute on function public.open_direct_chat(uuid) to authenticated;
revoke all on function public.create_group_chat(text, uuid[]) from public;
grant execute on function public.create_group_chat(text, uuid[]) to authenticated;
revoke all on function public.ensure_watch_party_chat(text) from public;
grant execute on function public.ensure_watch_party_chat(text) to authenticated;
revoke all on function public.send_chat_message(uuid, text) from public;
grant execute on function public.send_chat_message(uuid, text) to authenticated;
revoke all on function public.list_my_chats() from public;
grant execute on function public.list_my_chats() to authenticated;
revoke all on function public.delete_chat_conversation(uuid) from public;
grant execute on function public.delete_chat_conversation(uuid) to authenticated;
revoke all on function public.delete_watch_party_chat(text) from public;
grant execute on function public.delete_watch_party_chat(text) to authenticated;
revoke all on function public.purge_inactive_watch_party_chats() from public;
grant execute on function public.purge_inactive_watch_party_chats() to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'chat_messages'
  ) then
    alter publication supabase_realtime add table public.chat_messages;
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

-- Progresso streaming (continua a guardare) sincronizzato tra web e desktop
create table if not exists public.cloud_streaming_progress (
  user_id uuid not null references public.cloud_profiles (id) on delete cascade,
  progress_key text not null,
  catalog_prefix text not null default 'sc',
  content_type text not null,
  title_id text not null,
  slug text not null,
  video_id text not null,
  title_name text not null,
  episode_label text,
  poster_url text,
  position_secs double precision not null default 0,
  duration_secs double precision,
  updated_at timestamptz not null default now(),
  primary key (user_id, progress_key)
);

create index if not exists cloud_streaming_progress_user_updated_idx
  on public.cloud_streaming_progress (user_id, updated_at desc);

alter table public.cloud_streaming_progress enable row level security;

drop policy if exists "streaming progress upsert own" on public.cloud_streaming_progress;
drop policy if exists "streaming progress insert own" on public.cloud_streaming_progress;
create policy "streaming progress insert own"
  on public.cloud_streaming_progress for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "streaming progress update own" on public.cloud_streaming_progress;
create policy "streaming progress update own"
  on public.cloud_streaming_progress for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "streaming progress read own" on public.cloud_streaming_progress;
create policy "streaming progress read own"
  on public.cloud_streaming_progress for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "streaming progress delete own" on public.cloud_streaming_progress;
create policy "streaming progress delete own"
  on public.cloud_streaming_progress for delete
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
        p.avatar_url,
        p.created_at as profile_created_at,
        coalesce(fr.friends_count, 0) as friends_count,
        pr.status as presence_status,
        pr.last_seen_at,
        pr.activity as presence_activity,
        coalesce(
          pr.app_version,
          (
            select af.app_version
            from public.app_feedback af
            where af.user_id = p.id
              and af.app_version is not null
            order by af.created_at desc
            limit 1
          )
        ) as app_version,
        coalesce(
          pr.platform,
          (
            select af.platform
            from public.app_feedback af
            where af.user_id = p.id
              and af.platform is not null
            order by af.created_at desc
            limit 1
          )
        ) as platform,
        (
          select coalesce(json_agg(f order by f.display_name), '[]'::json)
          from (
            select
              fp.id as friend_id,
              fp.display_name,
              fp.email,
              fp.friend_code,
              fp.avatar_url
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

-- Elimina account cloud (auth + profilo e dati collegati). Solo dev admin.
drop function if exists public.dev_delete_user_account(uuid);
create function public.dev_delete_user_account(target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if not public.is_dev_admin() then
    raise exception 'Accesso negato';
  end if;

  if target_user_id is null then
    raise exception 'Utente non valido';
  end if;

  if target_user_id = auth.uid() then
    raise exception 'Non puoi eliminare il tuo account da qui';
  end if;

  if not exists (select 1 from auth.users u where u.id = target_user_id) then
    raise exception 'Utente non trovato';
  end if;

  delete from auth.users where id = target_user_id;
end;
$$;

revoke all on function public.dev_delete_user_account(uuid) from public;
grant execute on function public.dev_delete_user_account(uuid) to authenticated;

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
--    La policy su watch_party_members NON deve leggere watch_party_rooms (ricorsione RLS).
--
-- ---------------------------------------------------------------------------
-- Avatar profilo locale (app desktop)
-- I profili famiglia (genitore/bambino) salvano la foto JPEG in SQLite locale
-- (library.db → colonna profiles.avatar_image_jpeg, max 1 MB).
-- Non serve configurazione Supabase per questi avatar.
--
-- Avatar account cloud (sync tra dispositivi / visibile agli amici)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('profile-avatars', 'profile-avatars', true, 1048576, array['image/jpeg'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "profile avatars read" on storage.objects;
create policy "profile avatars read"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'profile-avatars');

drop policy if exists "profile avatars insert own" on storage.objects;
create policy "profile avatars insert own"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'profile-avatars'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

drop policy if exists "profile avatars update own" on storage.objects;
create policy "profile avatars update own"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'profile-avatars'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  )
  with check (
    bucket_id = 'profile-avatars'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

drop policy if exists "profile avatars delete own" on storage.objects;
create policy "profile avatars delete own"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'profile-avatars'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );
