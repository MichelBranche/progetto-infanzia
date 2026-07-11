import { useEffect, useRef, useState, memo, type PointerEvent } from "react";
import { motion } from "framer-motion";
import { Play, Plus, Check, Layers, Pencil, Wifi } from "lucide-react";
import type { BrowseItem } from "../lib/browse";
import { browseItemMedia, browseItemTitle } from "../lib/browse";
import { isStreamingSeries } from "../lib/streamingBrowse";
import { prefetchStreamingPreview } from "../lib/streamingPreviewCache";
import {
  previewToStreamingTarget,
} from "../lib/streamingHeroPreview";
import type { StremioMetaPreview } from "../types/stremio";
import type { MediaItem } from "../types/media";
import {
  formatDuration,
  mediaTypeLabel,
  watchProgressPercent,
} from "../types/media";
import { CARD_HOVER_DELAY_MS, CARD_PREVIEW_SEC } from "../lib/preview";
import { useDelayedCardPreview } from "../hooks/useDelayedCardPreview";
import { useCardDimensions } from "../lib/useCardDimensions";
import { usePreviewAudio } from "../context/PreviewAudioContext";
import { PosterImage } from "./PosterImage";
import { PreviewAudioToggle } from "./PreviewAudioToggle";
import { SparkleActionButton } from "./SparkleActionButton";
import { VideoPreview } from "./VideoPreview";
import { StreamingVideoPreview } from "./StreamingVideoPreview";
import { StreamingBadges } from "./StreamingBadges";
import { useLibrary } from "../context/LibraryContext";
import { useRowInteraction, isRowDragging } from "../hooks/useRowScrollContainer";
import {
  playCardNavigationSound,
  playCardOpenTitleSound,
} from "../lib/cardNavigationSound";

const CARD_DRAG_THRESHOLD_PX = 8;

interface MediaCardProps {
  browse: BrowseItem;
  index: number;
  layout?: "row" | "grid";
  onPlay: (id: string) => void;
  onPlayStreaming?: (preview: StremioMetaPreview) => void;
  onOpenDetail?: (browse: BrowseItem) => void;
  onOpenSeries?: (seriesKey: string) => void;
  onToggleFavorite?: (id: string) => void;
  onToggleStreamingList?: (preview: StremioMetaPreview) => void;
  onEdit?: (id: string) => void;
}

