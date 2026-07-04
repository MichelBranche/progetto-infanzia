import type { MediaPlaylist } from "hls.js";

export type PreferredAudioLanguage =
  | "auto"
  | "it"
  | "en"
  | "ja"
  | "es"
  | "fr"
  | "de";

export interface AudioLanguageOption {
  id: PreferredAudioLanguage;
  label: string;
  description: string;
}

export const PREFERRED_AUDIO_LANGUAGE_OPTIONS: AudioLanguageOption[] = [
  { id: "auto", label: "Automatica", description: "Sceglie in base al titolo" },
  { id: "it", label: "Italiano", description: "Doppiaggio o audio IT" },
  { id: "en", label: "Inglese", description: "Audio originale o EN" },
  { id: "ja", label: "Giapponese", description: "Per anime in lingua originale" },
  { id: "es", label: "Spagnolo", description: "Audio ES" },
  { id: "fr", label: "Francese", description: "Audio FR" },
  { id: "de", label: "Tedesco", description: "Audio DE" },
];

const LANGUAGE_LABELS: Record<string, string> = {
  it: "Italiano",
  en: "Inglese",
  ja: "Giapponese",
  es: "Spagnolo",
  fr: "Francese",
  de: "Tedesco",
  pt: "Portoghese",
  ko: "Coreano",
  zh: "Cinese",
};

export function normalizePreferredAudioLanguage(
  value?: string | null,
): PreferredAudioLanguage {
  const normalized = value?.trim().toLowerCase();
  if (
    normalized &&
    PREFERRED_AUDIO_LANGUAGE_OPTIONS.some((option) => option.id === normalized)
  ) {
    return normalized as PreferredAudioLanguage;
  }
  return "auto";
}

export function preferredAudioLanguageLabel(
  value: PreferredAudioLanguage,
): string {
  return (
    PREFERRED_AUDIO_LANGUAGE_OPTIONS.find((option) => option.id === value)
      ?.label ?? "Automatica"
  );
}

export function languageLabelFromCode(code?: string | null): string {
  if (!code?.trim()) return "Audio";
  const base = code.trim().toLowerCase().split("-")[0];
  return LANGUAGE_LABELS[base] ?? code.toUpperCase();
}

export function formatAudioTrackLabel(
  track: MediaPlaylist,
  index: number,
): string {
  const name = track.name?.trim();
  const lang = track.lang?.trim();
  if (name && lang) {
    const langLabel = languageLabelFromCode(lang);
    if (name.toLowerCase().includes(langLabel.toLowerCase())) return name;
    return `${langLabel} · ${name}`;
  }
  if (name) return name;
  if (lang) return languageLabelFromCode(lang);
  return `Traccia ${index + 1}`;
}

function trackMatchesPreference(
  track: MediaPlaylist,
  preference: PreferredAudioLanguage,
): boolean {
  const lang = track.lang?.trim().toLowerCase() ?? "";
  const name = track.name?.trim().toLowerCase() ?? "";
  const label = languageLabelFromCode(lang).toLowerCase();

  if (lang.startsWith(preference) || lang.split("-")[0] === preference) {
    return true;
  }
  if (label.includes(languageLabelFromCode(preference).toLowerCase())) {
    return true;
  }
  if (preference === "it" && (name.includes("ita") || name.includes("ital"))) {
    return true;
  }
  if (preference === "en" && (name.includes("eng") || name.includes("english"))) {
    return true;
  }
  if (preference === "ja" && (name.includes("jap") || name.includes("jpn"))) {
    return true;
  }
  return false;
}

export function pickAudioTrackIndex(
  tracks: MediaPlaylist[],
  preference: PreferredAudioLanguage,
): number | null {
  if (tracks.length <= 1 || preference === "auto") return null;

  const exact = tracks.findIndex((track) =>
    trackMatchesPreference(track, preference),
  );
  return exact >= 0 ? exact : null;
}

export function preferredAudioToStreamingLocale(
  preference: PreferredAudioLanguage,
): string {
  if (preference === "en") return "en";
  return "it";
}
