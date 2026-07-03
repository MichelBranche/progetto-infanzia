import { useCallback, useEffect, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { syncLanFriendsPresence } from "../lib/watchPartyApi";
import type { LanFriendPresence } from "../types/cloud";

const LAN_SYNC_MS = 45_000;

export function useLanFriendPresence(
  profileId: string,
  displayName: string,
  active = true,
) {
  const [friends, setFriends] = useState<LanFriendPresence[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(
    async (deepScan = false) => {
      if (!isTauri() || !profileId) {
        setFriends([]);
        return;
      }
      setLoading(true);
      try {
        const list = await syncLanFriendsPresence(
          profileId,
          displayName,
          deepScan,
        );
        setFriends(list);
      } catch (err) {
        console.warn("[lan-presence] sync failed:", err);
        setFriends([]);
      } finally {
        setLoading(false);
      }
    },
    [profileId, displayName],
  );

  useEffect(() => {
    if (!active) return;
    void refresh(false);
    const interval = window.setInterval(() => void refresh(false), LAN_SYNC_MS);
    return () => window.clearInterval(interval);
  }, [active, refresh]);

  const onlineFriends = friends.filter((f) => f.online);
  const offlineFriends = friends.filter((f) => !f.online);

  return {
    friends,
    onlineFriends,
    offlineFriends,
    onlineCount: onlineFriends.length,
    loading,
    refresh,
  };
}
