import { isWebShell } from "./runtimeInvoke";
import { detectMobileDevice } from "./mobileDevice";

/** True on phones, tablets (iPad/iPad Pro), and touch-first mobile browsers. */
export function isMobilePlatform(): boolean {
  return detectMobileDevice();
}
/** LAN watch party and LAN friends are desktop Tauri only. */
export function isLanFeaturesEnabled(): boolean {
  if (isWebShell()) return false;
  return !isMobilePlatform();
}
