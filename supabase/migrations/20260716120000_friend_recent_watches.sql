-- Attività recente di un amico per la pagina profilo.
-- Legge il progresso streaming di un altro utente SOLO se è un amico accettato.

drop function if exists public.get_friend_recent_watches(uuid, int);
create function public.get_friend_recent_watches(friend_id uuid, max_rows int default 30)
returns table (
  progress_key text,
  catalog_prefix text,
  content_type text,
  title_id text,
  slug text,
  video_id text,
  title_name text,
  episode_label text,
  poster_url text,
  position_secs double precision,
  duration_secs double precision,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Non autenticato';
  end if;
  if friend_id is null or not public.are_cloud_friends(auth.uid(), friend_id) then
    raise exception 'Non autorizzato';
  end if;
  return query
  select p.progress_key, p.catalog_prefix, p.content_type, p.title_id, p.slug,
         p.video_id, p.title_name, p.episode_label, p.poster_url,
         p.position_secs, p.duration_secs, p.updated_at
  from public.cloud_streaming_progress p
  where p.user_id = friend_id
    and p.position_secs > 5
  order by p.updated_at desc
  limit greatest(1, least(coalesce(max_rows, 30), 100));
end;
$$;

revoke all on function public.get_friend_recent_watches(uuid, int) from public;
grant execute on function public.get_friend_recent_watches(uuid, int) to authenticated;
