-- Sync "Continua a guardare" tra web app e desktop (account cloud).
-- Esegui SOLO questo file in Supabase → SQL Editor (non tutto schema.sql).

create table if not exists public.cloud_streaming_progress (
  user_id uuid not null references public.cloud_profiles (id) on delete cascade,
  progress_key text not null,
  catalog_prefix text not null default 'sc',
  content_type text not null,
  title_id text not null,
  slug text not null,
  video_id text not null,
  title_name text not null,
  episode_label text,
  poster_url text,
  position_secs double precision not null default 0,
  duration_secs double precision,
  updated_at timestamptz not null default now(),
  primary key (user_id, progress_key)
);

create index if not exists cloud_streaming_progress_user_updated_idx
  on public.cloud_streaming_progress (user_id, updated_at desc);

alter table public.cloud_streaming_progress enable row level security;

drop policy if exists "streaming progress insert own" on public.cloud_streaming_progress;
create policy "streaming progress insert own"
  on public.cloud_streaming_progress for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "streaming progress update own" on public.cloud_streaming_progress;
create policy "streaming progress update own"
  on public.cloud_streaming_progress for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "streaming progress read own" on public.cloud_streaming_progress;
create policy "streaming progress read own"
  on public.cloud_streaming_progress for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "streaming progress delete own" on public.cloud_streaming_progress;
create policy "streaming progress delete own"
  on public.cloud_streaming_progress for delete
  to authenticated
  using (auth.uid() = user_id);
