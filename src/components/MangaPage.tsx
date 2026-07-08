import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, BookOpen, Search } from "lucide-react";
import type { MangaBrowseItem } from "../types/mangadex";
import {
  getMangaCategory,
  isMangaGenreCategory,
  MANGA_HOME_CATEGORIES,
} from "../lib/mangaCategories";
import { fetchMangaCategoryPage } from "../lib/mangaCategoryFetch";
import { searchManga } from "../lib/mangadexApi";
import { readSavedManga, toggleSavedManga } from "../lib/mangaLibrary";
import { MangaCard } from "./MangaCard";
import { MangaHomeRow } from "./MangaHomeRow";
import { LoadingSpinner } from "./LoadingSpinner";

const ADULT_FILTER_KEY = "branchefy-manga-adult-filter";
const PAGE_SIZE = 18;

type MangaView =
  | { type: "home" }
  | { type: "category"; categoryId: string }
  | { type: "search"; query: string };

interface MangaPageProps {
  profileId: string;
  onOpenManga: (item: MangaBrowseItem) => void;
  allowAdult?: boolean;
}

export function MangaPage({
  profileId,
  onOpenManga,
  allowAdult = false,
}: MangaPageProps) {
  const [view, setView] = useState<MangaView>({ type: "home" });
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [adultEnabled, setAdultEnabled] = useState(
    () => localStorage.getItem(ADULT_FILTER_KEY) === "1",
  );
  const includeAdult = allowAdult && adultEnabled;

  const [savedItems, setSavedItems] = useState<MangaBrowseItem[]>(() =>
    readSavedManga(profileId),
  );
  const savedIds = useMemo(
    () => new Set(savedItems.map((item) => item.id)),
    [savedItems],
  );

  // Category / search browse state
  const [browseItems, setBrowseItems] = useState<MangaBrowseItem[]>([]);
  const [browseLoading, setBrowseLoading] = useState(false);
  const [browseLoadingMore, setBrowseLoadingMore] = useState(false);
  const [browseError, setBrowseError] = useState<string | null>(null);
  const [browseHasMore, setBrowseHasMore] = useState(false);
  const browseOffsetRef = useRef(0);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setSavedItems(readSavedManga(profileId));
  }, [profileId]);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(searchQuery.trim()), 400);
    return () => window.clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    if (!debouncedQuery) {
      setView((prev) => (prev.type === "search" ? { type: "home" } : prev));
      return;
    }
    setView({ type: "search", query: debouncedQuery });
  }, [debouncedQuery]);

  const handleToggleSave = useCallback(
    (item: MangaBrowseItem) => {
      toggleSavedManga(profileId, item);
      setSavedItems(readSavedManga(profileId));
    },
    [profileId],
  );

  const toggleAdult = useCallback(() => {
    setAdultEnabled((prev) => {
      const next = !prev;
      localStorage.setItem(ADULT_FILTER_KEY, next ? "1" : "0");
      return next;
    });
  }, []);

  const [showGenres, setShowGenres] = useState(false);
  const [visibleRowCount, setVisibleRowCount] = useState(3);
  const rowSentinelRef = useRef<HTMLDivElement | null>(null);

  const visibleCategories = useMemo(
    () =>
      MANGA_HOME_CATEGORIES.filter((cat) => {
        if (cat.preset === "saved" && savedItems.length === 0) return false;
        if (isMangaGenreCategory(cat) && !showGenres) return false;
        return true;
      }),
    [savedItems.length, showGenres],
  );

  const hasHiddenGenres = useMemo(
    () => MANGA_HOME_CATEGORIES.some((cat) => isMangaGenreCategory(cat)),
    [],
  );

  useEffect(() => {
    setVisibleRowCount(3);
  }, [includeAdult, profileId]);

  useEffect(() => {
    if (view.type !== "home") return;
    const node = rowSentinelRef.current;
    if (!node || visibleRowCount >= visibleCategories.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisibleRowCount((count) =>
            Math.min(count + 1, visibleCategories.length),
          );
        }
      },
      { rootMargin: "60px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [view.type, visibleRowCount, visibleCategories.length]);

  const loadBrowsePage = useCallback(
    async (initial: boolean) => {
      if (view.type === "home") return;

      if (initial) {
        setBrowseLoading(true);
        setBrowseError(null);
        browseOffsetRef.current = 0;
        setBrowseItems([]);
      } else {
        setBrowseLoadingMore(true);
      }

      try {
        let page;
        if (view.type === "search") {
          page = await searchManga(
            view.query,
            browseOffsetRef.current,
            PAGE_SIZE,
            includeAdult,
          );
        } else {
          const category = getMangaCategory(view.categoryId);
          if (!category) return;
          page = await fetchMangaCategoryPage(
            category,
            profileId,
            browseOffsetRef.current,
            PAGE_SIZE,
            includeAdult,
          );
        }

        setBrowseItems((prev) =>
          initial ? page.items : [...prev, ...page.items],
        );
        setBrowseHasMore(page.hasMore);
        browseOffsetRef.current += page.items.length;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Impossibile caricare i manga.";
        if (initial) {
          setBrowseError(message);
          setBrowseItems([]);
          setBrowseHasMore(false);
        }
      } finally {
        setBrowseLoading(false);
        setBrowseLoadingMore(false);
      }
    },
    [view, profileId, includeAdult],
  );

  useEffect(() => {
    if (view.type === "home") return;
    void loadBrowsePage(true);
  }, [view, loadBrowsePage]);

  useEffect(() => {
    if (view.type === "home") return;
    const node = loadMoreRef.current;
    if (!node || !browseHasMore || browseLoadingMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) void loadBrowsePage(false);
      },
      { rootMargin: "500px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [view, browseHasMore, browseLoadingMore, loadBrowsePage, browseItems.length]);

  const browseTitle =
    view.type === "search"
      ? `Risultati per “${view.query}”`
      : view.type === "category"
        ? getMangaCategory(view.categoryId)?.label ?? "Categoria"
        : "";

  const isHome = view.type === "home";

  return (
    <div className="pb-16 pt-24 sm:pt-28">
      <style>{`
        .manga-browse-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
          gap: 1.5rem 1rem;
          justify-items: center;
        }
        @media (min-width: 1280px) {
          .manga-browse-grid {
            grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
          }
        }
      `}</style>

      <div className="mx-auto w-full max-w-6xl page-px">
        {/* Header */}
        <div className="flex flex-col items-center text-center">
          {!isHome && (
            <button
              type="button"
              onClick={() => {
                setView({ type: "home" });
                setSearchQuery("");
              }}
              className="mb-4 flex items-center gap-2 text-[13px] text-text-secondary transition hover:text-text-primary"
              aria-label="Torna alla home manga"
            >
              <ArrowLeft className="h-4 w-4" />
              Torna al catalogo
            </button>
          )}

          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#ff6740]/15 ring-1 ring-[#ff6740]/25">
            <BookOpen className="h-5 w-5 text-[#ff6740]" />
          </div>
          <span className="font-display mt-3 text-[11px] tabular-nums text-text-muted sm:text-xs">
            MangaDex
          </span>
          <h1 className="font-display mt-1 text-3xl font-semibold tracking-[-0.03em] text-text-primary sm:text-4xl">
            {isHome ? "Manga" : browseTitle}
          </h1>
          {isHome && (
            <p className="mt-2 max-w-prose text-[14px] text-text-secondary sm:text-[15px]">
              Esplora per categoria · IT e EN
            </p>
          )}

          {allowAdult && (
            <button
              type="button"
              onClick={toggleAdult}
              className={`mt-4 rounded-full px-4 py-2 text-[13px] font-semibold transition ${
                adultEnabled
                  ? "bg-red-600 text-white shadow-lg shadow-red-600/25"
                  : "bg-white/[0.06] text-text-secondary hover:bg-white/10"
              }`}
            >
              18+
            </button>
          )}

          <div className="relative mt-5 w-full max-w-lg">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cerca un manga..."
              className="w-full rounded-xl border border-white/10 bg-white/[0.04] py-2.5 pl-10 pr-4 text-[14px] text-text-primary outline-none transition placeholder:text-text-muted focus:border-[#ff6740]/50 focus:ring-1 focus:ring-[#ff6740]/30"
            />
          </div>
        </div>

        {isHome ? (
          <div className="mt-8 space-y-2">
            {visibleCategories.slice(0, visibleRowCount).map((category, idx) => (
              <MangaHomeRow
                key={category.id}
                index={String(idx + 1).padStart(2, "0")}
                category={category}
                profileId={profileId}
                adult={includeAdult}
                savedIds={savedIds}
                onOpen={onOpenManga}
                onToggleSave={handleToggleSave}
                onSeeAll={(categoryId) =>
                  setView({ type: "category", categoryId })
                }
              />
            ))}

            {visibleRowCount < visibleCategories.length && (
              <div ref={rowSentinelRef} className="h-24" aria-hidden />
            )}

            {!showGenres && hasHiddenGenres && (
              <div className="flex justify-center py-6">
                <button
                  type="button"
                  onClick={() => setShowGenres(true)}
                  className="rounded-full border border-white/10 bg-white/[0.04] px-5 py-2.5 text-[13px] font-medium text-text-secondary transition hover:border-[#ff6740]/30 hover:text-text-primary"
                >
                  Mostra categorie per genere
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="mt-8">
            {browseLoading && browseItems.length === 0 ? (
              <div className="flex justify-center py-20">
                <LoadingSpinner size="md" className="border-t-[#ff6740]" />
              </div>
            ) : browseError && browseItems.length === 0 ? (
              <p className="py-16 text-center text-[13px] text-red-400/90">
                {browseError}
              </p>
            ) : browseItems.length === 0 ? (
              <p className="py-16 text-center text-[13px] text-text-muted">
                Nessun manga trovato.
              </p>
            ) : (
              <>
                <div className="manga-browse-grid">
                  {browseItems.map((item) => (
                    <MangaCard
                      key={item.id}
                      item={item}
                      saved={savedIds.has(item.id)}
                      variant="grid"
                      onOpen={onOpenManga}
                      onToggleSave={handleToggleSave}
                    />
                  ))}
                </div>
                {browseHasMore && (
                  <div ref={loadMoreRef} className="flex justify-center py-10">
                    <LoadingSpinner size="sm" className="border-t-[#ff6740]" />
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
