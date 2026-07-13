import { getVersion } from "@tauri-apps/api/app";
import { check, type DownloadEvent, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { isTauri } from "@tauri-apps/api/core";
import { isEssentialUpdate } from "./updateNotes";

const DISMISS_KEY = "branchefy-updater-dismissed";

export type UpdaterPhase =
  | "idle"
  | "checking"
  | "available"
  | "downloading"
  | "installing"
  | "up-to-date"
  | "error";

export interface UpdaterProgress {
  downloaded: number;
  total: number | null;
}

export function isUpdaterSupported(): boolean {
  return isTauri() && import.meta.env.PROD;
}

function readDismissedVersion(): string | null {
  try {
    return localStorage.getItem(DISMISS_KEY);
  } catch {
    return null;
  }
}

export function dismissUpdateVersion(version: string, body?: string | null): void {
  if (isEssentialUpdate(body)) return;
  try {
    localStorage.setItem(DISMISS_KEY, version);
  } catch {
    /* ignore */
  }
}

export function isMandatoryUpdate(update: Update): boolean {
  return isEssentialUpdate(update.body);
}

export async function fetchAppVersion(): Promise<string> {
  if (!isTauri()) return import.meta.env.VITE_APP_VERSION ?? "dev";
  return getVersion();
}

export async function checkForAppUpdate(): Promise<Update | null> {
  if (!isUpdaterSupported()) return null;
  const update = await check();
  if (!update) return null;
  if (
    readDismissedVersion() === update.version &&
    !isEssentialUpdate(update.body)
  ) {
    return null;
  }
  return update;
}

export async function downloadAndInstallUpdate(
  update: Update,
  onProgress?: (progress: UpdaterProgress) => void,
): Promise<void> {
  let downloaded = 0;
  let total: number | null = null;

  await update.downloadAndInstall((event: DownloadEvent) => {
    switch (event.event) {
      case "Started":
        total = event.data.contentLength ?? null;
        downloaded = 0;
        onProgress?.({ downloaded, total });
        break;
      case "Progress":
        downloaded += event.data.chunkLength;
        onProgress?.({ downloaded, total });
        break;
      case "Finished":
        onProgress?.({ downloaded, total });
        break;
    }
  });
}

export async function relaunchApp(): Promise<void> {
  await relaunch();
}
