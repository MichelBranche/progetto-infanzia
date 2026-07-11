import { isTauri } from "@tauri-apps/api/core";
import { runtimeInvoke as invoke } from "./runtimeInvoke";

export type RgbAccent = [number, number, number];

export interface AmbientPalette {
  hues: [number, number, number];
  accents: [RgbAccent, RgbAccent, RgbAccent];
}

export const DEFAULT_AMBIENT_PALETTE: AmbientPalette = {
  hues: [275, 285, 262],
  accents: [
    [88, 28, 135],
    [59, 7, 100],
    [49, 10, 80],
  ],
};

const GRADIENT_HUE_HINTS: Array<{ key: string; hue: number }> = [
  { key: "indigo", hue: 239 },
  { key: "violet", hue: 270 },
  { key: "purple", hue: 275 },
  { key: "fuchsia", hue: 292 },
  { key: "rose", hue: 350 },
  { key: "pink", hue: 330 },
  { key: "orange", hue: 28 },
  { key: "amber", hue: 38 },
  { key: "red", hue: 8 },
  { key: "emerald", hue: 160 },
  { key: "teal", hue: 175 },
  { key: "cyan", hue: 195 },
  { key: "blue", hue: 220 },
  { key: "slate", hue: 225 },
];

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const lightness = (max + min) / 2;
  let hue = 0;
  let saturation = 0;

  if (max !== min) {
    const delta = max - min;
    saturation =
      lightness > 0.5 ? delta / (2 - max - min) : delta / (max + min);
    switch (max) {
      case rn:
        hue = ((gn - bn) / delta + (gn < bn ? 6 : 0)) / 6;
        break;
      case gn:
        hue = ((bn - rn) / delta + 2) / 6;
        break;
      default:
        hue = ((rn - gn) / delta + 4) / 6;
        break;
    }
  }

  return [hue * 360, saturation * 100, lightness * 100];
}

function hueToChannel(p: number, q: number, t: number): number {
  let tk = t;
  if (tk < 0) tk += 1;
  if (tk > 1) tk -= 1;
  if (tk < 1 / 6) return p + (q - p) * 6 * tk;
  if (tk < 1 / 2) return q;
  if (tk < 2 / 3) return p + (q - p) * (2 / 3 - tk) * 6;
  return p;
}

export function hslToRgb(h: number, s: number, l: number): RgbAccent {
  const sn = Math.max(0, Math.min(100, s)) / 100;
  const ln = Math.max(0, Math.min(100, l)) / 100;
  if (sn <= 0.0001) {
    const v = Math.round(ln * 255);
    return [v, v, v];
  }

  const q = ln < 0.5 ? ln * (1 + sn) : ln + sn - ln * sn;
  const p = 2 * ln - q;
  const hk = ((h % 360) + 360) % 360 / 360;
  return [
    Math.round(hueToChannel(p, q, hk + 1 / 3) * 255),
    Math.round(hueToChannel(p, q, hk) * 255),
    Math.round(hueToChannel(p, q, hk - 1 / 3) * 255),
  ];
}

export function accentCss(rgb: RgbAccent, alpha = 1): string {
  return `rgb(${rgb[0]} ${rgb[1]} ${rgb[2]} / ${alpha})`;
}

function paletteFromHues(hues: [number, number, number]): AmbientPalette {
  return {
    hues,
    accents: [
      hslToRgb(hues[0], 78, 48),
      hslToRgb(hues[1], 72, 42),
      hslToRgb(hues[2], 68, 36),
    ],
  };
}

export function paletteFromGradient(gradient?: string): AmbientPalette | null {
  if (!gradient) return null;

  const hues: number[] = [];
  for (const hint of GRADIENT_HUE_HINTS) {
    if (gradient.includes(hint.key)) hues.push(hint.hue);
  }

  if (hues.length === 0) return null;

  const primary = hues[0];
  const secondary = hues[1] ?? (primary + 22) % 360;
  const tertiary = hues[2] ?? (primary - 16 + 360) % 360;
  return paletteFromHues([primary, secondary, tertiary]);
}

