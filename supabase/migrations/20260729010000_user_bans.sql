-- Ban reale account + ban IP (anti-evasion). Separato dai prank fake_ban.

create or replace function public.ban_is_active(p_active boolean, p_expires_at timestamptz)
returns boolean
language sql
stable
as $$
  select coalesce(p_active, false)
    and (p_expires_at is null or p_expires_at > now());
$$;

create table if not exists public.user_bans (
  user_id uuid primary key references auth.users (id) on delete cascade,
  reason text,
  banned_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  active boolean not null default true
);

create table if not exists public.banned_ips (
  ip inet primary key,
  reason text,
  banned_by uuid references auth.users (id) on delete set null,
  source_user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  active boolean not null default true
);

create table if not exists public.user_ip_sightings (
  user_id uuid not null references auth.users (id) on delete cascade,
  ip inet not null,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  primary key (user_id, ip)
);

create index if not exists user_ip_sightings_ip_idx on public.user_ip_sightings (ip);
create index if not exists banned_ips_active_idx on public.banned_ips (active) where active;
create index if not exists user_bans_active_idx on public.user_bans (active) where active;

alter table public.user_bans enable row level security;
alter table public.banned_ips enable row level security;
alter table public.user_ip_sightings enable row level security;

drop policy if exists user_bans_admin_select on public.user_bans;
create policy user_bans_admin_select on public.user_bans
  for select to authenticated
  using (public.is_dev_admin());

drop policy if exists banned_ips_admin_select on public.banned_ips;
create policy banned_ips_admin_select on public.banned_ips
  for select to authenticated
  using (public.is_dev_admin());

drop policy if exists user_ip_sightings_admin_select on public.user_ip_sightings;
create policy user_ip_sightings_admin_select on public.user_ip_sightings
  for select to authenticated
  using (public.is_dev_admin());

-- Stato ban per l'utente autenticato (fallback senza API IP).
create or replace function public.get_access_block_status()
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  ban public.user_bans%rowtype;
begin
  if auth.uid() is null then
    return jsonb_build_object('blocked', false);
  end if;

  select * into ban
  from public.user_bans ub
  where ub.user_id = auth.uid()
  limit 1;

  if ban.user_id is null or not public.ban_is_active(ban.active, ban.expires_at) then
    return jsonb_build_object('blocked', false);
  end if;

  return jsonb_build_object(
    'blocked', true,
    'kind', 'user',
    'reason', ban.reason,
    'expires_at', ban.expires_at
  );
end;
$$;

revoke all on function public.get_access_block_status() from public;
grant execute on function public.get_access_block_status() to authenticated;

create or replace function public.is_access_blocked()
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select coalesce((public.get_access_block_status() ->> 'blocked')::boolean, false);
$$;

revoke all on function public.is_access_blocked() from public;
grant execute on function public.is_access_blocked() to authenticated;

-- Upsert sighting IP per l'utente corrente.
create or replace function public.record_user_ip(p_ip text)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_ip inet;
begin
  if auth.uid() is null then
    raise exception 'Non autenticato';
  end if;

  begin
    v_ip := p_ip::inet;
  exception when others then
    raise exception 'IP non valido';
  end;

  insert into public.user_ip_sightings (user_id, ip, first_seen_at, last_seen_at)
  values (auth.uid(), v_ip, now(), now())
  on conflict (user_id, ip) do update
    set last_seen_at = now();
end;
$$;

revoke all on function public.record_user_ip(text) from public;
grant execute on function public.record_user_ip(text) to authenticated;

