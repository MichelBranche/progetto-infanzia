import { playAudioElement } from "./webAudio";
import { readHomeCardSoundsPref } from "./settingsApi";

const CARD_NAV_SOUND_SRC = "/audio/card-navigation.wav";
const CARD_OPEN_TITLE_SOUND_SRC = "/audio/card-open-title.mp3";

const NAV_SOUND_MIN_INTERVAL_MS = 140;
const NAV_SOUND_VOLUME = 0.55;
const OPEN_TITLE_SOUND_VOLUME = 0.82;

let navAudio: HTMLAudioElement | null = null;
let openTitleAudio: HTMLAudioElement | null = null;
let lastNavSoundAt = 0;

function playCached(
  cached: HTMLAudioElement | null,
  src: string,
  volume: number,
): HTMLAudioElement {
  const audio = cached ?? new Audio(src);
  if (!cached) {
    audio.preload = "auto";
    audio.volume = volume;
  }
  audio.currentTime = 0;
  playAudioElement(audio);
  return audio;
}

export function playCardNavigationSound() {
  if (!readHomeCardSoundsPref()) return;
  try {
    const now = Date.now();
    if (now - lastNavSoundAt < NAV_SOUND_MIN_INTERVAL_MS) return;
    lastNavSoundAt = now;
    navAudio = playCached(navAudio, CARD_NAV_SOUND_SRC, NAV_SOUND_VOLUME);
  } catch {
    // ignore autoplay / missing asset errors
  }
}

export function playCardOpenTitleSound() {
  if (!readHomeCardSoundsPref()) return;
  try {
    openTitleAudio = playCached(
      openTitleAudio,
      CARD_OPEN_TITLE_SOUND_SRC,
      OPEN_TITLE_SOUND_VOLUME,
    );
  } catch {
    // ignore autoplay / missing asset errors
  }
}
