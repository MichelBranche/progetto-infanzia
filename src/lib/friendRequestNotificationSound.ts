const FRIEND_REQUEST_SOUND_SRC = "/audio/richiesta-amicizia.wav";

let cachedAudio: HTMLAudioElement | null = null;

export function playFriendRequestNotificationSound() {
  try {
    if (!cachedAudio) {
      cachedAudio = new Audio(FRIEND_REQUEST_SOUND_SRC);
      cachedAudio.preload = "auto";
      cachedAudio.volume = 0.92;
    }
    cachedAudio.currentTime = 0;
    void cachedAudio.play().catch(() => undefined);
  } catch {
    // ignore autoplay / missing asset errors
  }
}
