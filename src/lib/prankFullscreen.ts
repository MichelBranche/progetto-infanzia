import { IS_TAURI_SHELL } from "./tauriShell";

export interface PrankFullscreenHandle {
  restore: () => Promise<void>;
}

/**
 * Porta l’app a schermo intero “sistema” per scherzi invasivi (BSOD).
 * Desktop: fullscreen nativo + niente decorations.
 * Web: Fullscreen API sul documentElement (richiede gesture in alcuni browser;
 * da evento realtime può fallire in silenzio).
 */
export async function enterPrankFullscreen(): Promise<PrankFullscreenHandle> {
  if (IS_TAURI_SHELL) {
    try {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      const win = getCurrentWindow();
      const wasFullscreen = await win.isFullscreen().catch(() => false);
      const wasDecorated = await win.isDecorated().catch(() => true);
      const wasOnTop = await win.isAlwaysOnTop().catch(() => false);

      await win.setDecorations(false).catch(() => undefined);
      await win.setFullscreen(true).catch(() => undefined);
      await win.setAlwaysOnTop(true).catch(() => undefined);
      await win.setFocus().catch(() => undefined);

      return {
        restore: async () => {
          await win.setAlwaysOnTop(wasOnTop).catch(() => undefined);
          await win.setFullscreen(wasFullscreen).catch(() => undefined);
          await win.setDecorations(wasDecorated).catch(() => undefined);
        },
      };
    } catch (err) {
      console.warn("[prank-fullscreen] tauri failed", err);
    }
  }

  const el = document.documentElement;
  const hadFs = Boolean(document.fullscreenElement);
  try {
    if (!hadFs && el.requestFullscreen) {
      await el.requestFullscreen({ navigationUI: "hide" } as FullscreenOptions);
    }
  } catch (err) {
    console.warn("[prank-fullscreen] web failed", err);
  }

  return {
    restore: async () => {
      try {
        if (!hadFs && document.fullscreenElement && document.exitFullscreen) {
          await document.exitFullscreen();
        }
      } catch {
        // ignore
      }
    },
  };
}
