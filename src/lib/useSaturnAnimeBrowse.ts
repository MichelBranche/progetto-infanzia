import { useCallback, useEffect, useRef, useState } from "react";
import { fetchSaturnAnimePage } from "./addonsApi";
import type { StremioMetaPreview } from "../types/stremio";

const PAGE_SIZE = 48;

function itemKey(preview: StremioMetaPreview) {
  return `${preview.type}:${preview.id}`;
}

function dedupePreviews(items: StremioMetaPreview[]) {
  const seen = new Set<string>();
  const out: StremioMetaPreview[] = [];
  for (const item of items) {
    const key = itemKey(item);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

export function useSaturnAnimeBrowse(seedPreviews: StremioMetaPreview[] = []) {
  const [items, setItems] = useState<StremioMetaPreview[]>(() =>
    dedupePreviews(seedPreviews),
  );
  const [total, setTotal] = useState(() => seedPreviews.length);
  const [loading, setLoading] = useState(() => seedPreviews.length === 0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const offsetRef = useRef(0);
  const inflightRef = useRef(false);
  const seedRef = useRef(seedPreviews);
  seedRef.current = seedPreviews;

  const mergePage = useCallback(
    (page: Awaited<ReturnType<typeof fetchSaturnAnimePage>>) => {
      setItems((prev) => {
        const merged = dedupePreviews([...prev, ...page.items]);
        return merged;
      });
      setTotal((prev) =>
        Math.max(prev, page.total, page.offset + page.items.length),
      );
      setHasMore(page.hasMore);
      offsetRef.current = page.offset + page.items.length;
    },
    [],
  );

  const fetchPage = useCallback(
    async (offset: number, initial: boolean) => {
      if (inflightRef.current) return;
      inflightRef.current = true;
      if (initial) setLoading(true);
      else setLoadingMore(true);

      try {
        const page = await fetchSaturnAnimePage(offset, PAGE_SIZE);
        mergePage(page);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        if (initial && seedRef.current.length > 0) {
          setHasMore(true);
        }
      } finally {
        inflightRef.current = false;
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [mergePage],
  );

  const seedKey = seedPreviews.map(itemKey).join("|");

  useEffect(() => {
    const seeded = dedupePreviews(seedRef.current);
    offsetRef.current = 0;
    setItems(seeded);
    setTotal(seeded.length);
    setHasMore(true);
    setError(null);
    setLoading(seeded.length === 0);
    void fetchPage(0, true);
  }, [seedKey, fetchPage]);

  const loadMore = useCallback(() => {
    if (!hasMore || inflightRef.current || loading) return;
    void fetchPage(offsetRef.current, false);
  }, [hasMore, loading, fetchPage]);

  return {
    items,
    total,
    loading,
    loadingMore,
    hasMore,
    error,
    loadMore,
  };
}