create or replace function public.ban_user(
  p_user_id uuid,
  p_reason text default null,
  p_duration_hours int default null,
  p_ban_ips boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_expires timestamptz;
  v_reason text;
  ip_row record;
  banned_count int := 0;
begin
  if not public.is_dev_admin() then
    raise exception 'Accesso negato';
  end if;

  if p_user_id is null then
    raise exception 'Utente non valido';
  end if;

  if p_user_id = auth.uid() then
    raise exception 'Non puoi bannare il tuo account';
  end if;

  if p_duration_hours is not null and p_duration_hours <= 0 then
    raise exception 'Durata non valida';
  end if;

  v_expires := case
    when p_duration_hours is null then null
    else now() + make_interval(hours => p_duration_hours)
  end;
  v_reason := nullif(trim(coalesce(p_reason, '')), '');

  insert into public.user_bans (user_id, reason, banned_by, created_at, expires_at, active)
  values (p_user_id, v_reason, auth.uid(), now(), v_expires, true)
  on conflict (user_id) do update set
    reason = excluded.reason,
    banned_by = excluded.banned_by,
    created_at = now(),
    expires_at = excluded.expires_at,
    active = true;

  if coalesce(p_ban_ips, true) then
    for ip_row in
      select s.ip
      from public.user_ip_sightings s
      where s.user_id = p_user_id
    loop
      insert into public.banned_ips (
        ip, reason, banned_by, source_user_id, created_at, expires_at, active
      )
      values (
        ip_row.ip,
        coalesce(v_reason, 'Ban account collegato'),
        auth.uid(),
        p_user_id,
        now(),
        v_expires,
        true
      )
      on conflict (ip) do update set
        reason = excluded.reason,
        banned_by = excluded.banned_by,
        source_user_id = excluded.source_user_id,
        created_at = now(),
        expires_at = excluded.expires_at,
        active = true;
      banned_count := banned_count + 1;
    end loop;
  end if;

  return jsonb_build_object(
    'user_id', p_user_id,
    'expires_at', v_expires,
    'ips_banned', banned_count
  );
end;
$$;

revoke all on function public.ban_user(uuid, text, int, boolean) from public;
grant execute on function public.ban_user(uuid, text, int, boolean) to authenticated;

create or replace function public.unban_user(
  p_user_id uuid,
  p_unban_ips boolean default true
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if not public.is_dev_admin() then
    raise exception 'Accesso negato';
  end if;

  if p_user_id is null then
    raise exception 'Utente non valido';
  end if;

  update public.user_bans
  set active = false
  where user_id = p_user_id;

  if coalesce(p_unban_ips, true) then
    update public.banned_ips
    set active = false
    where source_user_id = p_user_id;
  end if;
end;
$$;

revoke all on function public.unban_user(uuid, boolean) from public;
grant execute on function public.unban_user(uuid, boolean) to authenticated;

create or replace function public.ban_ip(
  p_ip text,
  p_reason text default null,
  p_duration_hours int default null
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_ip inet;
  v_expires timestamptz;
  v_reason text;
begin
  if not public.is_dev_admin() then
    raise exception 'Accesso negato';
  end if;

  begin
    v_ip := p_ip::inet;
  exception when others then
    raise exception 'IP non valido';
  end;

  if p_duration_hours is not null and p_duration_hours <= 0 then
    raise exception 'Durata non valida';
  end if;

  v_expires := case
    when p_duration_hours is null then null
    else now() + make_interval(hours => p_duration_hours)
  end;
  v_reason := nullif(trim(coalesce(p_reason, '')), '');

  insert into public.banned_ips (
    ip, reason, banned_by, source_user_id, created_at, expires_at, active
  )
  values (v_ip, v_reason, auth.uid(), null, now(), v_expires, true)
  on conflict (ip) do update set
    reason = excluded.reason,
    banned_by = excluded.banned_by,
    created_at = now(),
    expires_at = excluded.expires_at,
    active = true;
end;
$$;

revoke all on function public.ban_ip(text, text, int) from public;
grant execute on function public.ban_ip(text, text, int) to authenticated;

create or replace function public.unban_ip(p_ip text)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_ip inet;
begin
  if not public.is_dev_admin() then
    raise exception 'Accesso negato';
  end if;

  begin
    v_ip := p_ip::inet;
  exception when others then
    raise exception 'IP non valido';
  end;

  update public.banned_ips
  set active = false
  where ip = v_ip;
end;
$$;

revoke all on function public.unban_ip(text) from public;
grant execute on function public.unban_ip(text) to authenticated;

-- Overview admin con ban + IP noti.
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
          public.ban_is_active(ub.active, ub.expires_at)
        ) as banned,
        case
          when public.ban_is_active(ub.active, ub.expires_at) then ub.reason
          else null
        end as ban_reason,
        case
          when public.ban_is_active(ub.active, ub.expires_at) then ub.expires_at
          else null
        end as ban_expires_at,
        (
          select coalesce(
            json_agg(host(s.ip) order by s.last_seen_at desc),
            '[]'::json
          )
          from public.user_ip_sightings s
          where s.user_id = u.id
        ) as known_ips,
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
      left join public.user_bans ub on ub.user_id = u.id
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
