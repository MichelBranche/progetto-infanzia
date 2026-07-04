import { invoke, isTauri } from "@tauri-apps/api/core";



export interface AppSettings {

  introSoundEnabled: boolean;

  subscribedServices: string[];

  mediaRoot: string;

  lastScan?: string;

  streamPort: number;

  tmdbApiKey?: string;

  tmdbEnrichOnScan: boolean;

  castTranscodeEnabled: boolean;

  preferredAudioLanguage: string;

}



export interface UpdateSettingsInput {

  introSoundEnabled?: boolean;

  subscribedServices?: string[];

  tmdbApiKey?: string;

  tmdbEnrichOnScan?: boolean;

  castTranscodeEnabled?: boolean;

  preferredAudioLanguage?: string;

}



export const INTRO_SOUND_KEY = "branchefy-intro-sound";



const DEFAULT_BROWSER_SETTINGS: AppSettings = {

  introSoundEnabled: true,

  subscribedServices: [],

  mediaRoot: "",

  streamPort: 8765,

  tmdbEnrichOnScan: false,

  castTranscodeEnabled: false,

  preferredAudioLanguage: "auto",

};



export async function fetchSettings(): Promise<AppSettings> {

  if (!isTauri()) {

    return DEFAULT_BROWSER_SETTINGS;

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