interface BucketStat {
  weight: number;
  rSum: number;
  gSum: number;
  bSum: number;
  count: number;
}

function accentFromBucket(stat: BucketStat): RgbAccent {
  if (stat.count === 0) return DEFAULT_AMBIENT_PALETTE.accents[0];
  return boostAccentRgb(
    [
      Math.round(stat.rSum / stat.count),
      Math.round(stat.gSum / stat.count),
      Math.round(stat.bSum / stat.count),
    ],
    46,
    58,
  );
}

function boostAccentRgb(
  rgb: RgbAccent,
  minLightness: number,
  minSaturation: number,
): RgbAccent {
  const [h, s, l] = rgbToHsl(rgb[0], rgb[1], rgb[2]);
  return hslToRgb(h, Math.max(s, minSaturation), Math.max(l, minLightness));
}

export function boostAmbientPalette(palette: AmbientPalette): AmbientPalette {
  return {
    hues: palette.hues,
    accents: [
      boostAccentRgb(palette.accents[0], 46, 58),
      boostAccentRgb(palette.accents[1], 40, 52),
      boostAccentRgb(palette.accents[2], 34, 48),
    ],
  };
}

function extractPaletteFromPixels(data: Uint8ClampedArray): AmbientPalette | null {
  const buckets = new Map<number, BucketStat>();

  for (let i = 0; i < data.length; i += 4) {
    const alpha = data[i + 3];
    if (alpha < 40) continue;

    const [hue, saturation, lightness] = rgbToHsl(
      data[i],
      data[i + 1],
      data[i + 2],
    );
    if (lightness < 8 || lightness > 88 || saturation < 12) continue;

    const bucket = Math.round(hue / 16) * 16;
    const entry = buckets.get(bucket) ?? {
      weight: 0,
      rSum: 0,
      gSum: 0,
      bSum: 0,
      count: 0,
    };
    entry.weight += saturation * Math.max(0.4, lightness / 52);
    entry.rSum += data[i];
    entry.gSum += data[i + 1];
    entry.bSum += data[i + 2];
    entry.count += 1;
    buckets.set(bucket, entry);
  }

  const sorted = [...buckets.entries()].sort((a, b) => b[1].weight - a[1].weight);
  if (sorted.length === 0) return null;

  const primary = sorted[0][0];
  const secondary = sorted[1]?.[0] ?? (primary + 24) % 360;
  const tertiary = sorted[2]?.[0] ?? (primary - 20 + 360) % 360;

  return {
    hues: [primary, secondary, tertiary],
    accents: [
      accentFromBucket(sorted[0][1]),
      sorted[1] ? accentFromBucket(sorted[1][1]) : hslToRgb(secondary, 72, 42),
      sorted[2] ? accentFromBucket(sorted[2][1]) : hslToRgb(tertiary, 68, 36),
    ],
  };
}

export function extractPaletteFromImage(
  image: HTMLImageElement,
): AmbientPalette | null {
  if (!image.naturalWidth || !image.naturalHeight) return null;

  const canvas = document.createElement("canvas");
  const size = 64;
  canvas.width = size;
  canvas.height = size;

  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;

  try {
    const sourceWidth = image.naturalWidth;
    const sourceHeight = image.naturalHeight;
    const aspect = sourceWidth / sourceHeight;
    if (aspect < 0.85) {
      const cropSize = Math.min(sourceWidth, sourceHeight);
      const sx = Math.floor((sourceWidth - cropSize) / 2);
      const sy = Math.floor((sourceHeight - cropSize) / 2);
      ctx.drawImage(image, sx, sy, cropSize, cropSize, 0, 0, size, size);
    } else {
      const cropWidth = Math.max(1, Math.floor(sourceWidth * 0.52));
      ctx.drawImage(
        image,
        0,
        0,
        cropWidth,
        sourceHeight,
        0,
        0,
        size,
        size,
      );
    }
    const { data } = ctx.getImageData(0, 0, size, size);
    return extractPaletteFromPixels(data);
  } catch {
    return null;
  }
}

