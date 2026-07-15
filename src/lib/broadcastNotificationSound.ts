import { playAudioElement } from "./webAudio";

const GLOBAL_BROADCAST_SOUND_SRC = "/audio/global-broadcast-notification.mp3";

let cachedAudio: HTMLAudioElement | null = null;

export function playGlobalBroadcastSound() {
  try {
    if (!cachedAudio) {
      cachedAudio = new Audio(GLOBAL_BROADCAST_SOUND_SRC);
      cachedAudio.preload = "auto";
      cachedAudio.volume = 0.9;
    }
    cachedAudio.currentTime = 0;
    playAudioElement(cachedAudio);
  } catch {
    // ignore autoplay / missing asset errors
  }
}
