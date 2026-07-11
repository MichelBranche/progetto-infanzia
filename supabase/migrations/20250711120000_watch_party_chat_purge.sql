-- Applica su Supabase → SQL Editor se compare 404 su purge_inactive_watch_party_chats.

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

revoke all on function public.delete_watch_party_chat(text) from public;
grant execute on function public.delete_watch_party_chat(text) to authenticated;
revoke all on function public.purge_inactive_watch_party_chats() from public;
grant execute on function public.purge_inactive_watch_party_chats() to authenticated;
