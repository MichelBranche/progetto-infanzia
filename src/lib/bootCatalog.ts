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
const COMPLETE_MOVIE_MIN = 8_000;

let cache: BootCatalogPayload | null = null;
let inflight: Promise<BootCatalogPayload> | null = null;
let refreshInflight: Promise<BootCatalogPayload | null> | null = null;

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

const BOOT_CATALOG_HARD_TIMEOUT_MS = 12_000;
const BOOT_CATALOG_POLL_MS = 400;

/**
 * Attende un catalogo davvero usabile per la homepage (righe o indice).
 * Se il fetch rapido è vuoto, avvia il refresh completo e fa poll fino al timeout.
 */
export async function waitForUsableBootCatalog(
  timeoutMs = BOOT_CATALOG_HARD_TIMEOUT_MS,
): Promise<boolean> {
  if (hasUsableCatalog(cache)) return true;

  const deadline = Date.now() + timeoutMs;
  const payload = await prefetchBootCatalog();
  if (hasUsableCatalog(payload) || hasUsableCatalog(cache)) return true;

  void scheduleCatalogRefresh();

  while (Date.now() < deadline) {
    if (hasUsableCatalog(cache)) return true;
    await new Promise<void>((resolve) => {
      window.setTimeout(resolve, BOOT_CATALOG_POLL_MS);
    });
    await pollCatalogMetadata();
    if (hasUsableCatalog(cache)) return true;
  }

  return hasUsableCatalog(cache);
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

function indexNeedsFullSync(index: StremioMetaPreview[]): boolean {
  const scItems = index.filter(
    (item) => !item.catalogPrefix || item.catalogPrefix === "sc",
  );
  if (scItems.length < MIN_CATALOG_COUNT) return true;
  const movies = scItems.filter((item) => item.type === "movie");
  return movies.length < COMPLETE_MOVIE_MIN;
}

function indexNeedsGenreMetadata(index: StremioMetaPreview[]): boolean {
  if (index.length < 100) return false;
  const movies = index.filter((item) => item.type === "movie");
  // Seed completo: i generi si arricchiscono in background senza ripollare 7MB.
  if (movies.length >= COMPLETE_MOVIE_MIN) return false;
  if (movies.length < 50) return false;
  const tagged = movies.filter((item) => {
    if ((item.genres?.length ?? 0) > 0) return true;
    const key = item.sourceRowKey?.toLowerCase() ?? "";
    return key.startsWith("sc-genre-");
  }).length;
  return tagged < Math.min(80, Math.floor(movies.length * 0.08));
}

function indexNeedsProviderMetadata(index: StremioMetaPreview[]): boolean {
  if (index.length < 100) return false;
  const scItems = index.filter(
    (item) => !item.catalogPrefix || item.catalogPrefix === "sc",
  );
  if (scItems.length >= COMPLETE_MOVIE_MIN) return false;
  if (scItems.length < 80) return false;
  const known = scItems.filter((item) => item.streamingServices !== undefined).length;
  return known < Math.min(120, Math.floor(scItems.length * 0.2));
}

/**
 * Full refreshScCatalog lato frontend: solo se non c'è un catalogo SC usabile.
 * Loonex/Saturn incompleti non devono bloccare homepage/Film con un crawl SC.
 */
export function needsCatalogRefresh(payload: BootCatalogPayload | null): boolean {
  if (!payload) return true;
  if (payload.error && !hasUsableCatalog(payload)) return true;
  return indexNeedsFullSync(payload.index);
}

/** Poll mentre il catalogo SC cresce o i metadati si arricchiscono. */
export function needsMetadataPoll(payload: BootCatalogPayload | null): boolean {
  if (!payload || payload.index.length < 40) return false;
  if (payload.needsBackgroundSync) return true;
  if (indexNeedsFullSync(payload.index)) return true;
  return (
    indexNeedsGenreMetadata(payload.index) ||
    indexNeedsProviderMetadata(payload.index)
  );
}

/** Rilegge fetch_sc_catalog solo se il totale cresce o manca ancora metadata critica. */
export async function pollCatalogMetadata(): Promise<BootCatalogPayload | null> {
  try {
    const previousTotal = cache?.totalCount ?? 0;
    const response = await fetchScCatalog();
    const payload = payloadFromResponse(response);
    // Evita di “svuotare” la UI se una risposta parziale arriva durante il poll.
    if (
      hasUsableCatalog(cache) &&
      payload.index.length + 50 < previousTotal &&
      payload.totalCount + 50 < previousTotal
    ) {
      return cache;
    }
    mergeCache(payload);
    return cache ?? payload;
  } catch {
    return cache;
  }
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
