import { openExternal } from "./openExternal";

export const APP_GITHUB_REPO_URL =
  "https://github.com/MichelBranche/progetto-infanzia";

/** Pagina release con installer Windows / macOS. */
export const APP_DOWNLOAD_URL = `${APP_GITHUB_REPO_URL}/releases`;

export async function shareBranchefyApp(): Promise<{ copied: boolean }> {
  await openExternal(APP_DOWNLOAD_URL);
  try {
    await navigator.clipboard.writeText(APP_DOWNLOAD_URL);
    return { copied: true };
  } catch {
    return { copied: false };
  }
}