export function resolveAmbientPalette(
  image: HTMLImageElement | null,
  gradient?: string,
): AmbientPalette {
  if (image) {
    const fromImage = extractPaletteFromImage(image);
    if (fromImage) return fromImage;
  }
  return paletteFromGradient(gradient) ?? DEFAULT_AMBIENT_PALETTE;
}

export async function resolveAmbientPaletteAsync(
  image: HTMLImageElement | null,
  imageUrl: string | undefined,
  gradient?: string,
): Promise<AmbientPalette> {
  if (image) {
    const fromImage = extractPaletteFromImage(image);
    if (fromImage) return fromImage;
  }
  if (imageUrl) {
    const fromUrl = await extractPaletteFromUrlRemote(imageUrl);
    if (fromUrl) return fromUrl;
  }
  return paletteFromGradient(gradient) ?? DEFAULT_AMBIENT_PALETTE;
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image load failed"));
    img.src = url;
  });
}

async function extractPaletteFromUrlRemote(
  url: string,
): Promise<AmbientPalette | null> {
  if (isTauri()) {
    try {
      const result = await invoke<{
        hues: [number, number, number];
        accents: [RgbAccent, RgbAccent, RgbAccent];
      }>("extract_image_palette_cmd", { url });
      if (result?.hues?.length === 3 && result.accents?.length === 3) {
        return { hues: result.hues, accents: result.accents };
      }
    } catch {
      // fall through to browser fetch
    }
  }

  try {
    const img = await loadImage(url);
    return extractPaletteFromImage(img);
  } catch {
    return null;
  }
}

export async function extractAmbientPaletteFromUrl(
  url: string | undefined,
  gradient?: string,
): Promise<AmbientPalette> {
  if (url) {
    const fromImage = await extractPaletteFromUrlRemote(url);
    if (fromImage) return fromImage;
  }
  return paletteFromGradient(gradient) ?? DEFAULT_AMBIENT_PALETTE;
}

export function lerpHue(current: number, target: number, amount: number): number {
  let delta = target - current;
  if (delta > 180) delta -= 360;
  if (delta < -180) delta += 360;
  return (current + delta * amount + 360) % 360;
}

function lerpChannel(current: number, target: number, amount: number): number {
  return current + (target - current) * amount;
}

function lerpAccent(current: RgbAccent, target: RgbAccent, amount: number): RgbAccent {
  return [
    Math.round(lerpChannel(current[0], target[0], amount)),
    Math.round(lerpChannel(current[1], target[1], amount)),
    Math.round(lerpChannel(current[2], target[2], amount)),
  ];
}

export function lerpPalette(
  current: AmbientPalette,
  target: AmbientPalette,
  amount: number,
): AmbientPalette {
  return {
    hues: [
      lerpHue(current.hues[0], target.hues[0], amount),
      lerpHue(current.hues[1], target.hues[1], amount),
      lerpHue(current.hues[2], target.hues[2], amount),
    ],
    accents: [
      lerpAccent(current.accents[0], target.accents[0], amount),
      lerpAccent(current.accents[1], target.accents[1], amount),
      lerpAccent(current.accents[2], target.accents[2], amount),
    ],
  };
}

export function clonePalette(palette: AmbientPalette): AmbientPalette {
  return {
    hues: [...palette.hues] as AmbientPalette["hues"],
    accents: palette.accents.map((accent) => [...accent] as RgbAccent) as AmbientPalette["accents"],
  };
}

const heroPaletteCache = new Map<string, AmbientPalette>();

export function getCachedHeroPalette(id: string): AmbientPalette | undefined {
  const cached = heroPaletteCache.get(id);
  return cached ? clonePalette(cached) : undefined;
}

export function cacheHeroPalette(id: string, palette: AmbientPalette): void {
  heroPaletteCache.set(id, boostAmbientPalette(palette));
}

export async function prefetchHeroPalette(
  id: string,
  imageUrl: string | undefined,
  gradient?: string,
): Promise<AmbientPalette | null> {
  const cached = heroPaletteCache.get(id);
  if (cached) return clonePalette(cached);

  const palette = await extractAmbientPaletteFromUrl(imageUrl, gradient);
  heroPaletteCache.set(id, palette);
  return clonePalette(palette);
}
