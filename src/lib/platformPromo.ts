import { IS_TAURI_SHELL } from "./tauriShell";

const DEFAULT_WEB_APP_URL = "https://branchefy.it";

/** URL della web app (mobile/tablet nel browser). */
export const APP_WEB_URL =
  import.meta.env.VITE_BRANCHEFY_WEB_URL?.trim() || DEFAULT_WEB_APP_URL;

export type PlatformPromoVariant = "desktop-app" | "mobile-web";

/** Card desktop su shell mobile web; card mobile-web su desktop Tauri o browser largo. */
export function homePlatformPromoVariant(
  isCompactShell: boolean,
): PlatformPromoVariant {
  if (!IS_TAURI_SHELL && isCompactShell) return "desktop-app";
  return "mobile-web";
}
