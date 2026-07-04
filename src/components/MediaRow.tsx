import { ChevronLeft, ChevronRight } from "lucide-react";
import { motion } from "framer-motion";
import { MediaCard } from "./MediaCard";
import { StreamingMediaCard } from "./StreamingMediaCard";
import type { BrowseItem } from "../lib/browse";
import { browseItemId } from "../lib/browse";
import {
  RowInteractionContext,
  useRowScrollContainer,
} from "../hooks/useRowScrollContainer";

interface MediaRowProps {
  index: string;
  title: string;
  subtitle?: string;
  items: BrowseItem[];
  animateEntrance?: boolean;
  cardVariant?: "default" | "premium" | "portrait";
  onPlay: (id: string) => void;
  onPlayStreaming?: (preview: import("../types/stremio").StremioMetaPreview) => void;
  onOpenDetail?: (browse: BrowseItem) => void;
  onOpenSeries?: (seriesKey: string) => void;
  onToggleFavorite?: (id: string) => void;
  onToggleStreamingList?: (preview: import("../types/stremio").StremioMetaPreview) => void;
  onEdit?: (id: string) => void;
  actionLabel?: string;
  onActionClick?: () => void;
}

const rowMotion = {
  hidden: { opacity: 0, y: 20 },
  show: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.55,
      ease: [0.22, 1, 0.36, 1] as const,
      staggerChildren: 0.035,
      delayChildren: 0.08,
    },
  },
};

const cardMotion = {
  hidden: { opacity: 0, y: 16, scale: 0.96 },
  show: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] as const },
  },
};