export const MediaCard = memo(function MediaCard({
  browse,
  index: _index,
  layout = "row",
  onPlay,
  onPlayStreaming,
  onOpenDetail,
  onOpenSeries,
  onToggleFavorite,
  onToggleStreamingList,
  onEdit,
}: MediaCardProps) {
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pointerDragRef = useRef({
    pressed: false,
    active: false,
    x: 0,
    y: 0,
  });
  const [expanded, setExpanded] = useState(false);
  const { collapseEpoch } = useRowInteraction();
  const dims = useCardDimensions();
  const { subscribedServices } = useLibrary();
  const { previewAudio, togglePreviewAudio, claimCardPreviewFocus, releaseCardPreviewFocus, isPreviewMuted } =
    usePreviewAudio();

  const item = browseItemMedia(browse);
  const title = browseItemTitle(browse);
  const isStreaming = browse.kind === "streaming";
  const isSaturnPreview =
    isStreaming && browse.preview.catalogPrefix === "saturn";
  const streamPreviewTarget =
    browse.kind === "streaming"
      ? previewToStreamingTarget(browse.preview)
      : null;
  const canStreamPreview = streamPreviewTarget != null;
  const streamPreviewActive = useDelayedCardPreview(expanded, canStreamPreview);
  const isSeries =
    browse.kind === "series" ||
    (isStreaming && isStreamingSeries(browse.preview));
  const resumeEpisodeLabel =
    browse.kind === "streaming" && browse.preview.resumeEpisodeLabel
      ? browse.preview.resumeEpisodeLabel
      : null;
  const hasVideoPreview =
    canStreamPreview || (!isStreaming && !isSeries);
  const progress =
    browse.kind === "media"
      ? watchProgressPercent(browse.item)
      : browse.kind === "series"
        ? watchProgressPercent(browse.representative)
        : browse.kind === "streaming" &&
            browse.preview.watchPosition != null &&
            browse.preview.watchPosition > 5
          ? browse.preview.watchDuration
            ? watchProgressPercent({
                watchPosition: browse.preview.watchPosition,
                watchDuration: browse.preview.watchDuration,
              } as MediaItem)
            : 8
          : 0;
  const favoriteItem =
    browse.kind === "media"
      ? browse.item
      : browse.kind === "series"
        ? browse.representative
        : item;
  const previewMedia =
    browse.kind === "series"
      ? browse.representative
      : browse.kind === "media"
        ? browse.item
        : item;
  const description = previewMedia.description?.trim();
  const durationLabel = formatDuration(previewMedia.watchDuration);

  const handleClick = () => {
    if (pointerDragRef.current.active || isRowDragging()) {
      pointerDragRef.current.active = false;
      return;
    }
    playCardOpenTitleSound();
    if (onOpenDetail) {
      onOpenDetail(browse);
      return;
    }
    if (isStreaming && browse.kind === "streaming") {
      onPlayStreaming?.(browse.preview);
      return;
    }
    if (browse.kind === "series" && onOpenSeries) {
      onOpenSeries(
        `${browse.series.mediaType}::${browse.series.seriesTitle}`,
      );
      return;
    }
    if (browse.kind === "media") {
      onPlay(item.id);
    }
  };

  const handleEnter = () => {
    if (isRowDragging()) return;
    playCardNavigationSound();
    hoverTimer.current = window.setTimeout(() => {
      if (isRowDragging()) return;
      setExpanded(true);
    }, CARD_HOVER_DELAY_MS);
  };

  const handleLeave = (event: React.MouseEvent<HTMLElement>) => {
    const next = event.relatedTarget;
    if (next instanceof Node && event.currentTarget.contains(next)) return;
    if (hoverTimer.current) {
      window.clearTimeout(hoverTimer.current);
      hoverTimer.current = null;
    }
    setExpanded(false);
    pointerDragRef.current = { pressed: false, active: false, x: 0, y: 0 };
  };

  const handlePointerDown = (event: PointerEvent) => {
    pointerDragRef.current = {
      pressed: true,
      active: false,
      x: event.clientX,
      y: event.clientY,
    };
    if (hoverTimer.current) {
      window.clearTimeout(hoverTimer.current);
      hoverTimer.current = null;
    }
  };

  const handlePointerMove = (event: PointerEvent) => {
    const pointer = pointerDragRef.current;
    if (!pointer.pressed) return;
    if (
      Math.hypot(event.clientX - pointer.x, event.clientY - pointer.y) >=
      CARD_DRAG_THRESHOLD_PX
    ) {
      pointer.active = true;
      setExpanded(false);
      if (hoverTimer.current) {
        window.clearTimeout(hoverTimer.current);
        hoverTimer.current = null;
      }
    }
  };

  const handlePointerUp = () => {
    window.setTimeout(() => {
      pointerDragRef.current = { pressed: false, active: false, x: 0, y: 0 };
    }, 0);
  };

  useEffect(() => {
    if (hoverTimer.current) {
      window.clearTimeout(hoverTimer.current);
      hoverTimer.current = null;
    }
    setExpanded(false);
  }, [collapseEpoch]);

  useEffect(() => {
    if (!expanded) return;
    if (canStreamPreview && streamPreviewTarget) {
      prefetchStreamingPreview(streamPreviewTarget, CARD_PREVIEW_SEC);
      claimCardPreviewFocus(previewMedia.id);
      return () => releaseCardPreviewFocus(previewMedia.id);
    }
    if (isSeries || isStreaming) return;
    claimCardPreviewFocus(previewMedia.id);
    return () => releaseCardPreviewFocus(previewMedia.id);
  }, [
    expanded,
    isSeries,
    isStreaming,
    canStreamPreview,
    streamPreviewTarget,
    previewMedia.id,
    claimCardPreviewFocus,
    releaseCardPreviewFocus,
  ]);

  if (layout === "grid") {
    return (
      <motion.article
        className="group relative w-full cursor-pointer"
        onMouseEnter={handleEnter}
        onClick={handleClick}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        whileHover={{ scale: 1.06, y: -4 }}
        transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="overflow-hidden rounded-md bg-[#141414] shadow-[0_4px_16px_rgba(0,0,0,0.45)] ring-1 ring-white/[0.06] transition-shadow duration-300 group-hover:shadow-[0_12px_32px_rgba(0,0,0,0.55)] group-hover:ring-white/12">
          <div className="relative aspect-[2/3] overflow-hidden bg-black">
            <PosterImage
              item={item}
              variant="browse"
              className="transition-transform duration-500 group-hover:scale-105"
            />
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
            {progress > 2 && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-white/20">
                <div
                  className="h-full bg-accent"
                  style={{ width: `${progress}%` }}
                />
              </div>
            )}
            {isStreaming && (
              <span className="absolute left-1.5 top-1.5 flex items-center gap-1 rounded bg-black/65 px-1.5 py-0.5 text-[9px] font-medium text-white/90">
                <Wifi className="h-2.5 w-2.5" />
                Web
              </span>
            )}
          </div>
          <div className="px-1 py-2">
            <h3 className="title-clip text-[12px] font-medium leading-tight text-text-primary">
              {title}
            </h3>
            <p className="title-clip mt-0.5 text-[10px] text-text-muted">
              {browse.kind === "series"
                ? `${browse.episodeCount} episodi`
                : isStreaming
                  ? mediaTypeLabel(item.mediaType)
                  : (item.year ?? item.fileName)}
            </p>
          </div>
        </div>
      </motion.article>
    );
  }

  const cardWidth = expanded ? dims.expanded : dims.collapsed;
  const slotHeight = dims.slotHeight;

  return (
    <motion.article
      initial={false}
      className="group relative shrink-0 self-end"
      style={{
        width: cardWidth,
        height: slotHeight,
        zIndex: expanded ? 40 : 1,
        transition: "width 0.25s ease-out",
      }}
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onClick={handleClick}
    >
      <div
        className="absolute left-0 origin-bottom-left cursor-pointer"
        style={{
          bottom: expanded ? 0 : dims.titleSlot,
          width: cardWidth,
          transition:
            "width 0.25s ease-out, bottom 0.25s ease-out, box-shadow 0.25s ease-out",
        }}
      >
        <div
          className={`overflow-hidden rounded bg-[#1a1a1a] ${
            expanded
              ? "shadow-[0_16px_36px_rgba(0,0,0,0.6)] ring-1 ring-white/12"
              : "shadow-[0_4px_12px_rgba(0,0,0,0.35)] ring-1 ring-white/[0.06] group-hover:ring-white/10"
          }`}
        >
          <div
            className="relative overflow-hidden bg-black transition-[aspect-ratio] duration-250 ease-out"
            style={{ aspectRatio: expanded ? "16 / 9" : "2 / 3" }}
          >
            {expanded && !isSeries && !isStreaming && (
              <VideoPreview
                media={previewMedia}
                active={expanded}
                maxDurationSec={CARD_PREVIEW_SEC}
                muted={isPreviewMuted(previewMedia.id, expanded)}
                className="absolute inset-0 z-[1] h-full w-full object-cover"
              />
            )}
            {expanded && canStreamPreview && streamPreviewTarget && (
              <StreamingVideoPreview
                target={streamPreviewTarget}
                active={streamPreviewActive}
                maxDurationSec={CARD_PREVIEW_SEC}
                muted={isPreviewMuted(previewMedia.id, streamPreviewActive)}
                className="absolute inset-0 z-[1] h-full w-full object-cover"
              />
            )}
            <PosterImage
              item={item}
              variant="browse"
              className={
                expanded &&
                ((canStreamPreview && streamPreviewActive) ||
                  (!isStreaming && !isSeries && hasVideoPreview))
                  ? "opacity-0 transition-opacity duration-500"
                  : undefined
              }
            />
            <div className="pointer-events-none absolute inset-0 z-[2] bg-gradient-to-t from-black/80 via-black/15 to-transparent" />

            {!expanded && isSaturnPreview && (
              <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[3] p-2">
                <p className="line-clamp-2 text-[11px] font-semibold leading-snug text-white drop-shadow-sm sm:text-[12px]">
                  {title}
                </p>
                {browse.preview.releaseInfo && (
                  <p className="mt-0.5 truncate text-[9px] text-white/70">
                    {browse.preview.releaseInfo}
                  </p>
                )}
              </div>
            )}

            {!expanded && resumeEpisodeLabel && (
              <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[3] bg-gradient-to-t from-black/90 via-black/50 to-transparent p-2 pt-6">
                <p className="line-clamp-1 text-[11px] font-semibold leading-snug text-white drop-shadow-sm sm:text-[12px]">
                  {title}
                </p>
                <p className="mt-0.5 truncate text-[10px] font-medium text-accent">
                  {resumeEpisodeLabel}
                </p>
              </div>
            )}

            {progress > 2 && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-white/20">
                <div
                  className="h-full bg-accent"
                  style={{ width: `${progress}%` }}
                />
              </div>
            )}

            {!expanded && isStreaming && (
              <span className="absolute left-1.5 top-1.5 flex items-center gap-1 rounded bg-black/65 px-1.5 py-0.5 text-[9px] font-medium text-white/90">
                <Wifi className="h-2.5 w-2.5" />
                Web
              </span>
            )}

            {!expanded && isSeries && browse.kind === "series" && (
              <span className="absolute left-1.5 top-1.5 flex items-center gap-1 rounded bg-black/65 px-1.5 py-0.5 text-[9px] font-medium text-white/90">
                <Layers className="h-2.5 w-2.5" />
                {browse.episodeCount}
              </span>
            )}

            {!expanded && item.tag && !isSeries && (
              <span className="absolute left-1.5 top-1.5 rounded bg-black/65 px-1.5 py-0.5 text-[9px] font-medium text-white/90">
                {item.tag}
              </span>
            )}

            {expanded && hasVideoPreview && (
              <div className="absolute right-2 top-2 z-[4]">
                <PreviewAudioToggle
                  enabled={previewAudio}
                  onToggle={togglePreviewAudio}
                  className="!h-8 !w-8"
                />
              </div>
            )}

            {expanded && (
              <div className="absolute bottom-2 left-2 right-2 z-[3] flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (isStreaming && browse.kind === "streaming") {
                      onPlayStreaming?.(browse.preview);
                      return;
                    }
                    onPlay(
                      browse.kind === "series"
                        ? browse.representative.id
                        : item.id,
                    );
                  }}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-black"
                  aria-label="Riproduci"
                >
                  <Play className="h-3.5 w-3.5 fill-black" />
                </button>
                {(onToggleFavorite || onToggleStreamingList) && (
                  <SparkleActionButton
                    sparkle="list"
                    checked={
                      isStreaming && browse.kind === "streaming"
                        ? Boolean(browse.preview.inMyList)
                        : favoriteItem.isFavorite
                    }
                    onClick={(e) => {
                      e.stopPropagation();
                      if (isStreaming && browse.kind === "streaming") {
                        onToggleStreamingList?.(browse.preview);
                        return;
                      }
                      onToggleFavorite?.(favoriteItem.id);
                    }}
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-white/35 bg-black/50 text-white"
                    aria-label={
                      (isStreaming && browse.kind === "streaming"
                        ? browse.preview.inMyList
                        : favoriteItem.isFavorite)
                        ? "Rimuovi dalla lista"
                        : "Aggiungi alla lista"
                    }
                  >
                    {(isStreaming && browse.kind === "streaming"
                      ? browse.preview.inMyList
                      : favoriteItem.isFavorite) ? (
                      <Check className="h-3 w-3" strokeWidth={2.5} />
                    ) : (
                      <Plus className="h-3 w-3" strokeWidth={2} />
                    )}
                  </SparkleActionButton>
                )}
                {onEdit && !isSeries && !isStreaming && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onEdit(item.id);
                    }}
                    className="ml-auto flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-white/35 bg-black/50 text-white"
                    aria-label="Modifica"
                  >
                    <Pencil className="h-3 w-3" />
                  </button>
                )}
              </div>
            )}

            {onEdit && !isSeries && !expanded && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit(item.id);
                }}
                className="absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-full border border-white/20 bg-black/55 text-white opacity-0 backdrop-blur-sm transition-opacity group-hover:opacity-100"
                aria-label="Modifica"
              >
                <Pencil className="h-3 w-3" />
              </button>
            )}
          </div>

          {expanded && (
            <div className="space-y-1 px-3 py-2.5">
              <h3 className="title-clip text-[13px] font-semibold text-white">
                {title}
              </h3>
              <p className="title-clip text-[11px] text-white/50">
                {resumeEpisodeLabel && (
                  <span className="text-accent">{resumeEpisodeLabel} · </span>
                )}
                {mediaTypeLabel(item.mediaType)}
                {item.year ? ` · ${item.year}` : ""}
                {durationLabel ? ` · ${durationLabel}` : ""}
                {browse.kind === "series"
                  ? ` · ${browse.episodeCount} episodi`
                  : isStreaming
                    ? ` · ${mediaTypeLabel(item.mediaType)}`
                    : ""}
              </p>
              <p className="title-safe line-clamp-3 text-[11px] leading-relaxed text-white/70">
                {description ||
                  (isSeries
                    ? "Apri la serie per vedere tutti gli episodi."
                    : "Nessuna descrizione.")}
              </p>
              {!isSeries && !isStreaming && (
                <StreamingBadges
                  title={title}
                  streamingServices={previewMedia.streamingServices}
                  subscribedServices={subscribedServices}
                  compact
                />
              )}
            </div>
          )}
        </div>
      </div>

      {!expanded && (
        <div
          className="pointer-events-none absolute bottom-0 left-0 right-0 px-0.5"
          style={{ height: dims.titleSlot }}
        >
          <h3 className="title-clip text-[12px] font-medium leading-tight text-text-primary">
            {title}
          </h3>
          <p className="title-clip mt-0.5 text-[10px] text-text-muted">
            {browse.kind === "series"
              ? `${browse.episodeCount} episodi`
              : isStreaming
                ? mediaTypeLabel(item.mediaType)
                : (item.year ?? item.fileName)}
          </p>
        </div>
      )}
    </motion.article>
  );
});
