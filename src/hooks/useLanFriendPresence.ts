import { useCallback, useEffect, useMemo, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { isLanFeaturesEnabled } from "../lib/platform";
import { enrichLanFriendsWithCloudAvatars } from "../lib/cloudAvatar";
import { syncLanFriendsPresence } from "../lib/watchPartyApi";
import type { CloudFriend, LanFriendPresence } from "../types/cloud";

const LAN_SYNC_MS = 45_000;

export function useLanFriendPresence(
  profileId: string,
  displayName: string,
  active = true,
  cloudFriends: CloudFriend[] = [],
  cloudFriendCode?: string,
  cloudAvatarUrl?: string,
) {
  const [friends, setFriends] = useState<LanFriendPresence[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(
    async (deepScan = false) => {
      if (!isLanFeaturesEnabled() || !isTauri() || !profileId) {
        setFriends([]);
        return;
      }
      setLoading(true);
      try {
        const list = await syncLanFriendsPresence(
          profileId,
          displayName,
          deepScan,
          cloudFriendCode,
          cloudAvatarUrl,
        );
        setFriends(list);
      } catch (err) {
        console.warn("[lan-presence] sync failed:", err);
        setFriends([]);
      } finally {
        setLoading(false);
      }
    },
    [profileId, displayName, cloudFriendCode, cloudAvatarUrl],
  );

  useEffect(() => {
    if (!active) return;
    void refresh(false);
    const interval = window.setInterval(() => void refresh(false), LAN_SYNC_MS);
    return () => window.clearInterval(interval);
  }, [active, refresh]);

  const enrichedFriends = useMemo(
    () => enrichLanFriendsWithCloudAvatars(friends, cloudFriends),
    [friends, cloudFriends],
  );

  const onlineFriends = enrichedFriends.filter((f) => f.online);
  const offlineFriends = enrichedFriends.filter((f) => !f.online);

  return {
    friends: enrichedFriends,
    onlineFriends,
    offlineFriends,
    onlineCount: onlineFriends.length,
    loading,
    refresh,
  };
}
