/**
 * Detect phones and tablets (iPad, iPad Pro, Android tablets) for mobile shell UI.
 * Uses UA + touch heuristics — not viewport width — so iPad Pro at 1024px still gets mobile layout.
 */
export function detectMobileDevice(): boolean {
  if (typeof navigator === "undefined" || typeof window === "undefined") {
    return false;
  }

  const ua = navigator.userAgent;
  const platform = navigator.platform ?? "";

  if (/android|iphone|ipod|ipad|mobile|tablet|silk|kindle|webos|blackberry/i.test(ua)) {
    return true;
  }

  // iPadOS 13+: Safari reports Macintosh + multi-touch.
  if (
    (platform === "MacIntel" || /Macintosh/i.test(ua)) &&
    navigator.maxTouchPoints > 1
  ) {
    return true;
  }

  // Android tablets often omit "Mobile" in the UA.
  if (/android/i.test(ua) && !/mobile/i.test(ua)) {
    return true;
  }

  // Touch-first devices without precise pointer (most tablets in browser).
  const coarse = window.matchMedia("(pointer: coarse)").matches;
  const hoverNone = window.matchMedia("(hover: none)").matches;
  if (coarse && hoverNone && navigator.maxTouchPoints > 0) {
    const shortSide = Math.min(window.screen.width, window.screen.height);
    const longSide = Math.max(window.screen.width, window.screen.height);
    // Up to iPad Pro 12.9" (1024×1366) and similar tablets.
    if (shortSide <= 1024 && longSide <= 1366) {
      return true;
    }
  }

  // Touch tablet screens (iPad window, embedded browsers with coarse pointer).
  if (navigator.maxTouchPoints > 0 && window.matchMedia("(pointer: coarse)").matches) {
    const shortSide = Math.min(window.screen.width, window.screen.height);
    const longSide = Math.max(window.screen.width, window.screen.height);
    if (shortSide >= 600 && shortSide <= 1100 && longSide <= 1400) {
      return true;
    }
  }

  return false;
}

/** Viewport + touch tablets: compact shell (bottom nav, mobile top bar). */
export const COMPACT_SHELL_MEDIA = "(max-width: 1024px)";

export function detectCompactShell(): boolean {
  if (typeof window === "undefined") return detectMobileDevice();
  return (
    detectMobileDevice() ||
    window.matchMedia(COMPACT_SHELL_MEDIA).matches
  );
}

export interface ShellLayoutState {
  mobile: boolean;
  compact: boolean;
}

/** Sync <html> layout classes before first paint to avoid nav flash. */
export function syncShellLayoutClasses(): ShellLayoutState {
  const mobile = detectMobileDevice();
  const compact = detectCompactShell();
  if (typeof document !== "undefined") {
    const root = document.documentElement;
    root.classList.toggle("lf-mobile-device", mobile);
    root.classList.toggle("lf-compact-shell", compact);
    root.dataset.mobileDevice = mobile ? "1" : "0";
    root.dataset.compactShell = compact ? "1" : "0";
  }
  return { mobile, compact };
}

/** @deprecated Use syncShellLayoutClasses */
export function syncMobileDeviceClass(): boolean {
  return syncShellLayoutClasses().mobile;
}
