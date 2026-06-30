import { useCallback, useEffect, useRef, useState } from "react";
import { searchScCatalogPage } from "./addonsApi";
import {
  appendUniquePreviews,
  filterCatalogPreviews,
  mergeSearchPreviews,
} from "./searchCatalog";
import type { StremioMetaPreview } from "../types/stremio";

const PAGE_SIZE = 48;
const DEBOUNCE_MS = 300;

export function useStreamingSearch(
  query: string,
  catalog: StremioMetaPreview[],
) {
  const [results, setResults] = useState<StremioMetaPreview[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState(0);
  const offsetRef = useRef(0);
  const requestIdRef = useRef(0);
  const inflightRef = useRef(false);
  const catalogRef = useRef(catalog);
  catalogRef.current = catalog;

  useEffect(() => {
    const q = query.trim();
    const requestId = ++requestIdRef.current;
    offsetRef.current = 0;
    setHasMore(false);
    setTotal(0);
    inflightRef.current = false;

    if (!q) {
      setResults([]);
      setLoading(false);
      setLoadingMore(false);
      return;
    }

    const catalogSnapshot = catalogRef.current;
    const local =
      q.length >= 2 ? filterCatalogPreviews(catalogSnapshot, q) : [];
    setResults(local);
    setLoading(true);

    const timer = window.setTimeout(() => {
      void searchScCatalogPage(q, 0, PAGE_SIZE)
        .then((page) => {
          if (requestId !== requestIdRef.current) return;
          const merged = mergeSearchPreviews(
            page.items,
            local,
            catalogSnapshot,
          );
          setResults(merged);
          setTotal(Math.max(page.total, merged.length));
          setHasMore(page.hasMore);
          offsetRef.current = page.items.length;
        })
        .catch(() => {
          if (requestId !== requestIdRef.current) return;
          setResults(local);
          setHasMore(false);
          setTotal(local.length);
        })
        .finally(() => {
          if (requestId === requestIdRef.current) {
            setLoading(false);
          }
        });
    }, DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timer);
    };
  }, [query]);

  const loadMore = useCallback(() => {
    const q = query.trim();
    if (!q || inflightRef.current || !hasMore) return;

    inflightRef.current = true;
    setLoadingMore(true);

    void searchScCatalogPage(q, offsetRef.current, PAGE_SIZE)
      .then((page) => {
        setResults((prev) => appendUniquePreviews(prev, page.items));
        setTotal(page.total);
        setHasMore(page.hasMore);
        offsetRef.current += page.items.length;
      })
      .finally(() => {
        inflightRef.current = false;
        setLoadingMore(false);
      });
  }, [query, hasMore]);

  return {
    results,
    loading,
    loadingMore,
    hasMore,
    total,
    loadMore,
  };
}
