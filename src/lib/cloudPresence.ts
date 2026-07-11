import { getSupabase } from "./supabaseClient";
import type { FriendPresence } from "../types/cloud";
import { fetchAppVersion } from "./appUpdater";
import { detectPlatform } from "./feedbackApi";
import {
  readUserPresenceStatus,
  type UserPresenceStatus,
} from "./userPresenceStatus";

export const PRESENCE_ONLINE_MS = 90_000;

let cachedAppVersion: string | null = null;

type SharedPresenceSubscription = {
  key: string;
  friendIds: Set<string>;
  callbacks: Set<() => void>;
  cleanup: () => void;
};

let sharedPresenceSub: SharedPresenceSubscription | null = null;

function friendPresenceChannelKey(friendIds: string[]): string {
  return [...friendIds].sort().join(",");
}

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

function resolveHeartbeatStatus(
  chosen: UserPresenceStatus,
): FriendPresence["status"] {
  switch (chosen) {
    case "away":
      return "away";
    case "dnd":
      return "dnd";
    case "invisible":
      return "invisible";
    case "online":
    default:
      return document.hidden ? "away" : "online";
  }
}

function publicFriendPresence(
  userId: string,
  status: FriendPresence["status"],
  lastSeenAt: string,
  activity?: string,
): FriendPresence {
  if (status === "invisible") {
    return {
      userId,
      status: "offline",
      lastSeenAt,
      isOnline: false,
    };
  }

  const online = isPresenceOnline(lastSeenAt);
  return {
    userId,
    status: online ? status : "offline",
    lastSeenAt,
    activity,
    isOnline: online && status !== "offline",
  };
}

export async function upsertMyPresence(
  activity?: string,
  forcedStatus?: UserPresenceStatus,
): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) return;

  const { data: sessionData } = await supabase.auth.getSession();
  const myId = sessionData.session?.user?.id;
  if (!myId) return;

  const now = new Date().toISOString();
  const chosen = forcedStatus ?? readUserPresenceStatus();
  const status = resolveHeartbeatStatus(chosen);
  const appVersion = await resolveAppVersion();

  const { error } = await supabase.from("user_presence").upsert(
    {
      user_id: myId,
      status,
      last_seen_at: now,
      activity:
        activity ??
        (status === "dnd" ? "Non disturbare" : null),
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
    const rawStatus = row.status as FriendPresence["status"];
    map[row.user_id as string] = publicFriendPresence(
      row.user_id as string,
      rawStatus,
      lastSeenAt,
      (row.activity as string | null) ?? undefined,
    );
  }
  return map;
}

export function subscribeFriendsPresence(
  friendIds: string[],
  onChange: () => void,
): () => void {
  const supabase = getSupabase();
  if (!supabase || friendIds.length === 0) return () => {};

  const key = friendPresenceChannelKey(friendIds);

  if (sharedPresenceSub && sharedPresenceSub.key !== key) {
    sharedPresenceSub.cleanup();
    sharedPresenceSub = null;
  }

  if (!sharedPresenceSub) {
    const friendIdSet = new Set(friendIds);
    const callbacks = new Set<() => void>();
    const channelName = `friend-presence-${key.slice(0, 80)}`;

    // Evita canali zombie con lo stesso topic (es. dopo HMR).
    for (const existing of supabase.getChannels()) {
      if (existing.topic === channelName) {
        void supabase.removeChannel(existing);
      }
    }

    const channel = supabase
      .channel(channelName)
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
          if (id && friendIdSet.has(id)) {
            for (const callback of callbacks) callback();
          }
        },
      )
      .subscribe();

    sharedPresenceSub = {
      key,
      friendIds: friendIdSet,
      callbacks,
      cleanup: () => {
        void supabase.removeChannel(channel);
        callbacks.clear();
      },
    };
  }

  sharedPresenceSub.callbacks.add(onChange);

  return () => {
    if (!sharedPresenceSub) return;
    sharedPresenceSub.callbacks.delete(onChange);
    if (sharedPresenceSub.callbacks.size === 0) {
      sharedPresenceSub.cleanup();
      sharedPresenceSub = null;
    }
  };
}
