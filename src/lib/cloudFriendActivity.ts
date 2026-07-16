import { isCloudEnabled } from "./cloudConfig";
import { getSupabase } from "./supabaseClient";
import type { StreamingContinueItem } from "../types/stremio";

interface FriendWatchRow {
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

function mapRow(row: FriendWatchRow): StreamingContinueItem {
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

/**
 * Titoli visti di recente da un amico (solo amici accettati, via RPC Supabase
 * `get_friend_recent_watches` che verifica l'amicizia lato server).
 */
export async function fetchFriendRecentWatches(
  friendUserId: string,
  limit = 30,
): Promise<StreamingContinueItem[]> {
  if (!isCloudEnabled() || !friendUserId) return [];
  const supabase = getSupabase();
  if (!supabase) return [];

  const { data, error } = await supabase.rpc("get_friend_recent_watches", {
    friend_id: friendUserId,
    max_rows: limit,
  });

  if (error) {
    console.warn("[cloudFriendActivity] fetch failed:", error.message);
    return [];
  }

  return (data as FriendWatchRow[] | null)?.map(mapRow) ?? [];
}
