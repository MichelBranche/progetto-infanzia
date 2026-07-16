-- Avvisi globali in-app (broadcast) — tabella mancante sul DB deployato.
-- Idempotente e auto-consistente: include is_dev_admin (dipendenza delle policy).

-- Dipendenza: solo l'admin dev può gestire i broadcast.
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

create table if not exists public.app_broadcasts (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  message_type text not null default 'info' check (
    message_type in ('info', 'warning', 'maintenance', 'essential')
  ),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  dismissible boolean not null default true,
  enabled boolean not null default true,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

create index if not exists app_broadcasts_active_idx
  on public.app_broadcasts (enabled, starts_at, ends_at desc);

alter table public.app_broadcasts enable row level security;

drop policy if exists "broadcasts read dev admin" on public.app_broadcasts;
create policy "broadcasts read dev admin"
  on public.app_broadcasts for select
  to authenticated
  using (public.is_dev_admin());

drop policy if exists "broadcasts insert dev admin" on public.app_broadcasts;
create policy "broadcasts insert dev admin"
  on public.app_broadcasts for insert
  to authenticated
  with check (public.is_dev_admin());

drop policy if exists "broadcasts update dev admin" on public.app_broadcasts;
create policy "broadcasts update dev admin"
  on public.app_broadcasts for update
  to authenticated
  using (public.is_dev_admin())
  with check (public.is_dev_admin());

drop policy if exists "broadcasts delete dev admin" on public.app_broadcasts;
create policy "broadcasts delete dev admin"
  on public.app_broadcasts for delete
  to authenticated
  using (public.is_dev_admin());

-- Avviso attivo per tutti gli utenti (anche anon): security definer bypassa la RLS
-- restituendo solo il broadcast attualmente attivo, mai l'intera tabella.
create or replace function public.get_active_app_broadcast()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select to_jsonb(row)
  from (
    select
      b.id,
      b.title,
      b.body,
      b.message_type,
      b.starts_at,
      b.ends_at,
      b.dismissible,
      b.enabled,
      b.created_at,
      b.updated_at
    from public.app_broadcasts b
    where b.enabled = true
      and b.starts_at <= now()
      and b.ends_at > now()
    order by
      case b.message_type
        when 'essential' then 0
        when 'maintenance' then 1
        when 'warning' then 2
        else 3
      end,
      b.starts_at desc
    limit 1
  ) row;
$$;

revoke all on function public.get_active_app_broadcast() from public;
grant execute on function public.get_active_app_broadcast() to anon, authenticated;

-- Realtime: aggiorna gli avvisi in tempo reale senza refresh.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'app_broadcasts'
  ) then
    alter publication supabase_realtime add table public.app_broadcasts;
  end if;
end $$;

-- Forza PostgREST a ricaricare lo schema (risolve "schema cache" immediato).
notify pgrst, 'reload schema';
