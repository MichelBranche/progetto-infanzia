import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { StremioMetaPreview } from "../types/stremio";
import { CARD_HOVER_DELAY_MS, CARD_PREVIEW_SEC } from "../lib/preview";
import { top10NumberPad, top10PosterWidth } from "../lib/useCardDimensions";
import { prefetchScPreview } from "../lib/streamingPreviewCache";
import { streamingPreviewDisplayName } from "../lib/streamingBrowse";
import { usePreviewAudio } from "../context/PreviewAudioContext";
import { CoverImage } from "./CoverImage";
import { StreamingVideoPreview } from "./StreamingVideoPreview";

interface NetflixTop10RowProps {
  title: string;
  items: StremioMetaPreview[];
  onPlayStreaming: (preview: StremioMetaPreview) => void;
}

export function NetflixTop10Row({
  title,
  items,
  onPlayStreaming,
}: NetflixTop10RowProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [posterWidth, setPosterWidth] = useState(() =>
    top10PosterWidth(typeof window !== "undefined" ? window.innerWidth : 1024),
  );
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const { claimCardPreviewFocus, releaseCardPreviewFocus, isPreviewMuted } =
    usePreviewAudio();

  useEffect(() => {
    const onResize = () => setPosterWidth(top10PosterWidth(window.innerWidth));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  if (items.length === 0) return null;

  const visibleItems = items.slice(0, 10);
  const posterHeight = Math.round(posterWidth * (3 / 2));
  const numberSize =
    posterWidth >= 162 ? "8.5rem" : posterWidth >= 148 ? "7.75rem" : "6.75rem";

  const scroll = (direction: "left" | "right") => {
    const amount = Math.round(posterWidth * 2.8);
    scrollRef.current?.scrollBy({
      left: direction === "left" ? -amount : amount,
      behavior: "smooth",
    });
  };

  const clearHoverTimer = () => {
    if (hoverTimer.current) {
      window.clearTimeout(hoverTimer.current);
      hoverTimer.current = null;
    }
  };

  const handleItemEnter = (preview: StremioMetaPreview) => {
    const previewId = `top10:${preview.id}`;
    const canPreview = preview.catalogPrefix === "sc" && !!preview.slug;

    clearHoverTimer();
    hoverTimer.current = window.setTimeout(() => {
      setHoveredId(previewId);
      if (canPreview) {
        prefetchScPreview(preview.id, preview.slug!);
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
    <section className="group/top10 relative z-20 -mt-2 overflow-visible py-3 sm:-mt-4 sm:py-4">
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

      <div
        ref={scrollRef}
        className="scrollbar-hide flex items-end gap-0.5 overflow-x-auto overflow-y-visible px-[var(--page-px)] pb-3 pt-1 sm:gap-1"
      >
        {visibleItems.map((preview, index) => {
          const rank = index + 1;
          const previewId = `top10:${preview.id}`;
          const numberPad = top10NumberPad(rank, posterWidth);
          const canPreview = preview.catalogPrefix === "sc" && !!preview.slug;
          const isHovered = hoveredId === previewId;

          return (
            <button
              key={`${preview.type}:${preview.id}`}
              type="button"
              onClick={() => onPlayStreaming(preview)}
              onMouseEnter={() => handleItemEnter(preview)}
              onMouseLeave={() => handleItemLeave(preview)}
              className="group/item relative flex shrink-0 flex-col items-end"
              style={{
                width: numberPad + posterWidth,
              }}
            >
              <div
                className="relative flex items-end"
                style={{ height: posterHeight + 18 }}
              >
                <span
                  aria-hidden
                  className="pointer-events-none absolute bottom-[-6px] left-0 select-none font-display font-black leading-[0.82] tracking-[-0.06em] text-void sm:bottom-[-8px]"
                  style={{
                    fontSize: numberSize,
                    WebkitTextStroke: "2px rgba(255,255,255,0.45)",
                    paintOrder: "stroke fill",
                    color: "transparent",
                  }}
                >
                  {rank}
                </span>
                <div
                  className="relative z-10 ml-auto overflow-hidden rounded-md bg-[#1a1a1a] shadow-[0_8px_24px_rgba(0,0,0,0.45)] ring-1 ring-white/10 transition-transform duration-200 group-hover/item:scale-[1.05] group-hover/item:ring-white/25"
                  style={{ width: posterWidth, height: posterHeight }}
                >
                  {canPreview && isHovered && (
                    <StreamingVideoPreview
                      titleId={preview.id}
                      slug={preview.slug!}
                      active={isHovered}
                      maxDurationSec={CARD_PREVIEW_SEC}
                      muted={isPreviewMuted(previewId, isHovered)}
                      className="absolute inset-0 z-[1] h-full w-full object-cover"
                    />
                  )}
                  <CoverImage
                    src={preview.poster}
                    alt=""
                    className="h-full w-full"
                    imgClassName={`transition-opacity duration-200 ${
                      canPreview && isHovered ? "opacity-0" : ""
                    }`}
                    fallback={
                      <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-indigo-950 to-violet-950 px-2 text-center text-[11px] text-white/70">
                        {streamingPreviewDisplayName(preview)}
                      </div>
                    }
                  />
                  <div className="pointer-events-none absolute inset-0 z-[2] bg-gradient-to-t from-black/50 via-transparent to-transparent opacity-0 transition-opacity group-hover/item:opacity-100" />
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
    </section>
  );
}
