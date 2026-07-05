const CHAT_NOTIFICATION_SOUND_SRC = "/audio/nuovo-messaggio.wav";

let cachedAudio: HTMLAudioElement | null = null;

export function playChatNotificationSound() {
  try {
    if (!cachedAudio) {
      cachedAudio = new Audio(CHAT_NOTIFICATION_SOUND_SRC);
      cachedAudio.preload = "auto";
      cachedAudio.volume = 0.92;
    }
    cachedAudio.currentTime = 0;
    void cachedAudio.play().catch(() => undefined);
  } catch {
    // ignore autoplay / missing asset errors
  }
}