export function MediaRow({
  index,
  title,
  subtitle,
  items,
  animateEntrance = false,
  cardVariant,
  onPlay,
  onPlayStreaming,
  onOpenDetail,
  onOpenSeries,
  onToggleFavorite,
  onToggleStreamingList,
  onEdit,
  actionLabel,
  onActionClick,
}: MediaRowProps) {
  const { scrollRef, collapseEpoch, scrollProps } = useRowScrollContainer();
  const usePremiumCards =
    cardVariant === "premium" ||
    (cardVariant !== "default" &&
      items.length > 0 &&
      items.every((item) => item.kind === "streaming"));
  const renderStreamingPremium =
    cardVariant === "premium" ||
    (cardVariant !== "default" && cardVariant !== "portrait");
  const hasStreamingCards =
    renderStreamingPremium && items.some((item) => item.kind === "streaming");

  const scroll = (direction: "left" | "right") => {
    if (!scrollRef.current) return;
    const amount = Math.round(window.innerWidth * 0.72);
    scrollRef.current.scrollBy({
      left: direction === "left" ? -amount : amount,
      behavior: "smooth",
    });
  };

  if (items.length === 0) return null;

  const Section = animateEntrance ? motion.section : "section";
  const sectionProps = animateEntrance
    ? {
        variants: rowMotion,
        initial: "hidden" as const,
        whileInView: "show" as const,
        viewport: { once: true, margin: "-40px" },
      }
    : {};

  const CardWrap = animateEntrance ? motion.div : "div";
  const cardWrapProps = animateEntrance ? { variants: cardMotion } : {};

  return (
    <RowInteractionContext.Provider value={{ collapseEpoch }}>
    <Section
      className={`group/row page-px relative overflow-visible ${
        usePremiumCards || hasStreamingCards
          ? "group/stream-row z-10 py-3 hover:z-30 sm:py-4"
          : "py-4 sm:py-5"
      }`}
      {...sectionProps}
    >
      <div
        className={`flex items-end justify-between ${
          usePremiumCards || hasStreamingCards ? "mb-1.5 sm:mb-2" : "mb-4 sm:mb-5"
        }`}
      >
        <div className="flex items-baseline gap-3 sm:gap-4">
          {!usePremiumCards && (
            <span className="font-display text-[11px] tabular-nums text-text-muted/80 sm:text-xs">
              {index}
            </span>
          )}
          <div>
            <div className="flex items-baseline gap-3">
              <h2
                className={
                  usePremiumCards
                    ? "stream-row-title title-safe"
                    : "title-safe font-display text-xl font-semibold tracking-[-0.025em] text-text-primary sm:text-[1.65rem]"
                }
              >
                {title}
              </h2>
              {actionLabel && onActionClick && usePremiumCards && (
                <button
                  type="button"
                  onClick={onActionClick}
                  className="shrink-0 text-[13px] font-medium text-white/55 transition-colors hover:text-white/85"
                >
                  {actionLabel} ›
                </button>
              )}
            </div>
            {subtitle && !usePremiumCards && (
              <p className="title-clip mt-1 max-w-prose text-[12px] text-text-muted sm:text-[13px]">
                {subtitle}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {actionLabel && onActionClick && !usePremiumCards && (
            <button
              type="button"
              onClick={onActionClick}
              className="shrink-0 text-[12px] font-medium text-text-muted transition-colors hover:text-text-primary sm:text-[13px]"
            >
              {actionLabel}
            </button>
          )}
          {!usePremiumCards && (
          <div className="hidden items-center gap-1 opacity-0 transition-opacity duration-300 group-hover/row:opacity-100 sm:flex">
            <motion.button
              onClick={() => scroll("left")}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-white/[0.08] bg-void/90 text-text-secondary shadow-[0_8px_24px_rgba(0,0,0,0.4)] backdrop-blur-md transition-colors hover:border-white/14 hover:text-text-primary"
              whileHover={{ scale: 1.06 }}
              whileTap={{ scale: 0.94 }}
            >
              <ChevronLeft className="h-4 w-4" strokeWidth={1.75} />
            </motion.button>
            <motion.button
              onClick={() => scroll("right")}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-white/[0.08] bg-void/90 text-text-secondary shadow-[0_8px_24px_rgba(0,0,0,0.4)] backdrop-blur-md transition-colors hover:border-white/14 hover:text-text-primary"
              whileHover={{ scale: 1.06 }}
              whileTap={{ scale: 0.94 }}
            >
              <ChevronRight className="h-4 w-4" strokeWidth={1.75} />
            </motion.button>
          </div>
          )}
        </div>
      </div>

      <div
        className={`row-edge-fade relative -mx-1 ${
          hasStreamingCards ? "row-edge-fade--stream pr-10" : ""
        }`}
      >
        <div
          ref={scrollRef}
          className={`scrollbar-hide flex overflow-x-auto overflow-y-visible px-1 ${
            hasStreamingCards
              ? "stream-row-scroll"
              : "items-end gap-2.5 pb-5 pt-1 sm:gap-3 sm:pb-6"
          }`}
          {...scrollProps}
        >
          {items.map((browse, i) => (
            <CardWrap
              key={browseItemId(browse)}
              className={`shrink-0${hasStreamingCards ? " overflow-visible" : ""}`}
              {...cardWrapProps}
            >
              {renderStreamingPremium && browse.kind === "streaming" ? (
                <StreamingMediaCard
                  browse={browse}
                  onPlayStreaming={onPlayStreaming}
                  onOpenDetail={onOpenDetail}
                  onToggleStreamingList={onToggleStreamingList}
                />
              ) : (
                <MediaCard
                  browse={browse}
                  index={i}
                  onPlay={onPlay}
                  onPlayStreaming={onPlayStreaming}
                  onOpenDetail={onOpenDetail}
                  onOpenSeries={onOpenSeries}
                  onToggleFavorite={onToggleFavorite}
                  onToggleStreamingList={onToggleStreamingList}
                  onEdit={onEdit}
                />
              )}
            </CardWrap>
          ))}
        </div>
        {hasStreamingCards && (
          <button
            type="button"
            onClick={() => scroll("right")}
            className="stream-row-chevron hidden sm:flex"
            aria-label="Scorri a destra"
          >
            <ChevronRight className="h-5 w-5" strokeWidth={1.75} />
          </button>
        )}
      </div>
    </Section>
    </RowInteractionContext.Provider>
  );
}
