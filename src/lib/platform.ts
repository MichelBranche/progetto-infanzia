import { isWebShell } from "./runtimeInvoke";
import { detectMobileDevice } from "./mobileDevice";
import { IS_TAURI_SHELL } from "./tauriShell";

/** True on phones, tablets (iPad/iPad Pro), and touch-first mobile browsers. */
export function isMobilePlatform(): boolean {
  return detectMobileDevice();
}

/** Desktop Tauri su macOS (WebKit), non iPad/iPhone. */
export function isDesktopMacOs(): boolean {
  if (!IS_TAURI_SHELL || isMobilePlatform()) return false;
  if (typeof navigator === "undefined") return false;
  const platform = navigator.platform ?? "";
  const ua = navigator.userAgent ?? "";
  return /Mac/i.test(platform) || /Mac OS X/i.test(ua);
}

/** LAN watch party and LAN friends are desktop Tauri only. */
export function isLanFeaturesEnabled(): boolean {
  if (isWebShell()) return false;
  return !isMobilePlatform();
}
