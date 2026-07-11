import { memo, type MouseEvent, type PointerEvent } from "react";
import type { BrowseItem } from "../lib/browse";
import { browseItemMedia, browseItemTitle } from "../lib/browse";
import type { StremioMetaPreview } from "../types/stremio";
import type { MediaItem } from "../types/media";
import { watchProgressPercent } from "../types/media";
import { isRowDragging } from "../hooks/useRowScrollContainer";
import {
  playCardNavigationSound,
  playCardOpenTitleSound,
} from "../lib/cardNavigationSound";
import { PosterImage } from "./PosterImage";

export interface LordFlixContinueCardProps {
  browse: BrowseItem;
  onPlay?: (id: string) => void;
  onPlayStreaming?: (preview: StremioMetaPreview) => void;
  onOpenDetail?: (browse: BrowseItem) => void;
  onOpenSeries?: (seriesKey: string) => void;
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
    LordFlixContinueCardProps,
    "onPlay" | "onPlayStreaming" | "onOpenDetail" | "onOpenSeries"
  >,
) {
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

function resolveRemainingLabel(
  browse: BrowseItem,
  media: MediaItem,
): string | null {
  let position: number | undefined;
  let duration: number | undefined;

  if (browse.kind === "streaming") {
    position = browse.preview.watchPosition;
    duration = browse.preview.watchDuration;
  } else {
    position = media.watchPosition;
    duration = media.watchDuration;
  }

  if (!duration || duration <= 0 || position == null) return null;
  const remaining = Math.max(0, duration - position);
  if (remaining < 60) return null;

  const totalMinutes = Math.round(remaining / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) return `${hours}h ${minutes}m rimasti`;
  return `${minutes}m rimasti`;
}

export const LordFlixContinueCard = memo(function LordFlixContinueCard({
  browse,
  onPlay,
  onPlayStreaming,
  onOpenDetail,
  onOpenSeries,
}: LordFlixContinueCardProps) {
  const title = browseItemTitle(browse);
  const media = browseItemMedia(browse);
  const progress = resolveProgress(browse, media);
  const remainingLabel = resolveRemainingLabel(browse, media);

  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    if (isRowDragging()) {
      event.preventDefault();
      return;
    }
    playCardOpenTitleSound();
    openBrowseItem(browse, {
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
      className="lf-continue-card group/card"
      onMouseEnter={() => {
        if (!isRowDragging()) playCardNavigationSound();
      }}
      onClick={handleClick}
      onPointerDown={handlePointerDown}
      aria-label={title}
    >
      <div className="lf-continue-card__frame">
        <PosterImage
          item={media}
          variant="continue"
          className="lf-continue-card__img"
        />
        {progress > 2 && (
          <div className="lf-continue-card__progress" aria-hidden>
            <span style={{ width: `${Math.min(100, progress)}%` }} />
          </div>
        )}
      </div>
      <div className="lf-continue-card__body">
        <h3 className="lf-continue-card__title">{title}</h3>
        {remainingLabel && (
          <p className="lf-continue-card__left">{remainingLabel}</p>
        )}
      </div>
    </button>
  );
});
