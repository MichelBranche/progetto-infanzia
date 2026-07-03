import { useMemo } from "react";
import { motion } from "framer-motion";
import type { BrowseItem } from "../lib/browse";
import { browseItemMedia } from "../lib/browse";
import {
  featuredFromBrowseItems,
  splitSectionBrowseRows,
} from "../lib/sectionBrowse";
import type { StremioMetaPreview } from "../types/stremio";
import { BrowseHero } from "./BrowseHero";
import { MediaRow } from "./MediaRow";
import { RowSkeleton } from "./RowSkeleton";

interface SectionBrowsePageProps {
  sectionId: string;
  title: string;
  subtitle?: string;
  syncing?: boolean;
  loading?: boolean;
  cardVariant?: "default" | "premium" | "portrait";
  items: BrowseItem[];
  onPlay: (id: string) => void;
  onPlayStreaming?: (preview: StremioMetaPreview) => void;
  onOpenDetail?: (browse: BrowseItem) => void;
  onOpenSeries?: (seriesKey: string) => void;
  onToggleFavorite?: (id: string) => void;
  onToggleStreamingList?: (preview: StremioMetaPreview) => void;
  onEdit?: (id: string) => void;
}

export function SectionBrowsePage({
  sectionId,
  title,
  subtitle,
  syncing,
  loading,
  cardVariant,
  items,
  onPlay,
  onPlayStreaming,
  onOpenDetail,
  onOpenSeries,
  onToggleFavorite,
  onToggleStreamingList,
  onEdit,
}: SectionBrowsePageProps) {
  const rows = useMemo(
    () => splitSectionBrowseRows(items, title),
    [items, title],
  );
  const featured = useMemo(() => featuredFromBrowseItems(items), [items]);

  const handlePlayFeatured = () => {
    if (!featured) return;
    const match = items.find((b) => browseItemMedia(b).id === featured.id);
    if (!match) {
      onPlay(featured.id);
      return;
    }
    if (match.kind === "streaming") {
      onPlayStreaming?.(match.preview);
      return;
    }
    if (match.kind === "series" && onOpenSeries) {
      onOpenSeries(
        `${match.series.mediaType}::${match.series.seriesTitle}`,
      );
      return;
    }
    if (match.kind === "media") onPlay(match.item.id);
  };

  if (loading && items.length === 0) {
    return (
      <div className="pb-16">
        <div className="h-[38vh] min-h-[260px] shimmer-bg sm:min-h-[300px]" />
        <div className="mt-4 space-y-2">
          <RowSkeleton />
          <RowSkeleton />
        </div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="flex min-h-[55vh] flex-col items-center justify-center page-px pt-24">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md text-center"
        >
          <p className="font-display text-2xl font-semibold text-text-primary">
            {title}
          </p>
          <p className="mt-3 text-[14px] text-text-muted">
            Nessun contenuto trovato in questa sezione.
            {syncing
              ? " Il catalogo si sta ancora aggiornando."
              : " Prova ad aggiornare il catalogo o aggiungi titoli in locale."}
          </p>
        </motion.div>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
      className="pb-20"
    >
      <BrowseHero
        title={title}
        subtitle={subtitle}
        syncing={syncing}
        count={items.length}
        featured={featured}
        onPlayFeatured={handlePlayFeatured}
      />

      <div className="relative z-10 -mt-6 space-y-1 sm:-mt-8">
        {rows.map((row, i) => (
          <MediaRow
            key={`${sectionId}-${row.key}`}
            index={String(i + 1).padStart(2, "0")}
            title={row.title}
            subtitle={row.subtitle}
            items={row.items}
            cardVariant={cardVariant}
            animateEntrance
            onPlay={onPlay}
            onPlayStreaming={onPlayStreaming}
            onOpenDetail={onOpenDetail}
            onOpenSeries={onOpenSeries}
            onToggleFavorite={onToggleFavorite}
            onToggleStreamingList={onToggleStreamingList}
            onEdit={onEdit}
          />
        ))}
      </div>
    </motion.div>
  );
}
