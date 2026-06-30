import { useCallback, useEffect, useRef, useState } from "react";
import { useCloudAccount } from "../context/CloudAccountContext";
import { useNotifications } from "../context/NotificationContext";
import {
  listAcceptedAsRequester,
  listPendingFriendRequests,
  subscribeFriendRequests,
} from "../lib/cloudFriends";

const POLL_FALLBACK_MS = 60_000;

/**
 * Realtime + slow polling for cloud friend requests.
 * Surfaces toasts and exposes pending count for profile badge.
 */
export function useCloudFriendAlerts() {
  const { profile } = useCloudAccount();
  const { notify } = useNotifications();
  const [pendingCount, setPendingCount] = useState(0);
  const seenIncomingRef = useRef<Set<string> | null>(null);
  const seenAcceptedRef = useRef<Set<string> | null>(null);

  const poll = useCallback(async () => {
    if (!profile) {
      setPendingCount(0);
      seenIncomingRef.current = null;
      seenAcceptedRef.current = null;
      return;
    }

    try {
      const [incoming, acceptedAsRequester] = await Promise.all([
        listPendingFriendRequests(),
        listAcceptedAsRequester(),
      ]);

      setPendingCount(incoming.length);

      if (!seenIncomingRef.current) {
        seenIncomingRef.current = new Set(incoming.map((r) => r.id));
      } else {
        for (const req of incoming) {
          if (!seenIncomingRef.current.has(req.id)) {
            seenIncomingRef.current.add(req.id);
            notify({
              kind: "friend",
              title: "Nuova richiesta di amicizia",
              message: req.requester
                ? `${req.requester.displayName} vuole aggiungerti`
                : "Hai una nuova richiesta in attesa",
            });
          }
        }
        for (const id of [...seenIncomingRef.current]) {
          if (!incoming.some((r) => r.id === id)) {
            seenIncomingRef.current.delete(id);
          }
        }
      }

      const acceptedKeys = acceptedAsRequester.map(
        (r) => `${r.requesterId}:${r.addresseeId}`,
      );
      if (!seenAcceptedRef.current) {
        seenAcceptedRef.current = new Set(acceptedKeys);
      } else {
        for (const req of acceptedAsRequester) {
          const key = `${req.requesterId}:${req.addresseeId}`;
          if (!seenAcceptedRef.current.has(key)) {
            seenAcceptedRef.current.add(key);
            if (req.addressee) {
              notify({
                kind: "success",
                title: "Richiesta accettata",
                message: `${req.addressee.displayName} ha accettato la tua richiesta`,
              });
            }
          }
        }
      }
    } catch {
      // ignore transient network errors
    }
  }, [profile, notify]);

  useEffect(() => {
    if (!profile) return;

    void poll();
    const unsubscribe = subscribeFriendRequests(profile.id, () => void poll());
    const id = window.setInterval(() => void poll(), POLL_FALLBACK_MS);

    return () => {
      unsubscribe();
      window.clearInterval(id);
    };
  }, [profile, poll]);

  const refresh = useCallback(() => void poll(), [poll]);

  return { pendingCount, refreshFriendAlerts: refresh };
}
