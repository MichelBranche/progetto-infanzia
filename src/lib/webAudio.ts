import { isWebShell } from "./runtimeInvoke";

let unlocked = false;
const pending: Array<() => void> = [];
const unlockListeners = new Set<() => void>();
let listenersAttached = false;

function isAutoplayBlocked(error: unknown): boolean {
  return error instanceof DOMException && error.name === "NotAllowedError";
}

function markUnlocked() {
  if (unlocked) return;
  unlocked = true;
  for (const listener of unlockListeners) listener();
  unlockListeners.clear();
  for (const play of pending.splice(0)) play();
}

export function isWebAudioUnlocked(): boolean {
  return unlocked || !isWebShell();
}

export function initWebAudioUnlock() {
  if (!isWebShell() || listenersAttached) return;
  listenersAttached = true;

  const unlock = () => markUnlocked();

  document.addEventListener("pointerdown", unlock, { once: true, capture: true });
  document.addEventListener("keydown", unlock, { once: true, capture: true });
  document.addEventListener("touchstart", unlock, { once: true, capture: true });
}

export function onWebAudioUnlock(listener: () => void): () => void {
  if (isWebAudioUnlocked()) {
    listener();
    return () => undefined;
  }
  unlockListeners.add(listener);
  return () => unlockListeners.delete(listener);
}

export function playAudioElement(audio: HTMLAudioElement): void {
  const attempt = () => {
    void audio.play().then(() => markUnlocked()).catch((error) => {
      if (isWebShell() && !unlocked && isAutoplayBlocked(error)) {
        pending.push(attempt);
      }
    });
  };

  if (isWebAudioUnlocked()) {
    attempt();
    return;
  }

  pending.push(attempt);
}
