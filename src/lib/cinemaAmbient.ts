export type Rgb = [number, number, number];

/** Rettangolo del frame visibile con object-fit: contain (px, relativi al contenitore). */
export type CinemaContentRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

/**
 * Calcola dove viene disegnato il video dentro l’elemento (object-fit: contain).
 * Serve per agganciare l’Ambilight ai bordi reali, non ai pillarbox neri.
 */
export function getVideoContentRect(
  video: Pick<HTMLVideoElement, "videoWidth" | "videoHeight">,
  containerW: number,
  containerH: number,
): CinemaContentRect | null {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (vw <= 0 || vh <= 0 || containerW <= 0 || containerH <= 0) return null;

  const videoRatio = vw / vh;
  const boxRatio = containerW / containerH;
  let width: number;
  let height: number;
  if (videoRatio > boxRatio) {
    width = containerW;
    height = containerW / videoRatio;
  } else {
    height = containerH;
    width = containerH * videoRatio;
  }
  return {
    left: (containerW - width) / 2,
    top: (containerH - height) / 2,
    width,
    height,
  };
}

/** Zone Ambilight: bordi + angoli per un alone più dettagliato. */
export type CinemaEdgeColors = {
  left: Rgb;
  right: Rgb;
  top: Rgb;
  bottom: Rgb;
  topLeft: Rgb;
  topRight: Rgb;
  bottomLeft: Rgb;
  bottomRight: Rgb;
  accent: Rgb;
};

export const CINEMA_AMBIENT_KEY = "branchefy-cinema-ambient";

/** Risoluzione bassa: getImageData sul main thread è il costo dominante. */
const SAMPLE_W = 64;
const SAMPLE_H = 36;
const EDGE_STRIP = 5;
const CORNER = 9;
const SAMPLE_STRIDE = 2;

let sharedCanvas: HTMLCanvasElement | null = null;
let sharedCtx: CanvasRenderingContext2D | null = null;
let tainted = false;

function getCanvas() {
  if (!sharedCanvas) {
    sharedCanvas = document.createElement("canvas");
    sharedCanvas.width = SAMPLE_W;
    sharedCanvas.height = SAMPLE_H;
    sharedCtx = sharedCanvas.getContext("2d", {
      willReadFrequently: true,
      alpha: false,
    });
  }
  return { ctx: sharedCtx };
}

/** Rilascia il canvas condiviso (chiamare all’unmount del player). */
export function releaseCinemaAmbientResources(): void {
  sharedCanvas = null;
  sharedCtx = null;
}

export function isCinemaAmbientTainted(): boolean {
  return tainted;
}

export function resetCinemaAmbientTainted(): void {
  tainted = false;
}

export function readCinemaAmbientEnabled(): boolean {
  try {
    return localStorage.getItem(CINEMA_AMBIENT_KEY) === "1";
  } catch {
    return false;
  }
}

export function writeCinemaAmbientEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(CINEMA_AMBIENT_KEY, enabled ? "1" : "0");
  } catch {
    // ignore
  }
}

function clampChannel(n: number): number {
  return Math.max(0, Math.min(255, n));
}

/** Saturazione e luminosità più marcate per l’alone (float, senza quantize). */
export function normalizeCinemaRgb(rgb: Rgb): Rgb {
  const [r, g, b] = rgb;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const lightness = (max + min) / 2 / 255;
  if (lightness < 0.1) {
    return [
      clampChannel(r * 4.2 + 36),
      clampChannel(g * 4.2 + 28),
      clampChannel(b * 4.2 + 52),
    ];
  }
  if (lightness > 0.78) {
    return [
      clampChannel(r * 0.72 + 12),
      clampChannel(g * 0.72 + 10),
      clampChannel(b * 0.76 + 14),
    ];
  }
  const avg = (r + g + b) / 3;
  const boost = 2.05;
  return [
    clampChannel(avg + (r - avg) * boost + 14),
    clampChannel(avg + (g - avg) * boost + 12),
    clampChannel(avg + (b - avg) * boost + 16),
  ];
}

export function lerpRgb(from: Rgb, to: Rgb, t: number): Rgb {
  const k = Math.max(0, Math.min(1, t));
  return [
    from[0] + (to[0] - from[0]) * k,
    from[1] + (to[1] - from[1]) * k,
    from[2] + (to[2] - from[2]) * k,
  ];
}

export function rgbCss(rgb: Rgb, alpha = 1): string {
  // Più precisione = meno banding percepito durante lo smoothing.
  const r = Math.max(0, Math.min(255, rgb[0]));
  const g = Math.max(0, Math.min(255, rgb[1]));
  const b = Math.max(0, Math.min(255, rgb[2]));
  if (alpha >= 1) {
    return `rgb(${r.toFixed(2)} ${g.toFixed(2)} ${b.toFixed(2)})`;
  }
  return `rgb(${r.toFixed(2)} ${g.toFixed(2)} ${b.toFixed(2)} / ${alpha})`;
}

