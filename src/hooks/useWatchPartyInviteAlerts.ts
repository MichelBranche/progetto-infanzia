import { useEffect, useRef } from "react";
import { useCloudAccount } from "../context/CloudAccountContext";
import { useNotifications } from "../context/NotificationContext";
import {
  subscribeWatchPartyInvites,
  type WatchPartyInvitePayload,
} from "../lib/cloudWatchPartyInvite";
import { guestSessionFromInvitePayload } from "../lib/watchPartyInviteChatMessage";
import { playWatchPartyInviteNotificationSound } from "../lib/watchPartyInviteNotificationSound";
import type { WatchPartySession } from "../types/watchParty";

const DEDUPE_MS = 12_000;

export function useWatchPartyInviteAlerts(
  onJoinWatchParty: (session: WatchPartySession) => void,
) {
  const { profile: cloudProfile } = useCloudAccount();
  const { notify } = useNotifications();
  const onJoinRef = useRef(onJoinWatchParty);
  const recentRef = useRef<Map<string, number>>(new Map());

  onJoinRef.current = onJoinWatchParty;

  useEffect(() => {
    if (!cloudProfile?.id) return;

    const handleInvite = (payload: WatchPartyInvitePayload) => {
      const dedupeKey = `${payload.hostId}:${payload.roomCode}`;
      const last = recentRef.current.get(dedupeKey) ?? 0;
      if (Date.now() - last < DEDUPE_MS) return;
      recentRef.current.set(dedupeKey, Date.now());

      playWatchPartyInviteNotificationSound();

      const joinSession = guestSessionFromInvitePayload(payload);

      notify({
        kind: "watchParty",
        title: "Invito watch party",
        message:
          payload.relay === "lan" && payload.hostIp
            ? `${payload.hostName} ti invita in LAN (${payload.hostIp}) · «${payload.title}»`
            : `${payload.hostName} ti invita a guardare «${payload.title}»`,
        watchPartyInvite: payload,
        onWatchPartyJoin: () => onJoinRef.current(joinSession),
      });
    };

    return subscribeWatchPartyInvites(cloudProfile.id, handleInvite);
  }, [cloudProfile?.id, notify]);
}
