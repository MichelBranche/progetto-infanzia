import { useCallback, useEffect, useState } from "react";
import type { AchievementUnlock, ProfileAchievementsState } from "../lib/achievements";
import { achievementUnlockNotifications } from "../lib/achievementNotifications";
import { getAchievementsState, syncAchievements } from "../lib/achievementsApi";
import { useNotifications } from "../context/NotificationContext";

export function useAchievements(profileId: string, cloudFriendsCount = 0) {
  const { notify } = useNotifications();
  const [state, setState] = useState<ProfileAchievementsState | null>(null);
  const [loading, setLoading] = useState(true);

  const notifyUnlocks = useCallback(
    (unlocks: AchievementUnlock[]) => {
      for (const item of achievementUnlockNotifications(unlocks)) {
        notify(item);
      }
    },
    [notify],
  );

  const refresh = useCallback(async () => {
    if (!profileId) {
      setState(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const next = await getAchievementsState(profileId, cloudFriendsCount);
      setState(next);
    } catch {
      setState(null);
    } finally {
      setLoading(false);
    }
  }, [profileId, cloudFriendsCount]);

  const sync = useCallback(async () => {
    if (!profileId) return [];
    try {
      const unlocks = await syncAchievements(profileId, cloudFriendsCount);
      if (unlocks.length > 0) {
        notifyUnlocks(unlocks);
      }
      await refresh();
      return unlocks;
    } catch {
      return [];
    }
  }, [profileId, cloudFriendsCount, notifyUnlocks, refresh]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!profileId) return;
    let cancelled = false;
    void (async () => {
      try {
        const unlocks = await syncAchievements(profileId, cloudFriendsCount);
        if (!cancelled && unlocks.length > 0) {
          notifyUnlocks(unlocks);
          await refresh();
        }
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [profileId, cloudFriendsCount, notifyUnlocks, refresh]);

  return {
    state,
    loading,
    refresh,
    sync,
    notifyUnlocks,
  };
}