function averageRegion(
  data: Uint8ClampedArray,
  width: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): Rgb {
  let r = 0;
  let g = 0;
  let b = 0;
  let count = 0;
  const left = Math.max(0, Math.floor(x0));
  const top = Math.max(0, Math.floor(y0));
  const right = Math.min(width, Math.ceil(x1));
  const bottom = Math.min(SAMPLE_H, Math.ceil(y1));
  const stride = SAMPLE_STRIDE;

  for (let y = top; y < bottom; y += stride) {
    for (let x = left; x < right; x += stride) {
      const i = (y * width + x) * 4;
      if (data[i + 3] < 20) continue;
      r += data[i];
      g += data[i + 1];
      b += data[i + 2];
      count += 1;
    }
  }
  if (count === 0) return [28, 20, 48];
  return normalizeCinemaRgb([r / count, g / count, b / count]);
}

/** Distanza max canale tra due palette (per skip paint inutili). */
export function cinemaColorsDelta(
  a: CinemaEdgeColors,
  b: CinemaEdgeColors,
): number {
  let max = 0;
  for (const key of Object.keys(a) as (keyof CinemaEdgeColors)[]) {
    const ca = a[key];
    const cb = b[key];
    max = Math.max(
      max,
      Math.abs(ca[0] - cb[0]),
      Math.abs(ca[1] - cb[1]),
      Math.abs(ca[2] - cb[2]),
    );
  }
  return max;
}

/**
 * Campiona i bordi del frame video. Restituisce null se DRM/CORS taint
 * o se il video non è pronto.
 */
export function sampleVideoEdges(
  video: HTMLVideoElement,
): CinemaEdgeColors | null {
  if (tainted) return null;
  if (video.readyState < 2 || video.videoWidth <= 0 || video.videoHeight <= 0) {
    return null;
  }

  const { ctx } = getCanvas();
  if (!ctx) return null;

  try {
    ctx.drawImage(video, 0, 0, SAMPLE_W, SAMPLE_H);
    const { data } = ctx.getImageData(0, 0, SAMPLE_W, SAMPLE_H);
    const s = EDGE_STRIP;
    const c = CORNER;
    const midY0 = SAMPLE_H * 0.22;
    const midY1 = SAMPLE_H * 0.78;
    const midX0 = SAMPLE_W * 0.22;
    const midX1 = SAMPLE_W * 0.78;

    const left = averageRegion(data, SAMPLE_W, 0, midY0, s, midY1);
    const right = averageRegion(
      data,
      SAMPLE_W,
      SAMPLE_W - s,
      midY0,
      SAMPLE_W,
      midY1,
    );
    const top = averageRegion(data, SAMPLE_W, midX0, 0, midX1, s);
    const bottom = averageRegion(
      data,
      SAMPLE_W,
      midX0,
      SAMPLE_H - s,
      midX1,
      SAMPLE_H,
    );
    const topLeft = averageRegion(data, SAMPLE_W, 0, 0, c, c);
    const topRight = averageRegion(data, SAMPLE_W, SAMPLE_W - c, 0, SAMPLE_W, c);
    const bottomLeft = averageRegion(
      data,
      SAMPLE_W,
      0,
      SAMPLE_H - c,
      c,
      SAMPLE_H,
    );
    const bottomRight = averageRegion(
      data,
      SAMPLE_W,
      SAMPLE_W - c,
      SAMPLE_H - c,
      SAMPLE_W,
      SAMPLE_H,
    );
    // Accent derivato (niente secondo passaggio sul centro = meno CPU).
    const accent: Rgb = [
      (left[0] + right[0] + top[0] + bottom[0]) * 0.25,
      (left[1] + right[1] + top[1] + bottom[1]) * 0.25,
      (left[2] + right[2] + top[2] + bottom[2]) * 0.25,
    ];

    return {
      left,
      right,
      top,
      bottom,
      topLeft,
      topRight,
      bottomLeft,
      bottomRight,
      accent,
    };
  } catch {
    tainted = true;
    return null;
  }
}

export const DEFAULT_CINEMA_COLORS: CinemaEdgeColors = {
  left: [48, 28, 88],
  right: [48, 28, 88],
  top: [36, 22, 72],
  bottom: [24, 16, 48],
  topLeft: [52, 30, 96],
  topRight: [52, 30, 96],
  bottomLeft: [32, 18, 64],
  bottomRight: [32, 18, 64],
  accent: [88, 42, 140],
};

export function lerpCinemaColors(
  from: CinemaEdgeColors,
  to: CinemaEdgeColors,
  t: number,
): CinemaEdgeColors {
  return {
    left: lerpRgb(from.left, to.left, t),
    right: lerpRgb(from.right, to.right, t),
    top: lerpRgb(from.top, to.top, t),
    bottom: lerpRgb(from.bottom, to.bottom, t),
    topLeft: lerpRgb(from.topLeft, to.topLeft, t),
    topRight: lerpRgb(from.topRight, to.topRight, t),
    bottomLeft: lerpRgb(from.bottomLeft, to.bottomLeft, t),
    bottomRight: lerpRgb(from.bottomRight, to.bottomRight, t),
    accent: lerpRgb(from.accent, to.accent, t),
  };
}
