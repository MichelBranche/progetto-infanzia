import { memo, useEffect, useMemo, useRef, useState } from "react";
import { Ban, Check, Play, Plus } from "lucide-react";
import type { BrowseItem } from "../lib/browse";
import { browseItemTitle } from "../lib/browse";
import { cleanStreamingSynopsis } from "../lib/htmlText";
import {
  streamingPreviewDisplayName,
  previewToMediaItem,
  isStreamingSeries,
} from "../lib/streamingBrowse";
import { streamingProviderIncluded } from "../lib/streamingProvider";
import { useStreamCardDimensions } from "../lib/useStreamCardDimensions";
import type { StremioMetaPreview } from "../types/stremio";
import { watchProgressPercent } from "../types/media";
import { CARD_PREVIEW_SEC } from "../lib/preview";
import {
  previewToStreamingTarget,
  supportsStreamingPreviewForItem,
} from "../lib/streamingHeroPreview";
import { prefetchStreamingPreview } from "../lib/streamingPreviewCache";
import { usePreviewAudio } from "../context/PreviewAudioContext";
import { useDelayedCardPreview } from "../hooks/useDelayedCardPreview";
import { PosterImage } from "./PosterImage";
import { PreviewAudioToggle } from "./PreviewAudioToggle";
import { StreamingProviderBadge } from "./StreamingProviderBadge";
import { StreamingVideoPreview } from "./StreamingVideoPreview";
import { SparkleActionButton } from "./SparkleActionButton";
import { useRowInteraction, isRowDragging } from "../hooks/useRowScrollContainer";
import {
  playCardNavigationSound,
  playCardOpenTitleSound,
} from "../lib/cardNavigationSound";

const STREAM_DRAG_THRESHOLD_PX = 8;

/** Ritardo hover allineato a Max (~400ms). */
const STREAM_HOVER_DELAY_MS = 400;

interface StreamingMediaCardProps {
  browse: BrowseItem;
  onPlayStreaming?: (preview: StremioMetaPreview) => void;
  onOpenDetail?: (browse: BrowseItem) => void;
  onToggleStreamingList?: (preview: StremioMetaPreview) => void;
}

function playButtonLabel(preview: StremioMetaPreview): string {
  const resume = preview.resumeEpisodeLabel?.trim();
  if (!resume) return "Riproduci";
  const s = resume.match(/stagione\s*(\d+)/i);
  const e = resume.match(/episodio\s*(\d+)/i);
  if (s && e) return `Riproduci S ${s[1]} E ${e[1]}`;
  if (e) return `Riproduci E ${e[1]}`;
  return `Riproduci · ${resume}`;
}

function formatMetaChips(
  preview: StremioMetaPreview,
  year?: number,
): { rating: string; year?: string; detail?: string } {
  const detail =
    preview.releaseInfo?.trim() ||
    (isStreamingSeries(preview) ? "Serie" : "Film");
  return {
    rating: "7+",
    year: year ? String(year) : undefined,
    detail,
  };
}

