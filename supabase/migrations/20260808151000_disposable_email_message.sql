-- Messaggio signup per email temporanee (aggiorna l'hook già presente).

create or replace function public.hook_prevent_disposable_email(event jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  email text;
begin
  email := lower(trim(coalesce(event->'user'->>'email', '')));
  if email = '' then
    return '{}'::jsonb;
  end if;
  if public.is_disposable_email(email) then
    return jsonb_build_object(
      'error', jsonb_build_object(
        'http_code', 403,
        'message', 'L''uso di email temporanee non è tollerato, bro non sei furbo.'
      )
    );
  end if;
  return '{}'::jsonb;
end;
$$;

revoke all on function public.hook_prevent_disposable_email(jsonb) from public;
grant execute
  on function public.hook_prevent_disposable_email(jsonb)
  to supabase_auth_admin, postgres, service_role;
