export type PlayerStreamAudioLanguage = "it" | "en";

export const PLAYER_AUDIO_LANG_KEY = "branchefy-player-audio-lang";

export const PLAYER_STREAM_AUDIO_OPTIONS: Array<{
  id: PlayerStreamAudioLanguage;
  label: string;
}> = [
  { id: "it", label: "Italiano" },
  { id: "en", label: "Inglese" },
];

export function readPlayerAudioLanguage(): PlayerStreamAudioLanguage {
  try {
    const stored = localStorage.getItem(PLAYER_AUDIO_LANG_KEY);
    if (stored === "en") return "en";
  } catch {
    // ignore
  }
  return "it";
}

export function savePlayerAudioLanguage(lang: PlayerStreamAudioLanguage): void {
  try {
    localStorage.setItem(PLAYER_AUDIO_LANG_KEY, lang);
  } catch {
    // ignore
  }
}
