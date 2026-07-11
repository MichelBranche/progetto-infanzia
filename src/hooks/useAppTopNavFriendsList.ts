import { useMemo } from "react";
import { useCloudFriendPresence } from "./useFriendPresence";
import { useLanFriendPresence } from "./useLanFriendPresence";
import { formatPresenceLabel } from "../lib/presenceLabels";
import { isLanFeaturesEnabled } from "../lib/platform";
import type { CloudProfile } from "../types/cloud";

export type AppTopNavFriendEntry = {
  key: string;
  kind: "cloud" | "lan";
  name: string;
  subtitle?: string;
  online: boolean;
  away?: boolean;
  dnd?: boolean;
  avatarUrl?: string;
  userId?: string;
  friendCode?: string;
  lastHost?: string;
};

export function useAppTopNavFriendsList(
  profileId: string,
  profileName: string,
  active: boolean,
  cloudProfile: CloudProfile | null,
) {
  const cloudPresence = useCloudFriendPresence(active);
  const lanPresence = useLanFriendPresence(
    profileId,
    profileName,
    active && isLanFeaturesEnabled(),
    cloudPresence.friends,
    cloudProfile?.friendCode,
    cloudProfile?.avatarUrl,
  );

  const friends = useMemo(() => {
    const entries: AppTopNavFriendEntry[] = [];

    for (const friend of cloudPresence.friends) {
      entries.push({
        key: `cloud-${friend.userId}`,
        kind: "cloud",
        name: friend.displayName,
        subtitle: formatPresenceLabel(friend.presence),
        online: friend.isOnline,
        away: friend.presence?.status === "away",
        dnd: friend.presence?.status === "dnd",
        avatarUrl: friend.avatarUrl,
        userId: friend.userId,
        friendCode: friend.friendCode,
      });
    }

    if (isLanFeaturesEnabled()) {
      for (const friend of lanPresence.friends) {
        if (entries.some((e) => e.friendCode === friend.friendCode)) continue;
        entries.push({
          key: `lan-${friend.friendCode}`,
          kind: "lan",
          name: friend.displayName,
          subtitle: friend.online
            ? `LAN · ${friend.lastHost ?? "rete locale"}`
            : "LAN · offline",
          online: friend.online,
          avatarUrl: friend.avatarUrl,
          friendCode: friend.friendCode,
          lastHost: friend.lastHost,
        });
      }
    }

    return entries.sort((a, b) => {
      if (a.online !== b.online) return a.online ? -1 : 1;
      return a.name.localeCompare(b.name, "it");
    });
  }, [cloudPresence.friends, lanPresence.friends]);

  const onlineCount = friends.filter((f) => f.online).length;
  const refreshing =
    cloudPresence.loading || (isLanFeaturesEnabled() && lanPresence.loading);

  const refreshAll = () => {
    void cloudPresence.refresh();
    lanPresence.refresh();
  };

  return {
    friends,
    onlineCount,
    refreshing,
    refreshAll,
  };
}
