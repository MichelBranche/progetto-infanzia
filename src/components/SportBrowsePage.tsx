import { memo, useMemo } from "react";
import { motion } from "framer-motion";
import { HeroBanner } from "./HeroBanner";
import { MediaRow } from "./MediaRow";
import { HeroSkeleton, RowSkeleton } from "./Skeleton";
import type { BrowseItem } from "../lib/browse";
import { buildSportBrowseLayout } from "../lib/sportBrowse";
import { previewToMediaItem } from "../lib/streamingBrowse";
import type { StreamingRow } from "../lib/useStreamingCatalogs";
import type { StremioMetaPreview } from "../types/stremio";

interface SportBrowsePageProps {
  title: string;
  subtitle?: string;
  syncing?: boolean;
  loading?: boolean;
  items: BrowseItem[];
  streamingRows?: StreamingRow[];
  onPlay: (id: string) => void;
  onPlayStreaming: (preview: StremioMetaPreview) => void;
  onOpenDetail?: (browse: BrowseItem) => void;
  onOpenSeries?: (seriesKey: string) => void;
  onToggleStreamingList?: (preview: StremioMetaPreview) => void;
}

export const SportBrowsePage = memo(function SportBrowsePage({
  title,
  subtitle,
  syncing,
  loading,
  items,
  streamingRows = [],
  onPlay,
  onPlayStreaming,
  onOpenDetail,
  onOpenSeries,
  onToggleStreamingList,
}: SportBrowsePageProps) {
  const layout = useMemo(
    () => buildSportBrowseLayout(items, streamingRows),
    [items, streamingRows],
  );

  const heroItems = useMemo(
    () => layout.heroPreviews.map((preview) => previewToMediaItem(preview)),
    [layout.heroPreviews],
  );

  if (loading && layout.rows.length === 0) {
    return (
      <div className="relative pb-20">
        <HeroSkeleton />
        <div className="page-px space-y-6 pt-4">
          <RowSkeleton />
          <RowSkeleton />
          <RowSkeleton />
        </div>
      </div>
    );
  }

  if (layout.rows.length === 0) {
    return (
      <div className="flex min-h-[55vh] flex-col items-center justify-center page-px pt-24 text-center">
        <p className="lf-discovery-header__title">{title}</p>
        <p className="mt-3 max-w-md text-[14px] text-text-muted">
          {syncing
            ? "Aggiornamento catalogo Sport in corso…"
            : subtitle || "Nessun contenuto sportivo disponibile al momento."}
        </p>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.35 }}
      className="relative z-0 pb-[max(5rem,var(--mobile-nav-height))] sm:pb-20"
    >
      {heroItems.length > 0 ? (
        <HeroBanner
          fullPage
          syncAmbient
          items={heroItems}
          onPlay={onPlay}
          onOpenDetail={onOpenDetail}
          onOpenSeries={
            onOpenSeries
              ? (media) => {
                  if (media.seriesTitle) {
                    onOpenSeries(`${media.mediaType}::${media.seriesTitle}`);
                  }
                }
              : undefined
          }
          onToggleStreamingList={onToggleStreamingList}
        />
      ) : (
        <div className="page-px pb-2 pt-[calc(var(--app-nav-height)+1.25rem)]">
          <h1 className="lf-discovery-header__title">{title}</h1>
          {subtitle && (
            <p className="mt-1 text-[13px] text-text-muted">{subtitle}</p>
          )}
        </div>
      )}

      <div className="lf-home-content relative z-10 -mt-4 space-y-1 sm:-mt-6">
        {syncing && (
          <p className="page-px pb-2 text-[12px] text-text-muted">
            Aggiornamento catalogo Sport…
          </p>
        )}
        {layout.rows.map((row, index) => (
          <MediaRow
            key={row.key}
            index={String(index + 1).padStart(2, "0")}
            title={row.title}
            items={row.items}
            animateEntrance={index < 4}
            onPlay={onPlay}
            onPlayStreaming={onPlayStreaming}
            onOpenDetail={onOpenDetail}
            onOpenSeries={onOpenSeries}
            onToggleStreamingList={onToggleStreamingList}
          />
        ))}
      </div>
    </motion.div>
  );
});
