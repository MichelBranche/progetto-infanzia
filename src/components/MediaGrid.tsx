import { motion } from "framer-motion";
import { LordFlixPosterCard } from "./LordFlixPosterCard";
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
      className="page-px browse-grid pt-6 pb-16"
    >
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
    </motion.div>
  );
}
