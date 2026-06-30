import { fetchScCatalog, refreshScCatalog } from "./addonsApi";
import type { StremioMetaPreview } from "../types/stremio";
import type { StreamingRow } from "./useStreamingCatalogs";

export interface BootCatalogPayload {
  rows: StreamingRow[];
  index: StremioMetaPreview[];
  syncedAt: number;
  totalCount: number;
  error: string | null;
}

let cache: BootCatalogPayload | null = null;
let inflight: Promise<BootCatalogPayload> | null = null;

async function loadCatalog(): Promise<BootCatalogPayload> {
  try {
    const response = await fetchScCatalog();
    const stale =
      response.totalCount < 800 ||
      response.syncedAt <= 0 ||
      Date.now() / 1000 - response.syncedAt > 2 * 3600;

    let rows = response.rows;
    let index = response.index;
    let syncedAt = response.syncedAt;
    let totalCount = response.totalCount;

    if (stale) {
      const refreshed = await refreshScCatalog();
      rows = refreshed.rows;
      index = refreshed.index;
      syncedAt = refreshed.syncedAt;
      totalCount = refreshed.totalCount;
    }

    return {
      rows,
      index,
      syncedAt,
      totalCount,
      error: null,
    };
  } catch (err) {
    return {
      rows: [],
      index: [],
      syncedAt: 0,
      totalCount: 0,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/** Precarica il catalogo streaming (SC + Saturn) per la home. Idempotente. */
export function prefetchBootCatalog(): Promise<BootCatalogPayload> {
  if (cache) return Promise.resolve(cache);
  if (!inflight) {
    inflight = loadCatalog().then((payload) => {
      cache = payload;
      return payload;
    });
  }
  return inflight;
}

export function getBootCatalogCache(): BootCatalogPayload | null {
  return cache;
}

export function clearBootCatalogCache() {
  cache = null;
  inflight = null;
}
