import { isCloudEnabled } from "./cloudConfig";
import {
  continueItemKey,
  continueItemToInput,
  mergeStreamingContinue,
} from "./streamingProgressKey";
import { getSupabase } from "./supabaseClient";
import { runtimeInvoke as invoke, usesBackendApi } from "./runtimeInvoke";
import type {
  StreamingContinueItem,
  StreamingWatchProgressInput,
} from "../types/stremio";
import { listDevStreamingWatchHistory } from "./streamingDevStore";

const CLOUD_PROGRESS_TABLE = "cloud_streaming_progress";

interface CloudProgressRow {
  progress_key: string;
  catalog_prefix: string;
  content_type: string;
  title_id: string;
  slug: string;
  video_id: string;
  title_name: string;
  episode_label: string | null;
  poster_url: string | null;
  position_secs: number;
  duration_secs: number | null;
  updated_at: string;
}

function mapCloudRow(row: CloudProgressRow): StreamingContinueItem {
  return {
    catalogPrefix: row.catalog_prefix,
    contentType: row.content_type,
    titleId: row.title_id,
    slug: row.slug,
    videoId: row.video_id,
    titleName: row.title_name,
    episodeLabel: row.episode_label ?? undefined,
    poster: row.poster_url ?? undefined,
    positionSecs: row.position_secs,
    durationSecs: row.duration_secs ?? undefined,
    updatedAt: row.updated_at,
  };
}

function inputToCloudRow(
  userId: string,
  input: StreamingWatchProgressInput,
): Record<string, unknown> {
  const progressKey = continueItemKey({
    catalogPrefix: input.catalogPrefix,
    contentType: input.contentType,
    titleId: input.titleId,
    slug: input.slug,
    videoId: input.videoId,
    titleName: input.titleName,
    positionSecs: input.positionSecs,
    updatedAt: new Date().toISOString(),
  });

  return {
    user_id: userId,
    progress_key: progressKey,
    catalog_prefix: input.catalogPrefix,
    content_type: input.contentType,
    title_id: input.titleId,
    slug: input.slug,
    video_id: input.videoId,
    title_name: input.titleName,
    episode_label: input.episodeLabel ?? null,
    poster_url: input.poster ?? null,
    position_secs: input.positionSecs,
    duration_secs: input.durationSecs ?? null,
    updated_at: new Date().toISOString(),
  };
}

async function getCloudUserId(): Promise<string | null> {
  if (!isCloudEnabled()) return null;
  const supabase = getSupabase();
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.user?.id ?? null;
}

export async function upsertCloudStreamingProgress(
  input: StreamingWatchProgressInput,
): Promise<void> {
  if (input.positionSecs < 5) return;

  const userId = await getCloudUserId();
  if (!userId) return;

  const supabase = getSupabase();
  if (!supabase) return;

  const { error } = await supabase.from(CLOUD_PROGRESS_TABLE).upsert(
    inputToCloudRow(userId, input),
    { onConflict: "user_id,progress_key" },
  );

  if (error && !error.message.includes(CLOUD_PROGRESS_TABLE)) {
    console.warn("[cloudStreamingProgress] upsert failed:", error.message);
  }
}

export async function fetchCloudStreamingContinue(
  limit = 40,
): Promise<StreamingContinueItem[]> {
  const userId = await getCloudUserId();
  if (!userId) return [];

  const supabase = getSupabase();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from(CLOUD_PROGRESS_TABLE)
    .select("*")
    .eq("user_id", userId)
    .gt("position_secs", 5)
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (error) {
    if (!error.message.includes(CLOUD_PROGRESS_TABLE)) {
      console.warn("[cloudStreamingProgress] fetch failed:", error.message);
    }
    return [];
  }

  return (data as CloudProgressRow[] | null)?.map(mapCloudRow) ?? [];
}

async function upsertLocalStreamingProgress(
  profileId: string,
  input: StreamingWatchProgressInput,
): Promise<void> {
  if (usesBackendApi()) {
    await invoke("update_streaming_watch_progress_cmd", { profileId, input });
    return;
  }
  const { saveDevStreamingWatchProgress } = await import("./streamingDevStore");
  saveDevStreamingWatchProgress(profileId, input);
}

async function listLocalStreamingHistory(
  profileId: string,
  limit: number,
): Promise<StreamingContinueItem[]> {
  if (!usesBackendApi()) {
    return listDevStreamingWatchHistory(profileId, limit);
  }
  return invoke<StreamingContinueItem[]>("get_streaming_watch_history_cmd", {
    profileId,
    limit,
  });
}

export async function syncStreamingProgressWithCloud(
  profileId: string,
): Promise<void> {
  const userId = await getCloudUserId();
  if (!userId) return;

  const [localItems, cloudItems] = await Promise.all([
    listLocalStreamingHistory(profileId, 200),
    fetchCloudStreamingContinue(200),
  ]);

  const localByKey = new Map(
    localItems.map((item) => [continueItemKey(item), item]),
  );
  const cloudByKey = new Map(
    cloudItems.map((item) => [continueItemKey(item), item]),
  );

  const tasks: Promise<void>[] = [];

  for (const [key, cloud] of cloudByKey) {
    const local = localByKey.get(key);
    if (
      !local ||
      Date.parse(cloud.updatedAt) > Date.parse(local.updatedAt)
    ) {
      tasks.push(upsertLocalStreamingProgress(profileId, continueItemToInput(cloud)));
    }
  }

  for (const [key, local] of localByKey) {
    const cloud = cloudByKey.get(key);
    if (
      !cloud ||
      Date.parse(local.updatedAt) > Date.parse(cloud.updatedAt)
    ) {
      tasks.push(upsertCloudStreamingProgress(continueItemToInput(local)));
    }
  }

  await Promise.all(tasks);
}

export async function getMergedStreamingContinue(
  profileId: string,
  limit = 20,
): Promise<StreamingContinueItem[]> {
  const local = await invoke<StreamingContinueItem[]>(
    "get_streaming_continue_cmd",
    { profileId, limit: limit * 4 },
  ).catch(async () => {
    if (!usesBackendApi()) {
      return listDevStreamingWatchHistory(profileId, limit * 4);
    }
    return [];
  });

  const cloud = await fetchCloudStreamingContinue(limit * 4);
  if (cloud.length === 0) return local.slice(0, limit);
  return mergeStreamingContinue(local, cloud, limit);
}
