import { useEffect, useRef } from "react";
import { useAppAccess } from "../context/AppAccessContext";
import { GUEST_DAILY_LIMIT_SECONDS } from "../lib/guestUsage";

/** Conta i secondi di visione ospite solo mentre `isPlaying` è true. */
export function useGuestPlaybackMeter(isPlaying: boolean) {
  const {
    isGuest,
    guestAccessBlocked,
    recordGuestPlayback,
    setGuestWatching,
  } = useAppAccess();
  const tickRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isGuest) {
      setGuestWatching(false);
      return;
    }

    setGuestWatching(isPlaying && !guestAccessBlocked);

    if (!isPlaying || guestAccessBlocked) {
      tickRef.current = null;
      return;
    }

    tickRef.current = Date.now();
    const interval = window.setInterval(() => {
      const started = tickRef.current;
      if (!started) return;
      const now = Date.now();
      const delta = Math.max(1, Math.floor((now - started) / 1000));
      tickRef.current = now;
      const used = recordGuestPlayback(delta);
      if (used >= GUEST_DAILY_LIMIT_SECONDS) {
        setGuestWatching(false);
      }
    }, 1000);

    return () => {
      window.clearInterval(interval);
      tickRef.current = null;
      setGuestWatching(false);
    };
  }, [
    isGuest,
    isPlaying,
    guestAccessBlocked,
    recordGuestPlayback,
    setGuestWatching,
  ]);
}
