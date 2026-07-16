import { useEffect, useMemo, useRef, type ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles } from "lucide-react";
import { SearchResultsSkeleton } from "./Skeleton";
import { LordFlixPosterCard } from "./LordFlixPosterCard";
import type { MediaItem } from "../types/media";
import type { StremioMetaPreview } from "../types/stremio";
import type { BrowseItem } from "../lib/browse";
import { toBrowseItems, browseItemId } from "../lib/browse";
import { streamingBrowseItem } from "../lib/streamingBrowse";
import { enrichStreamingPreview } from "../lib/unifiedBrowse";
import { LoadingSpinner } from "./LoadingSpinner";

interface SearchOverlayProps {
  open: boolean;
  query: string;
  onClose: () => void;
  localResults: MediaItem[];
  streamingResults: StremioMetaPreview[];
  streamingTotal?: number;
  suggestions: StremioMetaPreview[];
  didYouMean?: StremioMetaPreview | null;
  onApplySuggestion?: (preview: StremioMetaPreview) => void;
  streamingLoading?: boolean;
  streamingLoadingMore?: boolean;
  streamingHasMore?: boolean;
  onLoadMoreStreaming?: () => void;
  onPlay: (id: string) => void;
  onPlayStreaming: (preview: StremioMetaPreview) => void;
  onOpenSeries?: (seriesKey: string) => void;
  onToggleFavorite?: (id: string) => void;
  onToggleStreamingList?: (preview: StremioMetaPreview) => void;
  onEdit?: (id: string) => void;
  enrichStreamingPreview?: (preview: StremioMetaPreview) => StremioMetaPreview;
}

