import { useCallback, useEffect, useRef, useState } from "react";
import { fetchSaturnAnimePage, fetchSaturnGenrePage } from "./addonsApi";
import type { SaturnBrowsePage, StremioMetaPreview } from "../types/stremio";

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

export function useSaturnAnimeBrowse(
  seedPreviews: StremioMetaPreview[] = [],
  genreId: string | null = null,
) {
  // Con un genere selezionato ignoriamo il seed (contenuti diversi).
  const effectiveSeed = genreId ? [] : seedPreviews;
  const [items, setItems] = useState<StremioMetaPreview[]>(() =>
    dedupePreviews(effectiveSeed),
  );
  const [total, setTotal] = useState(() => effectiveSeed.length);
  const [loading, setLoading] = useState(() => effectiveSeed.length === 0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const offsetRef = useRef(0);
  const inflightRef = useRef(false);
  const seedRef = useRef(effectiveSeed);
  seedRef.current = effectiveSeed;
  const genreRef = useRef(genreId);
  genreRef.current = genreId;

  const mergePage = useCallback(
    (page: SaturnBrowsePage) => {
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
        const gid = genreRef.current;
        const page = gid
          ? await fetchSaturnGenrePage(gid, offset, PAGE_SIZE)
          : await fetchSaturnAnimePage(offset, PAGE_SIZE);
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

  const seedKey = effectiveSeed.map(itemKey).join("|");

  useEffect(() => {
    const seeded = dedupePreviews(seedRef.current);
    offsetRef.current = 0;
    setItems(seeded);
    setTotal(seeded.length);
    setHasMore(true);
    setError(null);
    setLoading(seeded.length === 0);
    void fetchPage(0, true);
  }, [seedKey, genreId, fetchPage]);

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
