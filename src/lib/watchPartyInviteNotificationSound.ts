import { playAudioElement } from "./webAudio";

const WATCH_PARTY_INVITE_SOUND_SRC = "/audio/watch-party-invite.wav";

let cachedAudio: HTMLAudioElement | null = null;

export function playWatchPartyInviteNotificationSound() {
  try {
    if (!cachedAudio) {
      cachedAudio = new Audio(WATCH_PARTY_INVITE_SOUND_SRC);
      cachedAudio.preload = "auto";
      cachedAudio.volume = 0.92;
    }
    cachedAudio.currentTime = 0;
    playAudioElement(cachedAudio);
  } catch {
    // ignore autoplay / missing asset errors
  }
}
