import { IS_TAURI_SHELL } from "./tauriShell";
import { IDIOT_VIDEO_SRC } from "../types/adminPrank";

const WINDOW_COUNT = 7;
const PRANK_MS = 20_000;
const SYNC_DELAY_MS = 900;

export interface IdiotPrankSync {
  startAt: number;
  endAt: number;
}

function buildPrankUrl(sync: IdiotPrankSync, muted: boolean): string {
  const qs = new URLSearchParams({
    startAt: String(sync.startAt),
    endAt: String(sync.endAt),
  });
  if (muted) qs.set("muted", "1");
  return `idiot-prank.html?${qs.toString()}`;
}

function scatterPositions(
  screenW: number,
  screenH: number,
  count: number,
): Array<{ x: number; y: number; w: number; h: number }> {
  const slots = [
    { x: 0.04, y: 0.06, w: 0.34, h: 0.32 },
    { x: 0.38, y: 0.04, w: 0.36, h: 0.3 },
    { x: 0.62, y: 0.28, w: 0.34, h: 0.34 },
    { x: 0.08, y: 0.38, w: 0.32, h: 0.34 },
    { x: 0.42, y: 0.42, w: 0.34, h: 0.32 },
    { x: 0.2, y: 0.12, w: 0.3, h: 0.28 },
    { x: 0.55, y: 0.55, w: 0.36, h: 0.34 },
  ];
  return Array.from({ length: count }, (_, i) => {
    const s = slots[i % slots.length];
    const w = Math.max(280, Math.round(screenW * s.w));
    const h = Math.max(200, Math.round(screenH * s.h));
    const x = Math.round(screenW * s.x);
    const y = Math.round(screenH * s.y);
    return {
      x: Math.min(x, Math.max(0, screenW - w)),
      y: Math.min(y, Math.max(0, screenH - h)),
      w,
      h,
    };
  });
}

async function openTauriIdiotWindows(sync: IdiotPrankSync): Promise<() => void> {
  const { WebviewWindow } = await import("@tauri-apps/api/webviewWindow");
  const { currentMonitor, primaryMonitor } = await import("@tauri-apps/api/window");
  const monitor = (await currentMonitor()) ?? (await primaryMonitor());
  const scale = monitor?.scaleFactor || 1;
  const screenW = monitor?.size.width
    ? Math.round(monitor.size.width / scale)
    : 1280;
  const screenH = monitor?.size.height
    ? Math.round(monitor.size.height / scale)
    : 800;
  const originX = monitor?.position.x
    ? Math.round(monitor.position.x / scale)
    : 0;
  const originY = monitor?.position.y
    ? Math.round(monitor.position.y / scale)
    : 0;

  const positions = scatterPositions(screenW, screenH, WINDOW_COUNT);
  const labels: string[] = [];
  const batch = Date.now();

  for (let i = 0; i < positions.length; i++) {
    const pos = positions[i];
    const label = `idiot-${batch}-${i}`;
    labels.push(label);
    // Audio solo sulla finestra principale dell'app: le schede restano mute e sync.
    const url = buildPrankUrl(sync, true);
    const webview = new WebviewWindow(label, {
      url,
      title: "You are an idiot!",
      width: pos.w,
      height: pos.h,
      x: originX + pos.x,
      y: originY + pos.y,
      resizable: false,
      decorations: true,
      focus: i === 0,
      alwaysOnTop: true,
      skipTaskbar: false,
      visible: true,
    });
    webview.once("tauri://error", (event) => {
      console.warn("[idiot-prank] window error", label, event);
    });
  }

  const closeAll = () => {
    for (const label of labels) {
      void WebviewWindow.getByLabel(label).then((w) => {
        void w?.close();
      });
    }
  };

  window.setTimeout(closeAll, Math.max(0, sync.endAt - Date.now()) + 200);
  return closeAll;
}

function openBrowserIdiotPopups(sync: IdiotPrankSync): () => void {
  const opened: Window[] = [];
  const screenW = window.screen.availWidth || 1280;
  const screenH = window.screen.availHeight || 800;
  const positions = scatterPositions(screenW, screenH, WINDOW_COUNT);

  for (const pos of positions) {
    const url = `/${buildPrankUrl(sync, true)}`;
    const features = [
      `width=${pos.w}`,
      `height=${pos.h}`,
      `left=${pos.x}`,
      `top=${pos.y}`,
      "noopener=no",
      "noreferrer=no",
    ].join(",");
    const w = window.open(url, `idiot-${Date.now()}-${opened.length}`, features);
    if (w) opened.push(w);
  }

  const closeAll = () => {
    for (const w of opened) {
      try {
        w.close();
      } catch {
        // ignore
      }
    }
  };
  window.setTimeout(closeAll, Math.max(0, sync.endAt - Date.now()) + 200);
  return closeAll;
}

/** Apre tante schede/finestre col video sincronizzato. Restituisce cleanup. */
export async function openIdiotPrankWindows(): Promise<{
  sync: IdiotPrankSync;
  closeAll: () => void;
}> {
  const startAt = Date.now() + SYNC_DELAY_MS;
  const endAt = startAt + PRANK_MS;
  const sync = { startAt, endAt };

  // Preload audio/video in background sulla pagina principale.
  try {
    const warm = document.createElement("video");
    warm.preload = "auto";
    warm.src = IDIOT_VIDEO_SRC;
    warm.load();
  } catch {
    // ignore
  }

  const closeAll = IS_TAURI_SHELL
    ? await openTauriIdiotWindows(sync)
    : openBrowserIdiotPopups(sync);

  return { sync, closeAll };
}

export { PRANK_MS, SYNC_DELAY_MS };
