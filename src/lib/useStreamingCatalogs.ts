import { useCallback, useEffect, useState } from "react";
import {
  fetchAddonCatalog,
  getStreamingContinue,
  refreshScCatalog,
} from "./addonsApi";
import { prefetchBootCatalog, getBootCatalogCache } from "./bootCatalog";
import { STREMIO_ADDONS_ENABLED } from "./features";
import { useAddons } from "../context/AddonsContext";
import type { InstalledAddon, StremioCatalog, StremioMetaPreview, StreamingContinueItem } from "../types/stremio";

export interface StreamingRow {
  key: string;
  title: string;
  subtitle: string;
  items: StremioMetaPreview[];
}

interface UseStreamingCatalogsResult {
  rows: StreamingRow[];
  catalogIndex: StremioMetaPreview[];
  catalogTotal: number;
  catalogSyncedAt: number;
  previews: StremioMetaPreview[];
  continueItems: StreamingContinueItem[];
  loading: boolean;
  syncingIndex: boolean;
  error: string | null;
  refreshContinue: () => Promise<void>;
  refreshCatalog: () => Promise<void>;
}

function catalogAddons(addons: InstalledAddon[]) {
  return addons.filter(
    (a) => a.enabled && a.resources.includes("catalog") && a.catalogs.length > 0,
  );
}

function pickHomeCatalogs(addon: InstalledAddon): StremioCatalog[] {
  const cats = addon.catalogs;
  if (cats.length === 0) return [];

  const preferredKeys = [
    "movie:top",
    "series:top",
    "movie:imdbRating",
    "series:imdbRating",
    "movie:year",
    "series:year",
  ];
  const picked: StremioCatalog[] = [];

  for (const key of preferredKeys) {
    const [type, id] = key.split(":");
    const match = cats.find((c) => c.type === type && c.id === id);
    if (match && !picked.some((p) => p.type === match.type && p.id === match.id)) {
      picked.push(match);
    }
  }

  for (const cat of cats) {
    if (picked.length >= 4) break;
    const required = cat.extra?.some((e) => e.isRequired);
    if (required) continue;
    if (!picked.some((p) => p.type === cat.type && p.id === cat.id)) {
      picked.push(cat);
    }
  }

  return picked.slice(0, 4);
}

function catalogLabel(catalog: StremioCatalog) {
  if (catalog.type === "movie") return "Film in streaming";
  if (catalog.type === "series") return "Serie TV in streaming";
  if (catalog.type === "channel") return "Canali";
  if (catalog.type === "tv") return "TV";
  return catalog.name;
}

async function loadScCatalog(): Promise<{
  rows: StreamingRow[];
  index: StremioMetaPreview[];
  syncedAt: number;
  totalCount: number;
  needsFullSync: boolean;
  error: string | null;
}> {
  const payload = await prefetchBootCatalog();
  return {
    rows: payload.rows,
    index: payload.index,
    syncedAt: payload.syncedAt,
    totalCount: payload.totalCount,
    needsFullSync: false,
    error: payload.error,
  };
}

async function loadAddonRows(
  profileId: string,
  addons: InstalledAddon[],
): Promise<{ rows: StreamingRow[]; error: string | null }> {
  const next: StreamingRow[] = [];
  let firstError: string | null = null;
  const sources = catalogAddons(addons);

  for (const addon of sources) {
    for (const catalog of pickHomeCatalogs(addon)) {
      try {
        const items = await fetchAddonCatalog(
          profileId,
          addon.id,
          catalog.type,
          catalog.id,
        );
        if (items.length > 0) {
          next.push({
            key: `${addon.id}-${catalog.type}-${catalog.id}`,
            title: catalogLabel(catalog),
            subtitle: `${catalog.name} · ${addon.name}`,
            items: items.slice(0, 40),
          });
        }
      } catch (err) {
        if (!firstError) {
          firstError = err instanceof Error ? err.message : String(err);
        }
      }
    }
  }

  return { rows: next, error: firstError };
}

