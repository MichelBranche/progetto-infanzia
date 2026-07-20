import {
  startTransition,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { searchScCatalogPage } from "./addonsApi";
import {
  appendUniquePreviews,
  buildCatalogSearchIndex,
  filterCatalogIndex,
  mergeSearchPreviews,
  suggestCatalogDidYouMean,
} from "./searchCatalog";
import { rankSearchResults } from "./smartSearch";
import type { StremioMetaPreview } from "../types/stremio";

const PAGE_SIZE = 48;
const DEBOUNCE_MS = 280;

export function useStreamingSearch(
  query: string,
  catalog: StremioMetaPreview[],
) {
  const [results, setResults] = useState<StremioMetaPreview[]>([]);
  const [didYouMean, setDidYouMean] = useState<StremioMetaPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState(0);
  const offsetRef = useRef(0);
  const requestIdRef = useRef(0);
  const inflightRef = useRef(false);
  const catalogRef = useRef(catalog);
  catalogRef.current = catalog;

  // Indice precomputato una volta per catalogo: sposta la normalizzazione
  // costosa (accenti/slug/cast) fuori dal percorso di digitazione.
  const searchIndex = useMemo(() => buildCatalogSearchIndex(catalog), [catalog]);
  const searchIndexRef = useRef(searchIndex);
  searchIndexRef.current = searchIndex;

  // Digitare resta prioritario: il filtro locale segue in low-priority e non
  // blocca il keystroke (stile Concurrent React / Netflix search).
  const deferredQuery = useDeferredValue(query);

  useEffect(() => {
    const q = deferredQuery.trim();
    const requestId = ++requestIdRef.current;
    offsetRef.current = 0;
    setHasMore(false);
    setTotal(0);
    setDidYouMean(null);
    inflightRef.current = false;

    if (!q) {
      startTransition(() => {
        setResults([]);
        setLoading(false);
        setLoadingMore(false);
      });
      return;
    }

    const catalogSnapshot = catalogRef.current;
    const local =
      q.length >= 2 ? filterCatalogIndex(searchIndexRef.current, q) : [];

    startTransition(() => {
      setResults(local);
      setLoading(true);
    });

    const timer = window.setTimeout(() => {
      void searchScCatalogPage(q, 0, PAGE_SIZE)
        .then((page) => {
          if (requestId !== requestIdRef.current) return;
          const merged = mergeSearchPreviews(
            page.items,
            local,
            catalogSnapshot,
            q,
          );
          startTransition(() => {
            setResults(merged);
            setTotal(Math.max(page.total, merged.length));
            setHasMore(page.hasMore);
            if (merged.length === 0) {
              setDidYouMean(suggestCatalogDidYouMean(catalogSnapshot, q));
            } else {
              setDidYouMean(null);
            }
          });
          offsetRef.current = page.items.length;
        })
        .catch(() => {
          if (requestId !== requestIdRef.current) return;
          startTransition(() => {
            setResults(local);
            setHasMore(false);
            setTotal(local.length);
            setDidYouMean(
              local.length === 0
                ? suggestCatalogDidYouMean(catalogSnapshot, q)
                : null,
            );
          });
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
  }, [deferredQuery]);

  const loadMore = useCallback(() => {
    const q = query.trim();
    if (!q || inflightRef.current || !hasMore) return;

    inflightRef.current = true;
    setLoadingMore(true);

    void searchScCatalogPage(q, offsetRef.current, PAGE_SIZE)
      .then((page) => {
        startTransition(() => {
          setResults((prev) =>
            rankSearchResults(appendUniquePreviews(prev, page.items), q),
          );
          setTotal(page.total);
          setHasMore(page.hasMore);
        });
        offsetRef.current += page.items.length;
      })
      .finally(() => {
        inflightRef.current = false;
        setLoadingMore(false);
      });
  }, [query, hasMore]);

  return {
    results,
    didYouMean,
    loading,
    loadingMore,
    hasMore,
    total,
    loadMore,
  };
}
