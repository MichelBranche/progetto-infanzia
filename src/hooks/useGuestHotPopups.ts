import { useCallback, useEffect, useSyncExternalStore } from "react";
import { useAppAccess } from "../context/AppAccessContext";
import {
  GUEST_HOT_POPUP_INITIAL_DELAY_MS,
  nextGuestHotPopupProfile,
  randomGuestHotPopupIntervalMs,
  randomGuestHotPopupPlacement,
  type GuestHotPopupActive,
} from "../lib/guestHotPopups";

type Listener = () => void;

const listeners = new Set<Listener>();

let activePopup: GuestHotPopupActive | null = null;
let lastProfileId: string | null = null;
let timerId: number | null = null;
let enabled = false;

function emit() {
  for (const listener of listeners) {
    listener();
  }
}

function subscribe(listener: Listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return activePopup;
}

function clearTimer() {
  if (timerId != null) {
    window.clearTimeout(timerId);
    timerId = null;
  }
}

function showNext() {
  if (!enabled || activePopup) return;
  const profile = nextGuestHotPopupProfile(lastProfileId);
  const placement = randomGuestHotPopupPlacement();
  lastProfileId = profile.id;
  activePopup = { profile, placement };
  emit();
}

function armTimer(delayMs: number) {
  if (!enabled) return;
  clearTimer();
  timerId = window.setTimeout(() => {
    timerId = null;
    showNext();
  }, delayMs);
}

function ensureInitialTimer() {
  if (!enabled || activePopup || timerId != null) return;
  armTimer(GUEST_HOT_POPUP_INITIAL_DELAY_MS);
}

function setEnabled(next: boolean) {
  if (next === enabled) {
    if (next) ensureInitialTimer();
    return;
  }

  enabled = next;

  if (!enabled) {
    clearTimer();
    if (activePopup) {
      activePopup = null;
      emit();
    }
    return;
  }

  ensureInitialTimer();
}

function dismissActive() {
  if (!activePopup) return;
  activePopup = null;
  emit();
  if (enabled) {
    armTimer(randomGuestHotPopupIntervalMs());
  }
}

export function useGuestHotPopups() {
  const { isGuest, guestAccessBlocked } = useAppAccess();
  const active = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const guestEnabled = isGuest && !guestAccessBlocked;

  useEffect(() => {
    setEnabled(guestEnabled);
    return () => setEnabled(false);
  }, [guestEnabled]);

  const dismiss = useCallback(() => {
    dismissActive();
  }, []);

  return { active, dismiss };
}
