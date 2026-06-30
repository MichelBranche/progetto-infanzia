import { useRef } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { motion } from "framer-motion";
import { MediaCard } from "./MediaCard";
import type { BrowseItem } from "../lib/browse";
import { browseItemId } from "../lib/browse";

interface MediaRowProps {
  index: string;
  title: string;
  subtitle?: string;
  items: BrowseItem[];
  onPlay: (id: string) => void;
  onPlayStreaming?: (preview: import("../types/stremio").StremioMetaPreview) => void;
  onOpenSeries?: (seriesKey: string) => void;
  onToggleFavorite?: (id: string) => void;
  onToggleStreamingList?: (preview: import("../types/stremio").StremioMetaPreview) => void;
  onEdit?: (id: string) => void;
  actionLabel?: string;
  onActionClick?: () => void;
}

export function MediaRow({
  index,
  title,
  subtitle,
  items,
  onPlay,
  onPlayStreaming,
  onOpenSeries,
  onToggleFavorite,
  onToggleStreamingList,
  onEdit,
  actionLabel,
  onActionClick,
}: MediaRowProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const scroll = (direction: "left" | "right") => {
    if (!scrollRef.current) return;
    const amount = Math.round(window.innerWidth * 0.72);
    scrollRef.current.scrollBy({
      left: direction === "left" ? -amount : amount,
      behavior: "smooth",
    });
  };

  if (items.length === 0) return null;

  return (
    <section className="group/row page-px relative overflow-visible py-4 sm:py-5">
      <div className="mb-4 flex items-end justify-between sm:mb-5">
        <div className="flex items-baseline gap-3 sm:gap-4">
          <span className="font-display text-[11px] tabular-nums text-text-muted sm:text-xs">
            {index}
          </span>
          <div>
            <h2 className="title-safe font-display text-xl font-semibold tracking-[-0.02em] text-text-primary sm:text-2xl">
              {title}
            </h2>
            {subtitle && (
              <p className="title-clip mt-0.5 max-w-prose text-[12px] text-text-muted sm:text-[13px]">
                {subtitle}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {actionLabel && onActionClick && (
            <button
              type="button"
              onClick={onActionClick}
              className="shrink-0 text-[12px] font-medium text-text-muted transition-colors hover:text-text-primary sm:text-[13px]"
            >
              {actionLabel}
            </button>
          )}
          <div className="hidden items-center gap-1 opacity-0 transition-opacity group-hover/row:opacity-100 sm:flex">
          <motion.button
            onClick={() => scroll("left")}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/[0.06] bg-surface/80 text-text-secondary backdrop-blur-sm transition-colors hover:border-white/10 hover:text-text-primary"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            <ChevronLeft className="h-4 w-4" strokeWidth={1.5} />
          </motion.button>
          <motion.button
            onClick={() => scroll("right")}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/[0.06] bg-surface/80 text-text-secondary backdrop-blur-sm transition-colors hover:border-white/10 hover:text-text-primary"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            <ChevronRight className="h-4 w-4" strokeWidth={1.5} />
          </motion.button>
        </div>
        </div>
      </div>

      <div
        ref={scrollRef}
        className="scrollbar-hide -mx-1 flex items-end gap-2.5 overflow-x-auto overflow-y-visible px-1 pb-5 pt-1 sm:gap-3 sm:pb-6"
      >
        {items.map((browse, i) => (
          <MediaCard
            key={browseItemId(browse)}
            browse={browse}
            index={i}
            onPlay={onPlay}
            onPlayStreaming={onPlayStreaming}
            onOpenSeries={onOpenSeries}
            onToggleFavorite={onToggleFavorite}
            onToggleStreamingList={onToggleStreamingList}
            onEdit={onEdit}
          />
        ))}
      </div>
    </section>
  );
}
