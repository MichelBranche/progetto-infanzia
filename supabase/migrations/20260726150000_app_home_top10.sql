-- Config Top 10 home (singleton) + lettura pubblica + aggregato Branchefy.

create table if not exists public.app_home_top10 (
  id integer primary key default 1 check (id = 1),
  mode text not null default 'sc' check (mode in ('sc', 'branchefy', 'manual')),
  items jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

insert into public.app_home_top10 (id, mode, items)
values (1, 'sc', '[]'::jsonb)
on conflict (id) do nothing;

alter table public.app_home_top10 enable row level security;

drop policy if exists "home top10 read dev admin" on public.app_home_top10;
create policy "home top10 read dev admin"
  on public.app_home_top10 for select
  to authenticated
  using (public.is_dev_admin());

drop policy if exists "home top10 insert dev admin" on public.app_home_top10;
create policy "home top10 insert dev admin"
  on public.app_home_top10 for insert
  to authenticated
  with check (public.is_dev_admin());

drop policy if exists "home top10 update dev admin" on public.app_home_top10;
create policy "home top10 update dev admin"
  on public.app_home_top10 for update
  to authenticated
  using (public.is_dev_admin())
  with check (public.is_dev_admin());

-- Enrich watch events for future analytics (optional columns).
alter table public.cloud_watch_events
  add column if not exists title_id text;
alter table public.cloud_watch_events
  add column if not exists poster_url text;

-- Lettura pubblica della config Top 10 (risolve anche mode branchefy).
create or replace function public.get_home_top10()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  cfg public.app_home_top10%rowtype;
  resolved jsonb := '[]'::jsonb;
begin
  select * into cfg from public.app_home_top10 where id = 1;
  if not found then
    return jsonb_build_object('mode', 'sc', 'items', '[]'::jsonb, 'updated_at', null);
  end if;

  if cfg.mode = 'manual' then
    resolved := coalesce(cfg.items, '[]'::jsonb);
  elsif cfg.mode = 'branchefy' then
    select coalesce(jsonb_agg(row_to_json(t)::jsonb), '[]'::jsonb)
    into resolved
    from (
      select
        p.title_id as id,
        p.content_type as type,
        max(p.title_name) as name,
        max(p.poster_url) as poster,
        p.catalog_prefix as "catalogPrefix",
        p.slug,
        sum(p.position_secs)::float8 as "_score",
        count(distinct p.user_id)::int as "_viewers"
      from public.cloud_streaming_progress p
      where p.title_id is not null
        and length(trim(p.title_id)) > 0
      group by p.title_id, p.content_type, p.catalog_prefix, p.slug
      order by count(distinct p.user_id) desc, sum(p.position_secs) desc
      limit 10
    ) t;
  else
    resolved := '[]'::jsonb;
  end if;

  return jsonb_build_object(
    'mode', cfg.mode,
    'items', coalesce(resolved, '[]'::jsonb),
    'updated_at', cfg.updated_at
  );
end;
$$;

revoke all on function public.get_home_top10() from public;
grant execute on function public.get_home_top10() to anon, authenticated;

-- Preview aggregato Branchefy (solo admin, per UI Dev).
create or replace function public.dev_branchefy_top10_preview()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth
as $$
begin
  if not public.is_dev_admin() then
    raise exception 'Accesso negato';
  end if;

  return coalesce((
    select jsonb_agg(row_to_json(t)::jsonb)
    from (
      select
        p.title_id as id,
        p.content_type as type,
        max(p.title_name) as name,
        max(p.poster_url) as poster,
        p.catalog_prefix as "catalogPrefix",
        p.slug,
        sum(p.position_secs)::float8 as total_seconds,
        count(distinct p.user_id)::int as viewers
      from public.cloud_streaming_progress p
      where p.title_id is not null
        and length(trim(p.title_id)) > 0
      group by p.title_id, p.content_type, p.catalog_prefix, p.slug
      order by count(distinct p.user_id) desc, sum(p.position_secs) desc
      limit 10
    ) t
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.dev_branchefy_top10_preview() from public;
grant execute on function public.dev_branchefy_top10_preview() to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'app_home_top10'
  ) then
    alter publication supabase_realtime add table public.app_home_top10;
  end if;
end $$;
