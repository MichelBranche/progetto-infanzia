import { useCallback, useEffect, useMemo, useState } from "react";
import { useCloudAccount } from "../context/CloudAccountContext";
import { listCloudFriends } from "../lib/cloudFriends";
import {
  fetchFriendsPresence,
  subscribeFriendsPresence,
  upsertMyPresence,
} from "../lib/cloudPresence";
import {
  getBootFriendsCache,
  hasBootFriendsCache,
  prefetchBootFriends,
} from "../lib/bootFriends";
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
  const bootFriends = getBootFriendsCache();
  const [friends, setFriends] = useState<CloudFriend[]>(
    bootFriends?.friends ?? [],
  );
  const [presence, setPresence] = useState<Record<string, FriendPresence>>(
    bootFriends?.presence ?? {},
  );
  const [loading, setLoading] = useState(
    Boolean(cloudProfile) && !hasBootFriendsCache(),
  );

  usePresenceHeartbeat(Boolean(cloudProfile) && active);

  const refresh = useCallback(async () => {
    if (!cloudProfile) {
      setFriends([]);
      setPresence({});
      setLoading(false);
      return;
    }

    // Cache calda: aggiorna senza far lampeggiare lo stato loading
    // (evita re-render inutili sul poll periodico).
    const cached = getBootFriendsCache();
    if (cached) {
      setFriends(cached.friends);
      setPresence(cached.presence);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const payload = await prefetchBootFriends();
      if (payload) {
        setFriends(payload.friends);
        setPresence(payload.presence);
        return;
      }

      const list = await listCloudFriends();
      setFriends(list);
      const ids = list.map((f) => f.userId);
      const map = ids.length > 0 ? await fetchFriendsPresence(ids) : {};
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
    let unsub = () => {};
    try {
      unsub = subscribeFriendsPresence(ids, () => void refresh());
    } catch (error) {
      console.warn("[presence] realtime subscribe failed:", error);
    }

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
