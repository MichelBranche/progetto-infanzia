const UPDATE_NOTIFICATION_SOUND_SRC = "/audio/update-notification.mp3";

let cachedAudio: HTMLAudioElement | null = null;

export function playUpdateNotificationSound() {
  try {
    if (!cachedAudio) {
      cachedAudio = new Audio(UPDATE_NOTIFICATION_SOUND_SRC);
      cachedAudio.preload = "auto";
      cachedAudio.volume = 0.88;
    }
    cachedAudio.currentTime = 0;
    void cachedAudio.play().catch(() => undefined);
  } catch {
    // ignore autoplay / missing asset errors
  }
}
