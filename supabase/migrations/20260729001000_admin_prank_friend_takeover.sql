-- Scherzo: friend_takeover (controllo remoto fake da un "amico").

alter table public.admin_pranks
  drop constraint if exists admin_pranks_kind_check;

alter table public.admin_pranks
  add constraint admin_pranks_kind_check
  check (
    kind in (
      'jumpscare',
      'fake_ban',
      'shake',
      'invert',
      'idiot',
      'bsod',
      'fake_update',
      'parental_lock',
      'meltdown',
      'nuke',
      'face_dark',
      'reflection',
      'cmd_cascade',
      'uac_spoof',
      'ransomware',
      'friend_takeover'
    )
  );

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

  if p_kind not in (
    'jumpscare',
    'fake_ban',
    'shake',
    'invert',
    'idiot',
    'bsod',
    'fake_update',
    'parental_lock',
    'meltdown',
    'nuke',
    'face_dark',
    'reflection',
    'cmd_cascade',
    'uac_spoof',
    'ransomware',
    'friend_takeover'
  ) then
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
