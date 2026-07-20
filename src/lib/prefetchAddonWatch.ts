/**
 * Prefetch del dettaglio streaming (chunk JS + meta) al hover sulle card.
 * AddonWatchPage legge la stessa cache cosi' l'apertura e' istantanea se
 * il fetch e' gia' finito (o quasi).
 */

import type { BrowseItem } from "./browse";
import type { AddonWatchTarget } from "./streamingBrowse";
import { previewToDetailTarget } from "./streamingBrowse";
import type { StremioMeta } from "../types/stremio";

const PREFETCH_DELAY_MS = 150;
const META_TTL_MS = 5 * 60_000;

let chunkPromise: Promise<unknown> | null = null;
let watchPageChunkPromise: Promise<unknown> | null = null;

type MetaCacheEntry = { at: number; data: StremioMeta };

const metaCache = new Map<string, MetaCacheEntry>();
const metaInflight = new Map<string, Promise<StremioMeta>>();

function metaCacheKey(target: AddonWatchTarget): string {
  return `${target.catalogPrefix ?? "addon"}:${target.contentType}:${target.metaId}:${target.slug ?? ""}`;
}

/** Precarica il chunk lazy di AddonWatchPage (una sola volta). */
export function prefetchAddonWatchChunk(): Promise<unknown> {
  if (!chunkPromise) {
    chunkPromise = import("../components/AddonWatchPage");
  }
  return chunkPromise;
}

/** Precarica WatchPage per titoli della libreria locale. */
export function prefetchWatchPageChunk(): Promise<unknown> {
  if (!watchPageChunkPromise) {
    watchPageChunkPromise = import("../components/WatchPage");
  }
  return watchPageChunkPromise;
}

export function getCachedAddonMeta(
  target: AddonWatchTarget,
): StremioMeta | null {
  const key = metaCacheKey(target);
  const hit = metaCache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > META_TTL_MS) {
    metaCache.delete(key);
    return null;
  }
  return hit.data;
}

export function putCachedAddonMeta(
  target: AddonWatchTarget,
  data: StremioMeta,
): void {
  metaCache.set(metaCacheKey(target), { at: Date.now(), data });
}

/**
 * Prefetch meta solo per cataloghi builtin (non serve profileId).
 * Gli addon generici restano al click.
 */
export async function prefetchAddonWatchMeta(
  target: AddonWatchTarget,
): Promise<StremioMeta | null> {
  const cached = getCachedAddonMeta(target);
  if (cached) return cached;

  const prefix = target.catalogPrefix;
  const canPrefetch =
    (prefix === "sc" && target.slug) ||
    (prefix === "saturn" && target.slug) ||
    (prefix === "loonex" && target.slug) ||
    (prefix === "youtube" && target.slug);
  if (!canPrefetch) return null;

  const key = metaCacheKey(target);
  const existing = metaInflight.get(key);
  if (existing) return existing;

  const promise = (async () => {
    const api = await import("./addonsApi");
    let data: StremioMeta;
    if (prefix === "sc") {
      data = await api.fetchScMeta(target.metaId, target.slug!);
    } else if (prefix === "saturn") {
      data = await api.fetchSaturnMeta(target.slug!);
    } else if (prefix === "loonex") {
      data = await api.fetchLoonexMeta(target.slug!);
    } else {
      data = await api.fetchYoutubeMeta(target.slug!);
    }
    putCachedAddonMeta(target, data);
    return data;
  })().finally(() => {
    metaInflight.delete(key);
  });

  metaInflight.set(key, promise);
  return promise;
}

/**
 * Schedula prefetch al pointerenter. Ritorna la funzione di cancel
 * (pointerleave / unmount).
 */
export function scheduleBrowseDetailPrefetch(browse: BrowseItem): () => void {
  const timer = window.setTimeout(() => {
    if (browse.kind === "streaming") {
      void prefetchAddonWatchChunk();
      void prefetchAddonWatchMeta(previewToDetailTarget(browse.preview));
      return;
    }
    if (browse.kind === "media") {
      void prefetchWatchPageChunk();
    }
  }, PREFETCH_DELAY_MS);

  return () => window.clearTimeout(timer);
}
