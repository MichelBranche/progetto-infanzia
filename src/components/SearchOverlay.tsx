import { useEffect, type ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2 } from "lucide-react";
import { MediaCard } from "./MediaCard";
import { MediaRow } from "./MediaRow";
import type { MediaItem } from "../types/media";
import type { StremioMetaPreview } from "../types/stremio";
import type { BrowseItem } from "../lib/browse";
import { toBrowseItems, browseItemId } from "../lib/browse";
import { streamingBrowseItem } from "../lib/streamingBrowse";
import { enrichStreamingPreview } from "../lib/unifiedBrowse";

interface SearchOverlayProps {
  open: boolean;
  query: string;
  onClose: () => void;
  localResults: MediaItem[];
  streamingResults: StremioMetaPreview[];
  suggestions: StremioMetaPreview[];
  streamingLoading?: boolean;
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
  suggestions,
  streamingLoading,
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
  const loading = hasQuery && streamingLoading;
  const localBrowse = toBrowseItems(localResults);
  const streamingBrowse = streamingResults.map((preview) =>
    streamingBrowseItem(enrich(preview)),
  );
  const suggestionBrowse = suggestions.map((preview) =>
    streamingBrowseItem(enrich(preview)),
  );
  const totalResults = localBrowse.length + streamingBrowse.length;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

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
              {loading && (
                <div className="flex items-center gap-3 page-px py-8 text-text-muted">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span className="text-[15px]">Ricerca in corso…</span>
                </div>
              )}

              {!loading && hasQuery && totalResults === 0 && (
                <p className="page-px py-10 text-[15px] text-text-secondary">
                  Nessun risultato per{" "}
                  <span className="font-medium text-text-primary">«{trimmed}»</span>
                </p>
              )}

              {!loading && hasQuery && totalResults > 0 && (
                <p className="page-px pb-2 pt-2 text-[13px] text-text-muted">
                  {totalResults} risultat{totalResults === 1 ? "o" : "i"}
                </p>
              )}

              {!loading && !hasQuery && suggestionBrowse.length > 0 && (
                <MediaRow
                  index="01"
                  title="In evidenza"
                  subtitle="Titoli popolari in streaming"
                  items={suggestionBrowse}
                  onPlay={onPlay}
                  onPlayStreaming={onPlayStreaming}
                  onOpenSeries={onOpenSeries}
                  onToggleFavorite={onToggleFavorite}
                  onToggleStreamingList={onToggleStreamingList}
                  onEdit={onEdit}
                />
              )}

              {!loading && hasQuery && streamingBrowse.length > 0 && (
                <SearchSection title="In streaming">
                  <SearchGrid
                    items={streamingBrowse}
                    onPlay={onPlay}
                    onPlayStreaming={onPlayStreaming}
                    onOpenSeries={onOpenSeries}
                    onToggleFavorite={onToggleFavorite}
                    onToggleStreamingList={onToggleStreamingList}
                    onEdit={onEdit}
                  />
                </SearchSection>
              )}

              {!loading && hasQuery && localBrowse.length > 0 && (
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

              {!loading && !hasQuery && suggestionBrowse.length > 12 && (
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

              {!loading && !hasQuery && suggestionBrowse.length === 0 && (
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
  onToggleFavorite,
  onToggleStreamingList,
  onEdit,
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
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="page-px browse-grid"
    >
      {items.map((browse, i) => (
        <MediaCard
          key={browseItemId(browse)}
          browse={browse}
          index={i}
          layout="grid"
          onPlay={onPlay}
          onPlayStreaming={onPlayStreaming}
          onOpenSeries={onOpenSeries}
          onToggleFavorite={onToggleFavorite}
          onToggleStreamingList={onToggleStreamingList}
          onEdit={onEdit}
        />
      ))}
    </motion.div>
  );
}
