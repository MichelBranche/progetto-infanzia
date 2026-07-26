-- Scherzi admin → utente (realtime). Solo is_dev_admin può inviare.

create table if not exists public.admin_pranks (
  id uuid primary key default gen_random_uuid(),
  target_user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (
    kind in ('jumpscare', 'fake_ban', 'shake', 'invert', 'idiot')
  ),
  message text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '3 minutes'),
  consumed_at timestamptz
);

create index if not exists admin_pranks_target_pending_idx
  on public.admin_pranks (target_user_id, created_at desc)
  where consumed_at is null;

alter table public.admin_pranks enable row level security;

drop policy if exists "admin pranks read own or admin" on public.admin_pranks;
create policy "admin pranks read own or admin"
  on public.admin_pranks for select
  to authenticated
  using (
    public.is_dev_admin()
    or target_user_id = (select auth.uid())
  );

drop policy if exists "admin pranks insert admin" on public.admin_pranks;
create policy "admin pranks insert admin"
  on public.admin_pranks for insert
  to authenticated
  with check (public.is_dev_admin());

drop policy if exists "admin pranks update own or admin" on public.admin_pranks;
create policy "admin pranks update own or admin"
  on public.admin_pranks for update
  to authenticated
  using (
    public.is_dev_admin()
    or target_user_id = (select auth.uid())
  )
  with check (
    public.is_dev_admin()
    or target_user_id = (select auth.uid())
  );

drop policy if exists "admin pranks delete admin" on public.admin_pranks;
create policy "admin pranks delete admin"
  on public.admin_pranks for delete
  to authenticated
  using (public.is_dev_admin());

grant select, insert, update, delete on public.admin_pranks to authenticated;

create or replace function public.send_admin_prank(
  p_target_user_id uuid,
  p_kind text,
  p_message text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  row_out public.admin_pranks%rowtype;
begin
  if not public.is_dev_admin() then
    raise exception 'Accesso negato';
  end if;

  if p_kind not in ('jumpscare', 'fake_ban', 'shake', 'invert', 'idiot') then
    raise exception 'Tipo scherzo non valido';
  end if;

  if p_target_user_id is null then
    raise exception 'Utente target mancante';
  end if;

  insert into public.admin_pranks (target_user_id, kind, message, created_by)
  values (
    p_target_user_id,
    p_kind,
    nullif(trim(coalesce(p_message, '')), ''),
    auth.uid()
  )
  returning * into row_out;

  return jsonb_build_object(
    'id', row_out.id,
    'target_user_id', row_out.target_user_id,
    'kind', row_out.kind,
    'message', row_out.message,
    'created_at', row_out.created_at,
    'expires_at', row_out.expires_at
  );
end;
$$;

revoke all on function public.send_admin_prank(uuid, text, text) from public;
grant execute on function public.send_admin_prank(uuid, text, text) to authenticated;

create or replace function public.ack_admin_prank(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.admin_pranks
  set consumed_at = now()
  where id = p_id
    and consumed_at is null
    and (
      target_user_id = auth.uid()
      or public.is_dev_admin()
    );
end;
$$;

revoke all on function public.ack_admin_prank(uuid) from public;
grant execute on function public.ack_admin_prank(uuid) to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'admin_pranks'
  ) then
    alter publication supabase_realtime add table public.admin_pranks;
  end if;
end $$;
