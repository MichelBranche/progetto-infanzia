import { useEffect, useMemo, useRef, type ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2 } from "lucide-react";
import { LordFlixPosterCard } from "./LordFlixPosterCard";
import type { MediaItem } from "../types/media";
import type { StremioMetaPreview } from "../types/stremio";
import type { BrowseItem } from "../lib/browse";
import { toBrowseItems, browseItemId } from "../lib/browse";
import { streamingBrowseItem } from "../lib/streamingBrowse";
import { enrichStreamingPreview } from "../lib/unifiedBrowse";
import { partitionStreamingBrowseItems } from "../lib/searchGroups";
import { LoadingSpinner } from "./LoadingSpinner";

interface SearchOverlayProps {
  open: boolean;
  query: string;
  onClose: () => void;
  localResults: MediaItem[];
  streamingResults: StremioMetaPreview[];
  streamingTotal?: number;
  suggestions: StremioMetaPreview[];
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
  const streamingGroups = useMemo(
    () => partitionStreamingBrowseItems(streamingBrowse),
    [streamingBrowse],
  );
  const suggestionBrowse = useMemo(
    () =>
      suggestions
        .slice(0, 36)
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
          className="absolute inset-x-0 bottom-0 top-[4.5rem] z-[25] bg-void sm:top-[5.25rem]"
          aria-hidden={!open}
        >
          <div className="flex h-full min-h-0 flex-col">
            <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden pb-16">
              {showInitialLoader && (
                <div className="flex items-center gap-3 page-px py-8 text-text-muted">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span className="text-[15px]">Ricerca in corso…</span>
                </div>
              )}

              {hasQuery && streamingLoading && streamingResults.length > 0 && (
                <p className="page-px pb-1 pt-2 text-[12px] text-text-muted">
                  Aggiornamento risultati…
                </p>
              )}

              {!showInitialLoader && hasQuery && totalResults === 0 && !streamingLoading && (
                <p className="page-px py-10 text-[15px] text-text-secondary">
                  Nessun risultato per{" "}
                  <span className="font-medium text-text-primary">«{trimmed}»</span>
                </p>
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
                    items={suggestionBrowse.slice(0, 12)}
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
                <>
                  {streamingGroups.sc.length > 0 && (
                    <SearchSection title="Streaming Community">
                      <SearchGrid
                        items={streamingGroups.sc}
                        onPlay={onPlay}
                        onPlayStreaming={onPlayStreaming}
                        onOpenSeries={onOpenSeries}
                        onToggleFavorite={onToggleFavorite}
                        onToggleStreamingList={onToggleStreamingList}
                        onEdit={onEdit}
                      />
                    </SearchSection>
                  )}
                  {streamingGroups.saturn.length > 0 && (
                    <SearchSection title="Anime (AnimeSaturn)">
                      <SearchGrid
                        items={streamingGroups.saturn}
                        onPlay={onPlay}
                        onPlayStreaming={onPlayStreaming}
                        onOpenSeries={onOpenSeries}
                        onToggleFavorite={onToggleFavorite}
                        onToggleStreamingList={onToggleStreamingList}
                        onEdit={onEdit}
                      />
                    </SearchSection>
                  )}
                  {streamingGroups.other.length > 0 && (
                    <SearchSection title="Altri cataloghi">
                      <SearchGrid
                        items={streamingGroups.other}
                        onPlay={onPlay}
                        onPlayStreaming={onPlayStreaming}
                        onOpenSeries={onOpenSeries}
                        onToggleFavorite={onToggleFavorite}
                        onToggleStreamingList={onToggleStreamingList}
                        onEdit={onEdit}
                      />
                    </SearchSection>
                  )}
                  {streamingHasMore && (
                    <div ref={loadMoreRef} className="flex justify-center py-8">
                      <LoadingSpinner size="sm" className="border-t-accent" />
                    </div>
                  )}
                </>
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

              {!showInitialLoader && !hasQuery && suggestionBrowse.length > 12 && (
                <SearchSection title="Altri titoli">
                  <SearchGrid
                    items={suggestionBrowse.slice(12, 36)}
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
                  Inizia a digitare per cercare film e serie in streaming e nella
                  tua libreria.
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
    <section className="mt-4 sm:mt-6">
      <h3 className="page-px font-display text-base font-semibold tracking-[-0.02em] text-text-primary sm:text-lg">
        {title}
      </h3>
      <div className="mt-3">{children}</div>
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
