import { memo, useMemo, useState, type MouseEvent, type PointerEvent } from "react";
import { Play } from "lucide-react";
import type { BrowseItem } from "../lib/browse";
import { browseItemMedia, browseItemTitle } from "../lib/browse";
import type { StremioMetaPreview } from "../types/stremio";
import type { MediaItem } from "../types/media";
import { mediaTypeLabel, watchProgressPercent } from "../types/media";
import { isRowDragging } from "../hooks/useRowScrollContainer";
import {
  playCardNavigationSound,
  playCardOpenTitleSound,
} from "../lib/cardNavigationSound";
import { PosterImage, posterUrlFor } from "./PosterImage";

export interface LordFlixPosterCardProps {
  browse: BrowseItem;
  layout?: "row" | "grid";
  showReflection?: boolean;
  onOpen?: (browse: BrowseItem) => void;
  onPlay?: (id: string) => void;
  onPlayStreaming?: (preview: StremioMetaPreview) => void;
  onOpenDetail?: (browse: BrowseItem) => void;
  onOpenSeries?: (seriesKey: string) => void;
}

function displayYear(preview: StremioMetaPreview, year?: number): string | null {
  if (year) return String(year);
  const info = preview.releaseInfo?.trim();
  if (!info) return null;
  const match = info.match(/\b(19|20)\d{2}\b/);
  return match?.[0] ?? null;
}

function subtitleFor(browse: BrowseItem, media: MediaItem): string | null {
  if (browse.kind === "series") {
    return `${browse.episodeCount} episodi`;
  }
  if (browse.kind === "streaming") {
    const yearLabel = displayYear(browse.preview, media.year);
    return yearLabel ?? mediaTypeLabel(media.mediaType);
  }
  return media.year ? String(media.year) : mediaTypeLabel(media.mediaType);
}

function resolveProgress(browse: BrowseItem, media: MediaItem): number {
  if (browse.kind === "media") {
    return watchProgressPercent(browse.item);
  }
  if (browse.kind === "series") {
    return watchProgressPercent(browse.representative);
  }
  if (browse.kind === "streaming") {
    const { watchPosition, watchDuration } = browse.preview;
    if (watchPosition != null && watchPosition > 5) {
      return watchDuration
        ? watchProgressPercent({
            watchPosition,
            watchDuration,
          } as MediaItem)
        : 12;
    }
  }
  return watchProgressPercent(media);
}

function openBrowseItem(
  browse: BrowseItem,
  handlers: Pick<
    LordFlixPosterCardProps,
    "onOpen" | "onPlay" | "onPlayStreaming" | "onOpenDetail" | "onOpenSeries"
  >,
) {
  if (handlers.onOpen) {
    handlers.onOpen(browse);
    return;
  }
  if (handlers.onOpenDetail) {
    handlers.onOpenDetail(browse);
    return;
  }
  if (browse.kind === "streaming") {
    handlers.onPlayStreaming?.(browse.preview);
    return;
  }
  if (browse.kind === "series" && handlers.onOpenSeries) {
    handlers.onOpenSeries(
      `${browse.series.mediaType}::${browse.series.seriesTitle}`,
    );
    return;
  }
  if (browse.kind === "media") {
    handlers.onPlay?.(browse.item.id);
  }
}

export const LordFlixPosterCard = memo(function LordFlixPosterCard({
  browse,
  layout = "row",
  showReflection = false,
  onOpen,
  onPlay,
  onPlayStreaming,
  onOpenDetail,
  onOpenSeries,
}: LordFlixPosterCardProps) {
  const title = browseItemTitle(browse);
  const media = browseItemMedia(browse);
  const progress = resolveProgress(browse, media);
  const isGrid = layout === "grid";
  const subtitle = isGrid ? subtitleFor(browse, media) : null;
  const hoverYear =
    browse.kind === "streaming"
      ? displayYear(browse.preview, media.year)
      : media.year
        ? String(media.year)
        : null;
  const posterUrl = useMemo(() => posterUrlFor(media, "browse"), [media]);
  const [reflectionSrc, setReflectionSrc] = useState<string | undefined>(
    showReflection ? posterUrl : undefined,
  );

  const handleImageLoad = (image: HTMLImageElement) => {
    if (!showReflection) return;
    const src = image.currentSrc || image.src;
    if (src && src !== reflectionSrc) setReflectionSrc(src);
  };

  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    if (isRowDragging()) {
      event.preventDefault();
      return;
    }
    playCardOpenTitleSound();
    openBrowseItem(browse, {
      onOpen,
      onPlay,
      onPlayStreaming,
      onOpenDetail,
      onOpenSeries,
    });
  };

  const handlePointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    if (isRowDragging()) {
      event.preventDefault();
    }
  };

  return (
    <button
      type="button"
      className={`lf-browse-card group/card ${isGrid ? "lf-browse-card--grid" : ""}`}
      onMouseEnter={() => {
        if (!isRowDragging()) playCardNavigationSound();
      }}
      onClick={handleClick}
      onPointerDown={handlePointerDown}
      aria-label={title}
    >
      <div className="lf-browse-card__stage">
        <div className="lf-browse-card__frame">
          <PosterImage
            item={media}
            variant="browse"
            className="lf-browse-card__img"
            onImageLoad={handleImageLoad}
          />
          <div className="lf-browse-card__sheen" aria-hidden />
          <div className="lf-browse-card__hover" aria-hidden>
            <span className="lf-browse-card__play">
              <Play className="h-6 w-6 fill-current" />
            </span>
            <div className="lf-browse-card__hover-body">
              <h3 className="lf-browse-card__hover-title">{title}</h3>
              {hoverYear && (
                <div className="lf-browse-card__hover-meta">
                  <span>{hoverYear}</span>
                </div>
              )}
            </div>
          </div>
          {progress > 2 && (
            <div className="lf-browse-card__progress" aria-hidden>
              <span style={{ width: `${Math.min(100, progress)}%` }} />
            </div>
          )}
        </div>
        {showReflection && reflectionSrc && (
          <div className="lf-browse-card__reflection" aria-hidden>
            <img src={reflectionSrc} alt="" loading="lazy" decoding="async" />
          </div>
        )}
      </div>
      {isGrid && (
        <div className="lf-browse-card__body">
          <p className="lf-browse-card__title">{title}</p>
          {subtitle && <p className="lf-browse-card__sub">{subtitle}</p>}
        </div>
      )}
    </button>
  );
});
