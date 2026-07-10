import { useRef } from "react";
import { ArrowRight, ChevronLeft, ChevronRight } from "lucide-react";
import { LordFlixPosterCard } from "./LordFlixPosterCard";
import { LordFlixContinueCard } from "./LordFlixContinueCard";
import type { BrowseItem } from "../lib/browse";
import { browseItemId } from "../lib/browse";
import {
  RowInteractionContext,
  useRowScrollContainer,
} from "../hooks/useRowScrollContainer";
import { useStaggerInView } from "../hooks/useStaggerInView";

interface MediaRowProps {
  index?: string;
  title: string;
  titleLogo?: string;
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
  layout?: "default" | "continue";
  showReflection?: boolean;
}

export function MediaRow({
  title,
  titleLogo,
  items,
  animateEntrance = false,
  onPlay,
  onPlayStreaming,
  onOpenDetail,
  onOpenSeries,
  actionLabel,
  onActionClick,
  layout = "default",
}: MediaRowProps) {
  const { scrollRef, collapseEpoch, scrollProps } = useRowScrollContainer();
  const sectionRef = useRef<HTMLElement>(null);
  useStaggerInView(sectionRef, ".stagger-card", animateEntrance, [items.length, title]);
  const isContinueRow = layout === "continue";

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
    <RowInteractionContext.Provider value={{ collapseEpoch }}>
      <section
        ref={sectionRef}
        className="group/row lf-home-row relative space-y-1 overflow-visible"
      >
        <div
          className={`${
            animateEntrance ? "stagger-card " : ""
          }page-px flex items-center justify-between`}
        >
          {titleLogo ? (
            <img
              src={titleLogo}
              alt={title}
              className="h-10 w-auto max-w-[min(100%,320px)] object-contain object-left sm:h-12"
            />
          ) : (
            <h2 className="lf-home-row__title title-safe">{title}</h2>
          )}

          {actionLabel && onActionClick && (
            <button
              type="button"
              onClick={onActionClick}
              className="group/label relative flex items-center gap-1 pl-2 text-sm font-medium text-white/50 transition-colors duration-300 hover:text-white"
            >
              <span className="relative z-10">{actionLabel}</span>
              <ArrowRight className="relative z-10 h-4 w-4 transition-transform duration-300 group-hover/label:translate-x-1" />
            </button>
          )}
        </div>

        <div className="lf-row-scroll relative">
          <button
            type="button"
            onClick={() => scroll("left")}
            aria-label="Scorri a sinistra"
            className="absolute left-4 top-1/2 z-[60] hidden h-12 w-12 -translate-y-1/2 cursor-pointer items-center justify-center bg-transparent opacity-0 drop-shadow-lg transition-all duration-300 hover:scale-110 group-hover/row:opacity-100 lg:flex"
          >
            <ChevronLeft className="h-10 w-10 text-white drop-shadow-md" />
          </button>
          <button
            type="button"
            onClick={() => scroll("right")}
            aria-label="Scorri a destra"
            className="absolute right-4 top-1/2 z-[60] hidden h-12 w-12 -translate-y-1/2 cursor-pointer items-center justify-center bg-transparent opacity-0 drop-shadow-lg transition-all duration-300 hover:scale-110 group-hover/row:opacity-100 lg:flex"
          >
            <ChevronRight className="h-10 w-10 text-white drop-shadow-md" />
          </button>

          <div
            ref={scrollRef}
            className={`scrollbar-hide page-px ${
              isContinueRow ? "lf-continue-scroll" : "lf-row-scroll__track"
            }`}
            {...scrollProps}
          >
            {items.map((browse) => (
              <div
                key={browseItemId(browse)}
                className={`${animateEntrance ? "stagger-card " : ""}${isContinueRow ? "" : "shrink-0"}`}
              >
                {isContinueRow ? (
                  <LordFlixContinueCard
                    browse={browse}
                    onPlay={onPlay}
                    onPlayStreaming={onPlayStreaming}
                    onOpenDetail={onOpenDetail}
                    onOpenSeries={onOpenSeries}
                  />
                ) : (
                  <LordFlixPosterCard
                    browse={browse}
                    layout="row"
                    onPlay={onPlay}
                    onPlayStreaming={onPlayStreaming}
                    onOpenDetail={onOpenDetail}
                    onOpenSeries={onOpenSeries}
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      </section>
    </RowInteractionContext.Provider>
  );
}
