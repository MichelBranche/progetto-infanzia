import { useCallback, useEffect, useRef, useState } from "react";
import type { MangaBrowseItem } from "../types/mangadex";
import type { MangaDexPage } from "../lib/mangadexApi";
import { getMangaTabCache, setMangaTabCache } from "../lib/mangadexCache";

const PAGE_SIZE = 18;

function dedupeItems(items: MangaBrowseItem[]) {
  const seen = new Set<string>();
  const out: MangaBrowseItem[] = [];
  for (const item of items) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    out.push(item);
  }
  return out;
}

type Fetcher = (offset: number, limit: number) => Promise<MangaDexPage<MangaBrowseItem>>;

export function useMangaDexBrowse(fetcher: Fetcher, resetKey = "") {
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const cachedTab = getMangaTabCache(resetKey);
  const [items, setItems] = useState<MangaBrowseItem[]>(() => cachedTab?.items ?? []);
  const [total, setTotal] = useState(() => cachedTab?.total ?? 0);
  const [loading, setLoading] = useState(() => !cachedTab);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(() => cachedTab?.hasMore ?? true);
  const [error, setError] = useState<string | null>(null);
  const offsetRef = useRef(cachedTab?.offset ?? 0);
  const inflightRef = useRef(false);

  const persistTab = useCallback(
    (nextItems: MangaBrowseItem[], nextTotal: number, nextHasMore: boolean) => {
      setMangaTabCache(resetKey, {
        items: nextItems,
        total: nextTotal,
        offset: offsetRef.current,
        hasMore: nextHasMore,
      });
    },
    [resetKey],
  );

  const mergePage = useCallback(
    (page: MangaDexPage<MangaBrowseItem>, replace = false) => {
      setItems((prev) => {
        const merged = replace ? page.items : dedupeItems([...prev, ...page.items]);
        persistTab(merged, page.total, page.hasMore);
        return merged;
      });
      setTotal(page.total);
      setHasMore(page.hasMore);
      offsetRef.current = page.offset + page.items.length;
    },
    [persistTab],
  );

  const fetchPage = useCallback(async (offset: number, initial: boolean) => {
    if (inflightRef.current) return;
    inflightRef.current = true;
    if (initial) setLoading(true);
    else setLoadingMore(true);

    try {
      const page = await fetcherRef.current(offset, PAGE_SIZE);
      mergePage(page, initial && offset === 0);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      inflightRef.current = false;
      setLoading(false);
      setLoadingMore(false);
    }
  }, [mergePage]);

  useEffect(() => {
    const cached = getMangaTabCache(resetKey);
    if (cached) {
      offsetRef.current = cached.offset;
      setItems(cached.items);
      setTotal(cached.total);
      setHasMore(cached.hasMore);
      setError(null);
      setLoading(false);
      return;
    }

    offsetRef.current = 0;
    setItems([]);
    setTotal(0);
    setHasMore(true);
    setError(null);
    setLoading(true);
    void fetchPage(0, true);
  }, [resetKey, fetchPage]);

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
