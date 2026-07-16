import { runtimeInvoke as invoke, usesBackendApi } from "./runtimeInvoke";

export interface AppSettings {
  introSoundEnabled: boolean;
  homeCardSoundsEnabled: boolean;
  subscribedServices: string[];
  mediaRoot: string;
  lastScan?: string;
  streamPort: number;
  tmdbApiKey?: string;
  tmdbEnrichOnScan: boolean;
  castTranscodeEnabled: boolean;
  preferredAudioLanguage: string;
  scProxyEnabled: boolean;
  scProxyUrl: string;
}

export interface UpdateSettingsInput {
  introSoundEnabled?: boolean;
  homeCardSoundsEnabled?: boolean;
  subscribedServices?: string[];
  tmdbApiKey?: string;
  tmdbEnrichOnScan?: boolean;
  castTranscodeEnabled?: boolean;
  preferredAudioLanguage?: string;
  scProxyEnabled?: boolean;
  scProxyUrl?: string;
}

export const INTRO_SOUND_KEY = "branchefy-intro-sound";
export const HOME_CARD_SOUNDS_KEY = "branchefy-home-card-sounds";

const DEFAULT_BROWSER_SETTINGS: AppSettings = {
  introSoundEnabled: true,
  homeCardSoundsEnabled: true,
  subscribedServices: [],
  mediaRoot: "",
  streamPort: 8765,
  tmdbEnrichOnScan: false,
  castTranscodeEnabled: false,
  preferredAudioLanguage: "auto",
  scProxyEnabled: false,
  scProxyUrl: "",
};

export async function fetchSettings(): Promise<AppSettings> {
  if (!usesBackendApi()) {
    return {
      ...DEFAULT_BROWSER_SETTINGS,
      introSoundEnabled: readIntroSoundPref(),
      homeCardSoundsEnabled: readHomeCardSoundsPref(),
    };
  }
  return invoke<AppSettings>("get_settings_cmd");
}

export async function updateSettings(
  profileId: string,
  input: UpdateSettingsInput,
): Promise<AppSettings> {
  const settings = await invoke<AppSettings>("update_settings_cmd", {
    profileId,
    input,
  });
  if (input.introSoundEnabled !== undefined) {
    localStorage.setItem(INTRO_SOUND_KEY, String(input.introSoundEnabled));
  }
  if (input.homeCardSoundsEnabled !== undefined) {
    localStorage.setItem(
      HOME_CARD_SOUNDS_KEY,
      String(input.homeCardSoundsEnabled),
    );
  }
  return settings;
}

export async function setMediaRoot(path: string) {
  return invoke<{ added: number; updated: number; removed: number; total: number }>(
    "set_media_root_cmd",
    { path },
  );
}

export function readIntroSoundPref(): boolean {
  const stored = localStorage.getItem(INTRO_SOUND_KEY);
  if (stored === null) return true;
  return stored !== "false";
}

export function readHomeCardSoundsPref(): boolean {
  const stored = localStorage.getItem(HOME_CARD_SOUNDS_KEY);
  if (stored === null) return true;
  return stored !== "false";
}
