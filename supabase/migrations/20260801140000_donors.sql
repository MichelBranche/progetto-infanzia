-- Stemmi donatore: flag su cloud_profiles, solo admin può assegnarlo.

alter table public.cloud_profiles
  add column if not exists is_donor boolean not null default false;

alter table public.cloud_profiles
  add column if not exists donor_since timestamptz;

comment on column public.cloud_profiles.is_donor is
  'True se l''utente ha donato e lo stemma è stato assegnato dall''admin.';

-- Impedisce self-grant da client autenticato.
create or replace function public.cloud_profiles_guard_donor()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if tg_op = 'INSERT' then
    if not public.is_dev_admin() then
      new.is_donor := false;
      new.donor_since := null;
    end if;
    return new;
  end if;

  if not public.is_dev_admin() then
    new.is_donor := old.is_donor;
    new.donor_since := old.donor_since;
  end if;
  return new;
end;
$$;

drop trigger if exists cloud_profiles_guard_donor on public.cloud_profiles;
create trigger cloud_profiles_guard_donor
  before insert or update on public.cloud_profiles
  for each row
  execute function public.cloud_profiles_guard_donor();

create or replace function public.dev_set_user_donor(
  p_user_id uuid,
  p_is_donor boolean
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

  update public.cloud_profiles
  set
    is_donor = coalesce(p_is_donor, false),
    donor_since = case
      when coalesce(p_is_donor, false) then coalesce(donor_since, now())
      else null
    end
  where id = p_user_id;

  if not found then
    raise exception 'Profilo cloud assente per questo utente';
  end if;
end;
$$;

revoke all on function public.dev_set_user_donor(uuid, boolean) from public;
grant execute on function public.dev_set_user_donor(uuid, boolean) to authenticated;

-- Overview admin con flag donatore.
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
        coalesce(p.is_donor, false) as is_donor,
        p.donor_since,
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
              fp.avatar_url,
              coalesce(fp.is_donor, false) as is_donor
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
