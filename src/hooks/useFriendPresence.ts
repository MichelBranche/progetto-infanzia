import { useCallback, useEffect, useMemo, useState } from "react";
import { useCloudAccount } from "../context/CloudAccountContext";
import { listCloudFriends } from "../lib/cloudFriends";
import {
  fetchFriendsPresence,
  subscribeFriendsPresence,
  upsertMyPresence,
} from "../lib/cloudPresence";
import type { CloudFriend, FriendPresence } from "../types/cloud";

const HEARTBEAT_MS = 30_000;

export function usePresenceHeartbeat(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;

    const beat = () => void upsertMyPresence();
    void beat();

    const interval = window.setInterval(beat, HEARTBEAT_MS);
    const onVisibility = () => void upsertMyPresence();
    window.addEventListener("visibilitychange", onVisibility);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("visibilitychange", onVisibility);
    };
  }, [enabled]);
}

export function useCloudFriendPresence(active = true) {
  const { profile: cloudProfile } = useCloudAccount();
  const [friends, setFriends] = useState<CloudFriend[]>([]);
  const [presence, setPresence] = useState<Record<string, FriendPresence>>({});
  const [loading, setLoading] = useState(false);

  usePresenceHeartbeat(Boolean(cloudProfile) && active);

  const refresh = useCallback(async () => {
    if (!cloudProfile) {
      setFriends([]);
      setPresence({});
      return;
    }
    setLoading(true);
    try {
      const list = await listCloudFriends();
      setFriends(list);
      const ids = list.map((f) => f.userId);
      const map = await fetchFriendsPresence(ids);
      setPresence(map);
    } catch {
      setFriends([]);
      setPresence({});
    } finally {
      setLoading(false);
    }
  }, [cloudProfile]);

  useEffect(() => {
    if (!active) return;
    void refresh();
  }, [active, refresh]);

  useEffect(() => {
    if (!cloudProfile || !active) return;
    const ids = friends.map((f) => f.userId);
    if (ids.length === 0) return;

    const poll = window.setInterval(() => void refresh(), HEARTBEAT_MS);
    const unsub = subscribeFriendsPresence(ids, () => void refresh());

    return () => {
      window.clearInterval(poll);
      unsub();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ids joined avoids resubscribe loops
  }, [cloudProfile, active, refresh, friends.map((f) => f.userId).join(",")]);

  const enriched = useMemo(
    () =>
      friends.map((friend) => ({
        ...friend,
        presence: presence[friend.userId],
        isOnline: presence[friend.userId]?.isOnline ?? false,
      })),
    [friends, presence],
  );

  const onlineFriends = useMemo(
    () => enriched.filter((f) => f.isOnline),
    [enriched],
  );

  const offlineFriends = useMemo(
    () => enriched.filter((f) => !f.isOnline),
    [enriched],
  );

  return {
    friends: enriched,
    onlineFriends,
    offlineFriends,
    onlineCount: onlineFriends.length,
    loading,
    refresh,
  };
}
