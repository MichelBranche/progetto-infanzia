import { openExternal } from "./openExternal";

export const APP_GITHUB_REPO_URL =
  "https://github.com/MichelBranche/progetto-infanzia";

const DEFAULT_DOWNLOAD_URL = "https://download-branchefy.vercel.app/";

/** Landing download (ultima release). Imposta VITE_DOWNLOAD_PAGE_URL in .env. */
export const APP_DOWNLOAD_URL =
  import.meta.env.VITE_DOWNLOAD_PAGE_URL?.trim() || DEFAULT_DOWNLOAD_URL;

export async function shareBranchefyApp(): Promise<{ copied: boolean }> {
  await openExternal(APP_DOWNLOAD_URL);
  try {
    await navigator.clipboard.writeText(APP_DOWNLOAD_URL);
    return { copied: true };
  } catch {
    return { copied: false };
  }
}
