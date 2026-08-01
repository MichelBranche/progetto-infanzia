-- Segnalazioni "Ho donato" → coda admin → stemma.

create table if not exists public.donor_claims (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.cloud_profiles (id) on delete cascade,
  note text,
  paypal_name text,
  amount_eur numeric(10, 2),
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  admin_note text,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references public.cloud_profiles (id) on delete set null
);

create index if not exists donor_claims_status_idx
  on public.donor_claims (status, created_at desc);

create index if not exists donor_claims_user_idx
  on public.donor_claims (user_id, created_at desc);

create unique index if not exists donor_claims_one_pending_per_user
  on public.donor_claims (user_id)
  where status = 'pending';

alter table public.donor_claims enable row level security;

drop policy if exists donor_claims_insert_own on public.donor_claims;
create policy donor_claims_insert_own on public.donor_claims
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists donor_claims_select_own on public.donor_claims;
create policy donor_claims_select_own on public.donor_claims
  for select to authenticated
  using (
    (select auth.uid()) = user_id
    or public.is_dev_admin()
  );

drop policy if exists donor_claims_admin_update on public.donor_claims;
create policy donor_claims_admin_update on public.donor_claims
  for update to authenticated
  using (public.is_dev_admin())
  with check (public.is_dev_admin());

grant select, insert on public.donor_claims to authenticated;
grant update on public.donor_claims to authenticated;

create or replace function public.submit_donor_claim(
  p_note text default null,
  p_paypal_name text default null,
  p_amount_eur numeric default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  me uuid := auth.uid();
  claim_id uuid;
begin
  if me is null then
    raise exception 'Non autenticato';
  end if;

  if not exists (select 1 from public.cloud_profiles p where p.id = me) then
    raise exception 'Profilo cloud assente';
  end if;

  if exists (
    select 1 from public.cloud_profiles p where p.id = me and p.is_donor
  ) then
    raise exception 'Hai già lo stemma donatore';
  end if;

  if exists (
    select 1 from public.donor_claims c
    where c.user_id = me and c.status = 'pending'
  ) then
    raise exception 'Hai già una segnalazione in attesa di verifica';
  end if;

  if p_amount_eur is not null and p_amount_eur <= 0 then
    raise exception 'Importo non valido';
  end if;

  insert into public.donor_claims (
    user_id, note, paypal_name, amount_eur, status, created_at
  )
  values (
    me,
    nullif(trim(coalesce(p_note, '')), ''),
    nullif(trim(coalesce(p_paypal_name, '')), ''),
    p_amount_eur,
    'pending',
    now()
  )
  returning id into claim_id;

  return jsonb_build_object('id', claim_id, 'status', 'pending');
end;
$$;

revoke all on function public.submit_donor_claim(text, text, numeric) from public;
grant execute on function public.submit_donor_claim(text, text, numeric) to authenticated;

create or replace function public.dev_list_donor_claims(
  p_status text default null
)
returns json
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if not public.is_dev_admin() then
    raise exception 'Accesso negato';
  end if;

  if p_status is not null
     and p_status not in ('pending', 'approved', 'rejected') then
    raise exception 'Stato non valido';
  end if;

  return coalesce((
    select json_agg(row_to_json(t) order by t.created_at desc)
    from (
      select
        c.id,
        c.user_id,
        c.note,
        c.paypal_name,
        c.amount_eur,
        c.status,
        c.admin_note,
        c.created_at,
        c.reviewed_at,
        c.reviewed_by,
        p.email,
        p.display_name,
        p.friend_code,
        p.avatar_url,
        coalesce(p.is_donor, false) as is_donor
      from public.donor_claims c
      join public.cloud_profiles p on p.id = c.user_id
      where p_status is null or c.status = p_status
    ) t
  ), '[]'::json);
end;
$$;

revoke all on function public.dev_list_donor_claims(text) from public;
grant execute on function public.dev_list_donor_claims(text) to authenticated;

create or replace function public.dev_review_donor_claim(
  p_claim_id uuid,
  p_approve boolean,
  p_admin_note text default null
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  claim_row public.donor_claims%rowtype;
begin
  if not public.is_dev_admin() then
    raise exception 'Accesso negato';
  end if;

  if p_claim_id is null then
    raise exception 'Segnalazione non valida';
  end if;

  select * into claim_row
  from public.donor_claims
  where id = p_claim_id
  for update;

  if not found then
    raise exception 'Segnalazione non trovata';
  end if;

  if claim_row.status <> 'pending' then
    raise exception 'Segnalazione già gestita';
  end if;

  update public.donor_claims
  set
    status = case when p_approve then 'approved' else 'rejected' end,
    admin_note = nullif(trim(coalesce(p_admin_note, '')), ''),
    reviewed_at = now(),
    reviewed_by = auth.uid()
  where id = p_claim_id;

  if p_approve then
    perform public.dev_set_user_donor(claim_row.user_id, true);
  end if;
end;
$$;

revoke all on function public.dev_review_donor_claim(uuid, boolean, text) from public;
grant execute on function public.dev_review_donor_claim(uuid, boolean, text) to authenticated;
