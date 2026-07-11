import { useCallback } from "react";
import { useCloudAccount } from "../context/CloudAccountContext";
import { useNotifications } from "../context/NotificationContext";
import { useWatchPartyHost } from "../context/WatchPartyHostContext";
import { sendWatchPartyInvite } from "../lib/cloudWatchPartyInvite";
import { sendWatchPartyInviteChatMessage } from "../lib/cloudChat";
import { playWatchPartyInviteNotificationSound } from "../lib/watchPartyInviteNotificationSound";
import {
  canInviteFriendToHostSession,
  canShowHostPartyInvites,
} from "../lib/watchPartyInviteEligibility";
import type { AppTopNavFriendEntry } from "../hooks/useAppTopNavFriendsList";

export function useWatchPartyInviteActions() {
  const { hostSession } = useWatchPartyHost();
  const { profile: cloudProfile } = useCloudAccount();
  const { notify } = useNotifications();

  const sendInviteToFriend = useCallback(
    async (friend: AppTopNavFriendEntry) => {
      if (!cloudProfile) {
        notify({
          kind: "info",
          title: "Account richiesto",
          message: "Accedi al tuo account Branchefy per invitare amici.",
        });
        return false;
      }
      if (!hostSession || hostSession.role !== "host") {
        notify({
          kind: "info",
          title: "Nessuna stanza attiva",
          message:
            "Avvia un watch party dal player video, poi invita gli amici da qui.",
        });
        return false;
      }
      if (!canInviteFriendToHostSession(friend, hostSession, cloudProfile)) {
        notify({
          kind: "info",
          title: "Invito non disponibile",
          message:
            hostSession.relay === "lan"
              ? "Per inviti LAN serve un account Branchefy e un amico con account cloud."
              : "Puoi invitare solo amici cloud con account Branchefy.",
        });
        return false;
      }
      const targetUserId = friend.userId;
      if (!targetUserId) return false;

      try {
        await sendWatchPartyInvite(
          targetUserId,
          hostSession,
          cloudProfile.id,
          cloudProfile.displayName || "Host",
        );
        try {
          await sendWatchPartyInviteChatMessage(targetUserId, {
            roomCode: hostSession.room.code,
            title: hostSession.room.content.title,
            hostId: cloudProfile.id,
            hostName: cloudProfile.displayName || "Host",
            relay: hostSession.relay ?? "cloud",
            hostIp:
              hostSession.relay === "lan"
                ? (hostSession.room.hostIp ?? hostSession.hostIp)
                : undefined,
            sentAt: Date.now(),
          });
        } catch {
          // invito realtime ok anche se la chat non si aggiorna subito
        }
        playWatchPartyInviteNotificationSound();
        notify({
          kind: "success",
          title: "Invito inviato",
          message:
            hostSession.relay === "lan"
              ? `${friend.name} riceverà l'invito in chat con codice e IP per «${hostSession.room.content.title}».`
              : `${friend.name} riceverà l'invito in chat per «${hostSession.room.content.title}».`,
        });
        return true;
      } catch (err) {
        notify({
          kind: "info",
          title: "Invito non inviato",
          message: err instanceof Error ? err.message : String(err),
        });
        return false;
      }
    },
    [cloudProfile, hostSession, notify],
  );

  return {
    hostSession,
    canInviteFriends: canShowHostPartyInvites(hostSession, cloudProfile),
    sendInviteToFriend,
  };
}
