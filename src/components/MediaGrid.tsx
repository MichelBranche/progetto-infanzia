import { motion } from "framer-motion";
import { MediaCard } from "./MediaCard";
import type { BrowseItem } from "../lib/browse";
import { browseItemId } from "../lib/browse";

import type { StremioMetaPreview } from "../types/stremio";

interface MediaGridProps {
  items: BrowseItem[];
  onPlay: (id: string) => void;
  onPlayStreaming?: (preview: StremioMetaPreview) => void;
  onOpenSeries?: (seriesKey: string) => void;
  onToggleFavorite?: (id: string) => void;
  onToggleStreamingList?: (preview: StremioMetaPreview) => void;
  onEdit?: (id: string) => void;
}

export function MediaGrid({
  items,
  onPlay,
  onPlayStreaming,
  onOpenSeries,
  onToggleFavorite,
  onToggleStreamingList,
  onEdit,
}: MediaGridProps) {
  if (items.length === 0) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center page-px pt-24">
        <p className="text-[14px] text-text-muted">Nessun contenuto trovato.</p>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="page-px grid grid-cols-2 gap-x-3 gap-y-8 pt-6 pb-16 sm:grid-cols-3 sm:gap-x-4 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6"
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
