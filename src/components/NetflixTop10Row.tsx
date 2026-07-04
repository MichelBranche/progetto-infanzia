import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { StremioMetaPreview } from "../types/stremio";
import type { BrowseItem } from "../lib/browse";
import { streamingBrowseItem } from "../lib/streamingBrowse";
import { CARD_HOVER_DELAY_MS, CARD_PREVIEW_SEC } from "../lib/preview";
import { top10NumberPad, top10PosterWidth } from "../lib/useCardDimensions";
import { prefetchStreamingPreview } from "../lib/streamingPreviewCache";
import { previewToStreamingTarget } from "../lib/streamingHeroPreview";
import { streamingPreviewDisplayName } from "../lib/streamingBrowse";
import { usePreviewAudio } from "../context/PreviewAudioContext";
import { PreviewAudioToggle } from "./PreviewAudioToggle";
import { StreamingVideoPreview } from "./StreamingVideoPreview";
import {
  RowInteractionContext,
  useRowScrollContainer,
  isRowDragging,
} from "../hooks/useRowScrollContainer";

interface NetflixTop10RowProps {
  title: string;
  items: StremioMetaPreview[];
  onPlayStreaming: (preview: StremioMetaPreview) => void;
  onOpenDetail?: (browse: BrowseItem) => void;
}

