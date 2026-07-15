import { useCallback, useEffect, useRef, useState } from "react";
import type { AppBroadcast } from "../types/appBroadcast";
import {
  clearExpiredBroadcastDismissals,
  dismissBroadcast,
  fetchActiveAppBroadcast,
  isBroadcastActiveNow,
  isBroadcastDismissed,
  subscribeAppBroadcasts,
} from "../lib/appBroadcastApi";
import { playGlobalBroadcastSound } from "../lib/broadcastNotificationSound";

export function useAppBroadcast() {
  const [broadcast, setBroadcast] = useState<AppBroadcast | null>(null);
  const [visible, setVisible] = useState(false);
  const soundedIdRef = useRef<string | null>(null);

  const refresh = useCallback(async () => {
    const active = await fetchActiveAppBroadcast();
    setBroadcast(active);
    clearExpiredBroadcastDismissals(active?.id);

    if (!active || !isBroadcastActiveNow(active)) {
      setVisible(false);
      return;
    }

    const blocked = !active.dismissible && active.messageType === "essential";
    const dismissed = active.dismissible && isBroadcastDismissed(active.id);
    const shouldShow = blocked || !dismissed;
    setVisible(shouldShow);

    if (shouldShow && soundedIdRef.current !== active.id) {
      soundedIdRef.current = active.id;
      playGlobalBroadcastSound();
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => {
      void refresh();
    }, 60_000);
    const unsubscribe = subscribeAppBroadcasts(() => {
      void refresh();
    });
    return () => {
      window.clearInterval(timer);
      unsubscribe();
    };
  }, [refresh]);

  const dismiss = useCallback(() => {
    if (!broadcast?.dismissible) return;
    dismissBroadcast(broadcast.id);
    setVisible(false);
  }, [broadcast]);

  return { broadcast, visible, dismiss, refresh };
}
