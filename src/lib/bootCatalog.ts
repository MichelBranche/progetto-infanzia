import { fetchScCatalog, refreshScCatalog } from "./addonsApi";
import type { StremioMetaPreview } from "../types/stremio";
import type { StreamingRow } from "./useStreamingCatalogs";

export interface BootCatalogPayload {
  rows: StreamingRow[];
  index: StremioMetaPreview[];
  syncedAt: number;
  totalCount: number;
  error: string | null;
  needsBackgroundSync?: boolean;
}

const MIN_CATALOG_COUNT = 800;
const CATALOG_TTL_MS = 2 * 3600 * 1000;

let cache: BootCatalogPayload | null = null;
let inflight: Promise<BootCatalogPayload> | null = null;
let refreshInflight: Promise<BootCatalogPayload | null> | null = null;

function isCacheFresh(payload: BootCatalogPayload): boolean {
  if (payload.error) return false;
  if (payload.totalCount < MIN_CATALOG_COUNT) return false;
  if (payload.syncedAt <= 0) return false;
  return Date.now() - payload.syncedAt * 1000 <= CATALOG_TTL_MS;
}

export function hasUsableCatalog(payload: BootCatalogPayload | null): boolean {
  return Boolean(payload && (payload.rows.length > 0 || payload.index.length > 0));
}

function payloadFromResponse(response: {
  rows: StreamingRow[];
  index: StremioMetaPreview[];
  syncedAt: number;
  totalCount: number;
  needsBackgroundSync?: boolean;
}): BootCatalogPayload {
  return {
    rows: response.rows,
    index: response.index,
    syncedAt: response.syncedAt,
    totalCount: response.totalCount,
    error: null,
    needsBackgroundSync: response.needsBackgroundSync,
  };
}

/** Non sovrascrivere mai righe/indice validi con risposte vuote parziali. */
export function mergeCatalogPayload(
  current: BootCatalogPayload | null,
  incoming: BootCatalogPayload,
): BootCatalogPayload {
  if (!current) {
    return incoming;
  }

  return {
    rows: incoming.rows.length > 0 ? incoming.rows : current.rows,
    index: incoming.index.length > 0 ? incoming.index : current.index,
    syncedAt: Math.max(current.syncedAt, incoming.syncedAt),
    totalCount: Math.max(current.totalCount, incoming.totalCount),
    error: incoming.error ?? current.error,
    needsBackgroundSync:
      incoming.needsBackgroundSync ?? current.needsBackgroundSync,
  };
}

function mergeCache(incoming: BootCatalogPayload) {
  cache = mergeCatalogPayload(cache, incoming);
}

async function loadCatalogQuick(): Promise<BootCatalogPayload> {
  try {
    const response = await fetchScCatalog();
    return payloadFromResponse(response);
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

/** Precarica slider + indice in cache (veloce, non blocca sull'indice completo). */
export function prefetchBootCatalog(): Promise<BootCatalogPayload> {
  if (hasUsableCatalog(cache)) {
    return Promise.resolve(cache!);
  }

  if (!inflight) {
    inflight = loadCatalogQuick()
      .then((payload) => {
        mergeCache(payload);
        return cache ?? payload;
      })
      .finally(() => {
        inflight = null;
      });
  }

  return inflight;
}

/** Sincronizza l'indice completo in background (SC + Saturn). */
export function scheduleCatalogRefresh(): Promise<BootCatalogPayload | null> {
  if (refreshInflight) return refreshInflight;

  refreshInflight = refreshScCatalog()
    .then((response) => {
      const payload = payloadFromResponse(response);
      mergeCache(payload);
      return cache;
    })
    .catch(() => null)
    .finally(() => {
      refreshInflight = null;
    });

  return refreshInflight;
}

function indexNeedsGenreMetadata(index: StremioMetaPreview[]): boolean {
  if (index.length < 100) return false;
  const tagged = index.filter(
    (item) => (item.genres?.length ?? 0) > 0 || Boolean(item.sourceRowKey),
  ).length;
  return tagged < 20;
}

export function needsCatalogRefresh(payload: BootCatalogPayload | null): boolean {
  if (!payload) return true;
  if (payload.needsBackgroundSync) return true;
  if (payload.error) return true;
  if (indexNeedsGenreMetadata(payload.index)) return true;
  return !isCacheFresh(payload);
}

export function ingestCatalogPayload(incoming: BootCatalogPayload): BootCatalogPayload {
  mergeCache(incoming);
  return cache ?? incoming;
}

export function getBootCatalogCache(): BootCatalogPayload | null {
  return cache;
}

export function clearBootCatalogCache() {
  cache = null;
  inflight = null;
  refreshInflight = null;
}