export const StreamingMediaCard = memo(function StreamingMediaCard({
  browse,
  onPlayStreaming,
  onOpenDetail,
  onToggleStreamingList,
}: StreamingMediaCardProps) {
  if (browse.kind !== "streaming") return null;

  const preview = browse.preview;
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pointerDragRef = useRef({
    pressed: false,
    active: false,
    x: 0,
    y: 0,
  });
  const [expanded, setExpanded] = useState(false);
  const [inList, setInList] = useState(() =>
    Boolean(preview.inMyList ?? previewToMediaItem(preview).isFavorite),
  );
  const [previewVisible, setPreviewVisible] = useState(false);
  const { collapseEpoch } = useRowInteraction();
  const dims = useStreamCardDimensions();
  const previewId = `${preview.catalogPrefix ?? "sc"}:${preview.type}:${preview.id}`;
  const streamPreviewTarget = useMemo(
    () => previewToStreamingTarget(preview),
    [preview],
  );
  const canStreamPreview = supportsStreamingPreviewForItem(preview);
  const previewActive = useDelayedCardPreview(expanded, canStreamPreview);
  const {
    previewAudio,
    togglePreviewAudio,
    claimCardPreviewFocus,
    releaseCardPreviewFocus,
    isPreviewMuted,
  } = usePreviewAudio();

  const item = previewToMediaItem(preview);
  const title = browseItemTitle(browse);
  const displayTitle = streamingPreviewDisplayName(preview);
  const providerIncluded = streamingProviderIncluded(preview.catalogPrefix);
  const synopsis = cleanStreamingSynopsis(preview.description, displayTitle);
  const showResumeBadge =
    preview.watchPosition != null && preview.watchPosition > 5;

  const progress =
    preview.watchPosition != null && preview.watchPosition > 5
      ? preview.watchDuration
        ? watchProgressPercent({
            ...item,
            watchPosition: preview.watchPosition,
            watchDuration: preview.watchDuration,
          })
        : 12
      : 0;

  const metaChips = formatMetaChips(preview, item.year);
  const portraitPoster =
    preview.posterShape === "poster" ||
    preview.catalogPrefix === "loonex" ||
    preview.catalogPrefix === "saturn";

  const handleOpenDetail = () => {
    if (pointerDragRef.current.active || isRowDragging()) {
      pointerDragRef.current.active = false;
      return;
    }
    playCardOpenTitleSound();
    if (onOpenDetail) {
      onOpenDetail(browse);
      return;
    }
    onPlayStreaming?.(preview);
  };

  const handlePlay = (e: React.MouseEvent) => {
    e.stopPropagation();
    onPlayStreaming?.(preview);
  };

  const handleToggleList = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!onToggleStreamingList) return;
    setInList((current) => !current);
    onToggleStreamingList(preview);
  };

  const handleEnter = () => {
    if (isRowDragging()) return;
    playCardNavigationSound();
    if (hoverTimer.current) {
      window.clearTimeout(hoverTimer.current);
    }
    hoverTimer.current = window.setTimeout(() => {
      if (isRowDragging()) return;
      setExpanded(true);
    }, STREAM_HOVER_DELAY_MS);
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

  const handlePointerDown = (event: React.PointerEvent) => {
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

  const handlePointerMove = (event: React.PointerEvent) => {
    const pointer = pointerDragRef.current;
    if (!pointer.pressed) return;
    if (
      Math.hypot(event.clientX - pointer.x, event.clientY - pointer.y) >=
      STREAM_DRAG_THRESHOLD_PX
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
    setInList(Boolean(preview.inMyList));
  }, [preview.inMyList, preview.id, preview.type, preview.catalogPrefix]);

  useEffect(() => {
    if (!previewActive) {
      setPreviewVisible(false);
    }
  }, [previewActive]);

  useEffect(() => {
    if (!expanded || !canStreamPreview || !streamPreviewTarget) return;
    prefetchStreamingPreview(streamPreviewTarget, CARD_PREVIEW_SEC);
    claimCardPreviewFocus(previewId);
    return () => releaseCardPreviewFocus(previewId);
  }, [
    expanded,
    canStreamPreview,
    streamPreviewTarget,
    previewId,
    claimCardPreviewFocus,
    releaseCardPreviewFocus,
  ]);

  useEffect(() => {
    if (hoverTimer.current) {
      window.clearTimeout(hoverTimer.current);
      hoverTimer.current = null;
    }
    setExpanded(false);
  }, [collapseEpoch]);

  useEffect(
    () => () => {
      if (hoverTimer.current) window.clearTimeout(hoverTimer.current);
    },
    [],
  );

  const cardWidth = expanded ? dims.expanded : dims.collapsed;
  const imageHeight = expanded
    ? dims.expandedImageHeight
    : dims.collapsedHeight;
  const radius = expanded ? dims.radiusExpanded : dims.radius;
  const slotHeight = expanded ? dims.expandedTotalHeight : dims.collapsedHeight;

  return (
    <article
      className={`stream-card-slot relative shrink-0 overflow-visible${
        expanded ? " stream-card-slot--expanded" : ""
      }`}
      style={{
        width: cardWidth,
        height: slotHeight,
        zIndex: expanded ? 80 : 1,
        transition:
          "width 260ms cubic-bezier(0.25, 0.46, 0.45, 0.94), height 260ms cubic-bezier(0.25, 0.46, 0.45, 0.94)",
      }}
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
      onPointerDown={(event) => {
        event.stopPropagation();
        handlePointerDown(event);
      }}
      onPointerMove={(event) => {
        event.stopPropagation();
        handlePointerMove(event);
      }}
      onPointerUp={(event) => {
        event.stopPropagation();
        handlePointerUp();
      }}
      onPointerCancel={(event) => {
        event.stopPropagation();
        handlePointerUp();
      }}
      onClick={handleOpenDetail}
    >
      <div
        className="stream-card-anchor absolute bottom-0 left-0 cursor-pointer"
        style={{
          width: cardWidth,
          transition: "width 260ms cubic-bezier(0.25, 0.46, 0.45, 0.94)",
        }}
      >
        <div
          className={expanded ? "stream-card-expanded" : "stream-card-idle"}
          style={{ borderRadius: radius }}
        >
          <div
            className="relative overflow-hidden bg-[#0d0d0d]"
            style={{
              height: imageHeight,
              transition: "height 260ms cubic-bezier(0.25, 0.46, 0.45, 0.94)",
              borderTopLeftRadius: radius,
              borderTopRightRadius: radius,
              borderBottomLeftRadius: expanded ? 0 : radius,
              borderBottomRightRadius: expanded ? 0 : radius,
            }}
          >
            <div
              className={
                portraitPoster && !expanded
                  ? "stream-card-media stream-card-media--portrait"
                  : expanded
                    ? "stream-card-media stream-card-media--hover"
                    : "stream-card-media"
              }
            >
              {expanded && canStreamPreview && streamPreviewTarget && (
                <StreamingVideoPreview
                  target={streamPreviewTarget}
                  active={previewActive}
                  maxDurationSec={CARD_PREVIEW_SEC}
                  muted={isPreviewMuted(previewId, previewActive)}
                  onReady={() => setPreviewVisible(true)}
                  className="absolute inset-0 z-[1] h-full w-full object-cover"
                />
              )}
              <PosterImage
                item={item}
                variant="browse"
                className={
                  previewVisible
                    ? "opacity-0 transition-opacity duration-500"
                    : undefined
                }
              />
            </div>

            {!expanded && showResumeBadge && (
              <span className="stream-card-status-badge">In riproduzione</span>
            )}

            {!expanded && inList && (
              <span className="stream-card-list-badge" aria-label="Nella tua lista">
                <Check className="h-3 w-3" strokeWidth={2.5} />
              </span>
            )}

            {!expanded && (
              <StreamingProviderBadge
                catalogPrefix={preview.catalogPrefix}
                className="absolute bottom-2 right-2"
              />
            )}

            {progress > 2 && (
              <div className="stream-card-progress-track">
                <div
                  className="stream-card-progress-fill"
                  style={{ width: `${Math.min(progress, 100)}%` }}
                />
              </div>
            )}

            {expanded && previewActive && canStreamPreview && (
              <div className="absolute right-2 top-2 z-[4]">
                <PreviewAudioToggle
                  enabled={previewAudio}
                  onToggle={togglePreviewAudio}
                  className="!h-8 !w-8"
                />
              </div>
            )}
          </div>

          {expanded && (
            <div
              className="stream-card-panel"
              style={{
                borderBottomLeftRadius: radius,
                borderBottomRightRadius: radius,
              }}
            >
              <h3 className="stream-card-title">{title}</h3>

              <p className="stream-card-included">
                <span className="stream-card-included-icon" aria-hidden>
                  <Check className="h-2.5 w-2.5 text-white" strokeWidth={3} />
                </span>
                <span>Incluso con {providerIncluded}</span>
              </p>

              <div className="stream-card-actions">
                <button
                  type="button"
                  onClick={handlePlay}
                  className="stream-card-play"
                >
                  <Play className="h-4 w-4 shrink-0 fill-black text-black" />
                  <span className="truncate">{playButtonLabel(preview)}</span>
                </button>

                {onToggleStreamingList && (
                  <SparkleActionButton
                    sparkle="list"
                    checked={inList}
                    onClick={handleToggleList}
                    className="stream-card-icon-btn"
                    aria-label={
                      inList ? "Rimuovi dalla lista" : "Aggiungi alla lista"
                    }
                  >
                    {inList ? (
                      <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
                    ) : (
                      <Plus className="h-3.5 w-3.5" strokeWidth={2} />
                    )}
                  </SparkleActionButton>
                )}

                <button
                  type="button"
                  onClick={(e) => e.stopPropagation()}
                  className="stream-card-icon-btn"
                  aria-label="Non interessato"
                >
                  <Ban className="h-3.5 w-3.5" strokeWidth={2} />
                </button>
              </div>

              <div className="stream-card-meta-row">
                <span className="stream-card-rating">{metaChips.rating}</span>
                {metaChips.year && <span>{metaChips.year}</span>}
                {metaChips.detail && <span>{metaChips.detail}</span>}
              </div>

              <p className="stream-card-synopsis">
                {synopsis || "Apri il titolo per episodi e dettagli."}
              </p>
            </div>
          )}
        </div>
      </div>
    </article>
  );
});
