/** True on Android/iOS WebViews and mobile browsers. */
export function isMobilePlatform(): boolean {
  if (typeof navigator === "undefined") return false;
  return /android|iphone|ipad|ipod/i.test(navigator.userAgent);
}

/** LAN watch party and LAN friends are desktop-only. */
export function isLanFeaturesEnabled(): boolean {
  return !isMobilePlatform();
}
