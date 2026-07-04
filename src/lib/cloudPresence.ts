import { getSupabase } from "./supabaseClient";
import type { FriendPresence } from "../types/cloud";
import { fetchAppVersion } from "./appUpdater";
import { detectPlatform } from "./feedbackApi";

export const PRESENCE_ONLINE_MS = 90_000;

let cachedAppVersion: string | null = null;

async function resolveAppVersion(): Promise<string> {
  if (cachedAppVersion) return cachedAppVersion;
  try {
    cachedAppVersion = await fetchAppVersion();
  } catch {
    cachedAppVersion = "unknown";
  }
  return cachedAppVersion;
}

export function isPresenceOnline(lastSeenAt: string | undefined): boolean {
  if (!lastSeenAt) return false;
  const ts = Date.parse(lastSeenAt);
  if (Number.isNaN(ts)) return false;
  return Date.now() - ts < PRESENCE_ONLINE_MS;
}

export async function upsertMyPresence(activity?: string): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) return;

  const { data: sessionData } = await supabase.auth.getSession();
  const myId = sessionData.session?.user?.id;
  if (!myId) return;

  const now = new Date().toISOString();
  const status = document.hidden ? "away" : "online";
  const appVersion = await resolveAppVersion();

  const { error } = await supabase.from("user_presence").upsert(
    {
      user_id: myId,
      status,
      last_seen_at: now,
      activity: activity ?? null,
      app_version: appVersion,
      platform: detectPlatform(),
      updated_at: now,
    },
    { onConflict: "user_id" },
  );

  if (error) {
    console.warn("[presence] upsert failed:", error.message);
  }
}

export async function clearMyPresence(): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) return;

  const { data: sessionData } = await supabase.auth.getSession();
  const myId = sessionData.session?.user?.id;
  if (!myId) return;

  const now = new Date().toISOString();
  await supabase.from("user_presence").upsert(
    {
      user_id: myId,
      status: "offline",
      last_seen_at: now,
      activity: null,
      updated_at: now,
    },
    { onConflict: "user_id" },
  );
}

export async function fetchFriendsPresence(
  friendIds: string[],
): Promise<Record<string, FriendPresence>> {
  const supabase = getSupabase();
  if (!supabase || friendIds.length === 0) return {};

  const { data, error } = await supabase
    .from("user_presence")
    .select("user_id, status, last_seen_at, activity")
    .in("user_id", friendIds);

  if (error) {
    console.warn("[presence] fetch failed:", error.message);
    return {};
  }

  const map: Record<string, FriendPresence> = {};
  for (const row of data ?? []) {
    const lastSeenAt = row.last_seen_at as string;
    map[row.user_id as string] = {
      userId: row.user_id as string,
      status: row.status as FriendPresence["status"],
      lastSeenAt,
      activity: (row.activity as string | null) ?? undefined,
      isOnline: isPresenceOnline(lastSeenAt),
    };
  }
  return map;
}

export function subscribeFriendsPresence(
  friendIds: string[],
  onChange: () => void,
): () => void {
  const supabase = getSupabase();
  if (!supabase || friendIds.length === 0) return () => {};

  const channel = supabase
    .channel(`friend-presence-${friendIds.join("-").slice(0, 48)}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "user_presence",
      },
      (payload) => {
        const id =
          (payload.new as { user_id?: string } | null)?.user_id ??
          (payload.old as { user_id?: string } | null)?.user_id;
        if (id && friendIds.includes(id)) {
          onChange();
        }
      },
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}
