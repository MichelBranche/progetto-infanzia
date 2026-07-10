import type { MediaItem } from "../types/media";

export const HERO_POSTER_MS = 14000;
export const HERO_PREVIEW_SEC = 15;
export const CARD_PREVIEW_SEC = 30;
export const CARD_HOVER_DELAY_MS = 350;
/** Attesa dopo espansione hover prima di avviare trailer/anteprima sulla card */
export const CARD_PREVIEW_START_DELAY_MS = 2500;
/** Fallback when CSS variables are unavailable */
export const CARD_WIDTH_COLLAPSED = 188;
export const CARD_WIDTH_EXPANDED = 328;

/**
 * Punto di partenza casuale per le anteprime, evitando solo intro/outro molto brevi.
 */
export function previewStartTime(
  item: MediaItem,
  previewDurationSec: number,
  durationOverride?: number,
): number {
  const duration = durationOverride ?? item.watchDuration ?? 0;
  if (!Number.isFinite(duration) || duration <= 0) return 0;

  const clip = Math.max(1, previewDurationSec);
  if (duration <= clip + 2) return 0;

  const margin =
    duration > 180
      ? Math.min(120, duration * 0.1)
      : duration > 60
        ? Math.min(20, duration * 0.08)
        : Math.min(6, duration * 0.06);

  const minStart = margin;
  const maxStart = duration - clip - margin;

  if (maxStart <= minStart) {
    return Math.max(0, (duration - clip) * 0.5);
  }

  return minStart + Math.random() * (maxStart - minStart);
}
