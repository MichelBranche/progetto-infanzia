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

const MIN_CATALOG_COUNT = 800;
const CATALOG_TTL_MS = 2 * 3600 * 1000;

let cache: BootCatalogPayload | null = null;
let inflight: Promise<BootCatalogPayload> | null = null;

function isCacheFresh(payload: BootCatalogPayload): boolean {
  if (payload.error) return false;
  if (payload.totalCount < MIN_CATALOG_COUNT) return false;
  if (payload.syncedAt <= 0) return false;
  return Date.now() - payload.syncedAt * 1000 <= CATALOG_TTL_MS;
}

function isResponseStale(response: {
  totalCount: number;
  syncedAt: number;
}): boolean {
  return (
    response.totalCount < MIN_CATALOG_COUNT ||
    response.syncedAt <= 0 ||
    Date.now() - response.syncedAt * 1000 > CATALOG_TTL_MS
  );
}

async function loadCatalog(): Promise<BootCatalogPayload> {
  try {
    const response = await fetchScCatalog();

    let rows = response.rows;
    let index = response.index;
    let syncedAt = response.syncedAt;
    let totalCount = response.totalCount;

    if (isResponseStale(response)) {
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
  if (cache && isCacheFresh(cache)) {
    return Promise.resolve(cache);
  }

  if (!inflight) {
    inflight = loadCatalog()
      .then((payload) => {
        if (
          isCacheFresh(payload) ||
          payload.totalCount > (cache?.totalCount ?? 0)
        ) {
          cache = payload;
        }
        return payload;
      })
      .finally(() => {
        inflight = null;
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
