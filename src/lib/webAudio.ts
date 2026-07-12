import { isTauri } from "@tauri-apps/api/core";
import { isWebShell } from "./runtimeInvoke";

const INTRO_SOUND_SRC = "/audio/netflix-intro.mp3";

let unlocked = !isWebShell();
const pending: Array<() => void> = [];
const unlockListeners = new Set<() => void>();
let listenersAttached = false;
let introAudioPrimed: HTMLAudioElement | null = null;

function isAutoplayBlocked(error: unknown): boolean {
  return error instanceof DOMException && error.name === "NotAllowedError";
}

export function unlockAppAudio(): void {
  if (unlocked) return;
  unlocked = true;
  const listeners = [...unlockListeners];
  unlockListeners.clear();
  for (const listener of listeners) listener();
  for (const play of pending.splice(0)) play();
}

export function isWebAudioUnlocked(): boolean {
  return unlocked;
}

/** Precarica l'MP3 intro prima del mount React. */
export function preloadIntroAudio(): void {
  if (introAudioPrimed) return;
  const audio = new Audio(INTRO_SOUND_SRC);
  audio.preload = "auto";
  audio.setAttribute("playsinline", "");
  audio.load();
  introAudioPrimed = audio;
}

async function attemptPlay(audio: HTMLAudioElement): Promise<boolean> {
  try {
    await audio.play();
    unlockAppAudio();
    return true;
  } catch (error) {
    if (!isAutoplayBlocked(error)) return false;
  }

  const volume = audio.volume;
  const wasMuted = audio.muted;
  try {
    audio.muted = true;
    audio.volume = 0;
    await audio.play();
    audio.muted = wasMuted;
    audio.volume = volume;
    unlockAppAudio();
    return true;
  } catch {
    audio.muted = wasMuted;
    audio.volume = volume;
    return false;
  }
}

function queuePlay(audio: HTMLAudioElement): void {
  const run = () => {
    void attemptPlay(audio);
  };
  pending.push(run);
}

/** Riproduci audio: autoplay diretto, fallback muted, poi coda al gesto. */
export async function playAudioElement(audio: HTMLAudioElement): Promise<boolean> {
  if (await attemptPlay(audio)) return true;

  queuePlay(audio);
  return false;
}

/** Sblocca l'audio al primo gesto (browser + fallback WebView). */
export function initWebAudioUnlock() {
  if (listenersAttached) return;
  listenersAttached = true;

  if (isTauri()) {
    unlockAppAudio();
  }

  preloadIntroAudio();

  const unlock = () => unlockAppAudio();

  document.addEventListener("pointerdown", unlock, { once: true, capture: true });
  document.addEventListener("keydown", unlock, { once: true, capture: true });
  document.addEventListener("touchstart", unlock, { once: true, capture: true });
  window.addEventListener("focus", unlock, { once: true });
}

export function onWebAudioUnlock(listener: () => void): () => void {
  if (unlocked) {
    listener();
    return () => undefined;
  }
  unlockListeners.add(listener);
  return () => unlockListeners.delete(listener);
}