export function NetflixTop10Row({
  title,
  items,
  onPlayStreaming,
  onOpenDetail,
}: NetflixTop10RowProps) {
  const { scrollRef, collapseEpoch, scrollProps } = useRowScrollContainer();
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pointerDragRef = useRef({ active: false, x: 0, y: 0 });
  const [posterWidth, setPosterWidth] = useState(() =>
    top10PosterWidth(typeof window !== "undefined" ? window.innerWidth : 1024),
  );
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const { claimCardPreviewFocus, releaseCardPreviewFocus, isPreviewMuted, previewAudio, togglePreviewAudio } =
    usePreviewAudio();

  useEffect(() => {
    const onResize = () => setPosterWidth(top10PosterWidth(window.innerWidth));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const clearHoverTimer = () => {
    if (hoverTimer.current) {
      window.clearTimeout(hoverTimer.current);
      hoverTimer.current = null;
    }
  };

  useEffect(() => {
    clearHoverTimer();
    setHoveredId(null);
  }, [collapseEpoch]);

  if (items.length === 0) return null;

  const visibleItems = items.slice(0, 10);
  const posterHeight = Math.round(posterWidth * (3 / 2));
  const numberSize =
    posterWidth >= 156 ? "7.25rem" : posterWidth >= 140 ? "6.5rem" : "5.75rem";

  const scroll = (direction: "left" | "right") => {
    const amount = Math.round(posterWidth * 2.8);
    scrollRef.current?.scrollBy({
      left: direction === "left" ? -amount : amount,
      behavior: "smooth",
    });
  };

  const handleItemEnter = (preview: StremioMetaPreview) => {
    if (isRowDragging()) return;
    const previewId = `top10:${preview.id}`;
    const streamTarget = previewToStreamingTarget(preview);
    const canPreview = streamTarget != null;

    clearHoverTimer();
    hoverTimer.current = window.setTimeout(() => {
      setHoveredId(previewId);
      if (canPreview && streamTarget) {
        prefetchStreamingPreview(streamTarget, CARD_PREVIEW_SEC);
        claimCardPreviewFocus(previewId);
      }
    }, CARD_HOVER_DELAY_MS);
  };

  const handleItemLeave = (preview: StremioMetaPreview) => {
    clearHoverTimer();
    setHoveredId(null);
    releaseCardPreviewFocus(`top10:${preview.id}`);
  };

  return (
    <RowInteractionContext.Provider value={{ collapseEpoch }}>
    <section className="group/top10 relative z-10 -mt-2 overflow-visible py-3 hover:z-30 sm:-mt-4 sm:py-4">
      <div className="page-px">
        <div className="mb-4 flex flex-col items-center gap-3 sm:mb-5">
          <h2 className="font-display text-center text-xl font-semibold tracking-[-0.02em] text-text-primary sm:text-2xl">
            {title}
          </h2>
          <div className="hidden items-center gap-1.5 opacity-0 transition-opacity group-hover/top10:opacity-100 sm:flex">
            <button
              type="button"
              onClick={() => scroll("left")}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur-sm transition-colors hover:bg-white/20"
              aria-label="Scorri indietro"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => scroll("right")}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur-sm transition-colors hover:bg-white/20"
              aria-label="Scorri avanti"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      <div className="overflow-visible px-[var(--page-px)] pb-2">
        <div
          ref={scrollRef}
          className="scrollbar-hide flex items-end gap-3 overflow-x-auto overflow-y-visible pb-2 pt-1 sm:gap-4"
          {...scrollProps}
        >
          {visibleItems.map((preview, index) => {
            const rank = index + 1;
            const previewId = `top10:${preview.id}`;
            const numberPad = top10NumberPad(rank, posterWidth);
            const streamTarget = previewToStreamingTarget(preview);
            const canPreview = streamTarget != null;
            const isHovered = hoveredId === previewId;

            return (
              <button
                key={`${preview.type}:${preview.id}`}
                type="button"
                onClick={() => {
                  if (pointerDragRef.current.active || isRowDragging()) {
                    pointerDragRef.current.active = false;
                    return;
                  }
                  if (onOpenDetail) {
                    onOpenDetail(streamingBrowseItem(preview));
                    return;
                  }
                  onPlayStreaming(preview);
                }}
                onPointerDown={(event) => {
                  pointerDragRef.current = {
                    active: false,
                    x: event.clientX,
                    y: event.clientY,
                  };
                  clearHoverTimer();
                }}
                onPointerMove={(event) => {
                  const pointer = pointerDragRef.current;
                  if (
                    Math.hypot(
                      event.clientX - pointer.x,
                      event.clientY - pointer.y,
                    ) >= 8
                  ) {
                    pointer.active = true;
                    clearHoverTimer();
                    setHoveredId(null);
                  }
                }}
                onPointerUp={() => {
                  window.setTimeout(() => {
                    pointerDragRef.current.active = false;
                  }, 0);
                }}
                onMouseEnter={() => handleItemEnter(preview)}
                onMouseLeave={() => handleItemLeave(preview)}
                className="group/item relative flex shrink-0 flex-col items-end"
                style={{
                  width: numberPad + posterWidth,
                }}
              >
                <div
                  className="relative flex w-full items-end"
                  style={{ height: posterHeight }}
                >
                  <span
                    aria-hidden
                    className="pointer-events-none absolute bottom-0 left-0 z-[5] select-none font-display font-black leading-[0.82] tracking-[-0.06em]"
                    style={{
                      fontSize: numberSize,
                      color: "#060608",
                      WebkitTextStroke: "2.5px rgba(255,255,255,0.6)",
                      paintOrder: "stroke fill",
                    }}
                  >
                    {rank}
                  </span>
                  <div
                    className="relative z-[2] ml-auto shrink-0 overflow-hidden rounded-md bg-[#1a1a1a] shadow-[0_8px_24px_rgba(0,0,0,0.45)] ring-1 ring-white/10 transition-transform duration-200 group-hover/item:scale-[1.05] group-hover/item:ring-white/25"
                    style={{ width: posterWidth, height: posterHeight }}
                  >
                    {canPreview && isHovered && streamTarget && (
                      <StreamingVideoPreview
                        target={streamTarget}
                        active={isHovered}
                        maxDurationSec={CARD_PREVIEW_SEC}
                        muted={isPreviewMuted(previewId, isHovered)}
                        className="absolute inset-0 z-[1] h-full w-full object-cover"
                      />
                    )}
                    {preview.poster ? (
                      <img
                        src={preview.poster}
                        alt=""
                        loading="eager"
                        decoding="async"
                        className={`h-full w-full object-cover transition-opacity duration-200 ${
                          canPreview && isHovered ? "opacity-0" : ""
                        }`}
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-indigo-950 to-violet-950 px-2 text-center text-[11px] text-white/70">
                        {streamingPreviewDisplayName(preview)}
                      </div>
                    )}
                    <div className="pointer-events-none absolute inset-0 z-[2] bg-gradient-to-t from-black/50 via-transparent to-transparent opacity-0 transition-opacity group-hover/item:opacity-100" />
                    {canPreview && isHovered && (
                      <div className="absolute right-1.5 top-1.5 z-[10]">
                        <PreviewAudioToggle
                          enabled={previewAudio}
                          onToggle={togglePreviewAudio}
                          className="!h-8 !w-8"
                        />
                      </div>
                    )}
                  </div>
                </div>
                <p
                  className="title-clip mt-1.5 w-full pr-0.5 text-right text-[11px] font-medium leading-tight text-text-primary sm:text-[12px]"
                  style={{ maxWidth: posterWidth + numberPad }}
                >
                  {streamingPreviewDisplayName(preview)}
                </p>
              </button>
            );
          })}
        </div>
      </div>
    </section>
    </RowInteractionContext.Provider>
  );
}