export function useStreamingCatalogs(profileId: string): UseStreamingCatalogsResult {
  const { addons, loading: addonsLoading } = useAddons();
  const bootCached = getBootCatalogCache();
  const [scRows, setScRows] = useState<StreamingRow[]>(bootCached?.rows ?? []);
  const [catalogIndex, setCatalogIndex] = useState<StremioMetaPreview[]>(
    bootCached?.index ?? [],
  );
  const [catalogSyncedAt, setCatalogSyncedAt] = useState(bootCached?.syncedAt ?? 0);
  const [catalogTotal, setCatalogTotal] = useState(bootCached?.totalCount ?? 0);
  const [addonRows, setAddonRows] = useState<StreamingRow[]>([]);
  const [continueItems, setContinueItems] = useState<StreamingContinueItem[]>([]);
  const [scLoading, setScLoading] = useState(!bootCached);
  const [syncingIndex, setSyncingIndex] = useState(false);
  const [addonLoading, setAddonLoading] = useState(false);
  const [error, setError] = useState<string | null>(bootCached?.error ?? null);

  const refreshContinue = useCallback(async () => {
    if (!profileId) {
      setContinueItems([]);
      return;
    }
    try {
      const items = await getStreamingContinue(profileId);
      setContinueItems(items);
    } catch {
      setContinueItems([]);
    }
  }, [profileId]);

  const applyScCatalog = useCallback(
    (payload: Awaited<ReturnType<typeof loadScCatalog>>) => {
      setScRows(payload.rows);
      setCatalogIndex(payload.index);
      setCatalogSyncedAt(payload.syncedAt);
      setCatalogTotal(payload.totalCount);
      setError((prev) =>
        payload.error ??
          (payload.rows.length === 0 && payload.index.length === 0 ? prev : null),
      );
    },
    [],
  );

  const refreshCatalog = useCallback(async () => {
    setSyncingIndex(true);
    try {
      const response = await refreshScCatalog();
      applyScCatalog({
        rows: response.rows,
        index: response.index,
        syncedAt: response.syncedAt,
        totalCount: response.totalCount,
        needsFullSync: false,
        error: null,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSyncingIndex(false);
    }
  }, [applyScCatalog]);

  useEffect(() => {
    void refreshContinue();
  }, [refreshContinue, profileId]);

  useEffect(() => {
    let cancelled = false;
    if (!getBootCatalogCache()) {
      setScLoading(true);
    }

    void (async () => {
      const payload = await loadScCatalog();
      if (cancelled) return;
      applyScCatalog(payload);
      setScLoading(false);

      if (payload.totalCount < 800 || payload.syncedAt <= 0) {
        void refreshCatalog();
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [applyScCatalog, refreshCatalog]);

  useEffect(() => {
    if (!STREMIO_ADDONS_ENABLED || addonsLoading || !profileId) {
      setAddonRows([]);
      setAddonLoading(false);
      return;
    }

    let cancelled = false;
    setAddonLoading(true);

    void (async () => {
      const { rows, error: addonError } = await loadAddonRows(profileId, addons);
      if (cancelled) return;

      setAddonRows(rows);
      setError((prev) => {
        if (rows.length > 0 || scRows.length > 0 || catalogIndex.length > 0) {
          return null;
        }
        return prev ?? addonError;
      });
      setAddonLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [addons, addonsLoading, profileId, scRows.length, catalogIndex.length]);

  const rows = [...scRows, ...(STREMIO_ADDONS_ENABLED ? addonRows : [])];
  const loading = scLoading || (STREMIO_ADDONS_ENABLED && addonLoading);

  const previews: StremioMetaPreview[] =
    catalogIndex.length > 0
      ? catalogIndex
      : (() => {
          const seen = new Set<string>();
          const fallback: StremioMetaPreview[] = [];
          for (const row of rows) {
            for (const item of row.items) {
              const key = `${item.type}:${item.id}`;
              if (seen.has(key)) continue;
              seen.add(key);
              fallback.push(item);
            }
          }
          return fallback;
        })();

  return {
    rows,
    catalogIndex,
    catalogTotal,
    catalogSyncedAt,
    previews,
    continueItems,
    loading,
    syncingIndex,
    error,
    refreshContinue,
    refreshCatalog,
  };
}