export function SearchOverlay({
  open,
  query,
  onClose,
  localResults,
  streamingResults,
  streamingTotal = 0,
  suggestions,
  didYouMean = null,
  onApplySuggestion,
  streamingLoading,
  streamingLoadingMore,
  streamingHasMore,
  onLoadMoreStreaming,
  onPlay,
  onPlayStreaming,
  onOpenSeries,
  onToggleFavorite,
  onToggleStreamingList,
  onEdit,
  enrichStreamingPreview: enrichPreview,
}: SearchOverlayProps) {
  const enrich = enrichPreview ?? enrichStreamingPreview;
  const trimmed = query.trim();
  const hasQuery = trimmed.length > 0;
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const showInitialLoader =
    hasQuery && streamingLoading && streamingResults.length === 0;
  const localBrowse = toBrowseItems(localResults);
  const streamingBrowse = useMemo(
    () => streamingResults.map((preview) => streamingBrowseItem(enrich(preview))),
    [streamingResults, enrich],
  );
  const suggestionBrowse = useMemo(
    () =>
      suggestions
        .slice(0, 42)
        .map((preview) => streamingBrowseItem(enrich(preview))),
    [suggestions, enrich],
  );
  const totalResults = localResults.length + streamingResults.length;
  const streamingCountLabel =
    streamingTotal > streamingResults.length
      ? `${streamingResults.length} di ${streamingTotal.toLocaleString("it-IT")}`
      : `${streamingResults.length}`;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  useEffect(() => {
    const node = loadMoreRef.current;
    if (!node || !streamingHasMore || streamingLoadingMore || !onLoadMoreStreaming) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          onLoadMoreStreaming();
        }
      },
      { rootMargin: "320px" },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [
    streamingHasMore,
    streamingLoadingMore,
    onLoadMoreStreaming,
    streamingResults.length,
  ]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="search-overlay absolute inset-x-0 bottom-0 z-[25] bg-transparent"
          aria-hidden={!open}
        >
          <div className="flex h-full min-h-0 flex-col">
            <div className="search-overlay__scroll min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain">
              {showInitialLoader && <SearchResultsSkeleton count={10} />}

              {hasQuery && streamingLoading && streamingResults.length > 0 && (
                <p className="page-px pb-1 pt-2 text-[12px] text-text-muted">
                  Affinamento risultati…
                </p>
              )}

              {!showInitialLoader &&
                hasQuery &&
                totalResults === 0 &&
                !streamingLoading && (
                  <div className="page-px py-10">
                    <p className="text-[15px] text-text-secondary">
                      Nessun risultato per{" "}
                      <span className="font-medium text-text-primary">
                        «{trimmed}»
                      </span>
                    </p>
                    {didYouMean && onApplySuggestion && (
                      <button
                        type="button"
                        onClick={() => onApplySuggestion(didYouMean)}
                        className="mt-4 inline-flex max-w-full items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-2.5 text-left transition hover:border-accent/40 hover:bg-accent/10"
                      >
                        <Sparkles className="h-4 w-4 shrink-0 text-accent" />
                        <span className="min-w-0 text-[14px] text-text-secondary">
                          Forse cercavi{" "}
                          <span className="font-semibold text-text-primary">
                            {didYouMean.name}
                          </span>
                          ?
                        </span>
                      </button>
                    )}
                    <p className="mt-4 text-[12px] text-text-muted">
                      Prova senza errori di battitura, il nome di un attore, oppure{" "}
                      <span className="text-text-secondary">
                        film / serie / anime
                      </span>{" "}
                      prima del titolo.
                    </p>
                  </div>
                )}

              {hasQuery && totalResults > 0 && (
                <p className="page-px pb-2 pt-2 text-[13px] text-text-muted">
                  {totalResults} risultat{totalResults === 1 ? "o" : "i"}
                  {streamingResults.length > 0 &&
                    ` · ${streamingCountLabel} in catalogo`}
                  {streamingHasMore && " · scorri per altri"}
                </p>
              )}

              {!showInitialLoader && !hasQuery && suggestionBrowse.length > 0 && (
                <SearchSection title="In evidenza">
                  <SearchGrid
                    items={suggestionBrowse.slice(0, 18)}
                    onPlay={onPlay}
                    onPlayStreaming={onPlayStreaming}
                    onOpenSeries={onOpenSeries}
                    onToggleFavorite={onToggleFavorite}
                    onToggleStreamingList={onToggleStreamingList}
                    onEdit={onEdit}
                  />
                </SearchSection>
              )}

              {hasQuery && streamingBrowse.length > 0 && (
                <SearchSection title="Risultati">
                  <SearchGrid
                    items={streamingBrowse}
                    onPlay={onPlay}
                    onPlayStreaming={onPlayStreaming}
                    onOpenSeries={onOpenSeries}
                    onToggleFavorite={onToggleFavorite}
                    onToggleStreamingList={onToggleStreamingList}
                    onEdit={onEdit}
                  />
                  {streamingHasMore && (
                    <div ref={loadMoreRef} className="flex justify-center py-8">
                      <LoadingSpinner size="sm" className="border-t-accent" />
                    </div>
                  )}
                </SearchSection>
              )}

              {hasQuery && localBrowse.length > 0 && (
                <SearchSection title="Nella tua libreria">
                  <SearchGrid
                    items={localBrowse}
                    onPlay={onPlay}
                    onPlayStreaming={onPlayStreaming}
                    onOpenSeries={onOpenSeries}
                    onToggleFavorite={onToggleFavorite}
                    onEdit={onEdit}
                  />
                </SearchSection>
              )}

              {!showInitialLoader && !hasQuery && suggestionBrowse.length > 18 && (
                <SearchSection title="Altri titoli">
                  <SearchGrid
                    items={suggestionBrowse.slice(18, 42)}
                    onPlay={onPlay}
                    onPlayStreaming={onPlayStreaming}
                    onOpenSeries={onOpenSeries}
                    onToggleFavorite={onToggleFavorite}
                    onToggleStreamingList={onToggleStreamingList}
                    onEdit={onEdit}
                  />
                </SearchSection>
              )}

              {!showInitialLoader && !hasQuery && suggestionBrowse.length === 0 && (
                <p className="page-px py-10 text-[14px] text-text-muted">
                  Cerca per titolo, attore o regista. Puoi usare anche «film»,
                  «serie» o «anime» nella query.
                </p>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function SearchSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="mt-4 pb-2 sm:mt-7 sm:pb-3">
      <h3 className="page-px font-display text-[15px] font-semibold tracking-[-0.02em] text-text-primary sm:text-lg">
        {title}
      </h3>
      <div className="mt-3.5 sm:mt-4">{children}</div>
    </section>
  );
}

function SearchGrid({
  items,
  onPlay,
  onPlayStreaming,
  onOpenSeries,
}: {
  items: BrowseItem[];
  onPlay: (id: string) => void;
  onPlayStreaming: (preview: StremioMetaPreview) => void;
  onOpenSeries?: (seriesKey: string) => void;
  onToggleFavorite?: (id: string) => void;
  onToggleStreamingList?: (preview: StremioMetaPreview) => void;
  onEdit?: (id: string) => void;
}) {
  return (
    <div className="page-px browse-grid">
      {items.map((browse) => (
        <LordFlixPosterCard
          key={browseItemId(browse)}
          browse={browse}
          layout="grid"
          onPlay={onPlay}
          onPlayStreaming={onPlayStreaming}
          onOpenSeries={onOpenSeries}
        />
      ))}
    </div>
  );
}
