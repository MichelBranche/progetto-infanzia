import { memo, useEffect, useRef, useState } from "react";
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
import { PosterImage } from "./PosterImage";
import { StreamingProviderBadge } from "./StreamingProviderBadge";
import { useRowInteraction, isRowDragging } from "../hooks/useRowScrollContainer";

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
  const pointerDragRef = useRef({ active: false, x: 0, y: 0 });
  const [expanded, setExpanded] = useState(false);
  const { collapseEpoch } = useRowInteraction();
  const dims = useStreamCardDimensions();

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

  const handleEnter = () => {
    if (isRowDragging()) return;
    hoverTimer.current = window.setTimeout(() => {
      if (isRowDragging()) return;
      setExpanded(true);
    }, STREAM_HOVER_DELAY_MS);
  };

  const handleLeave = () => {
    if (hoverTimer.current) {
      window.clearTimeout(hoverTimer.current);
      hoverTimer.current = null;
    }
    setExpanded(false);
    pointerDragRef.current.active = false;
  };

  const handlePointerDown = (event: React.PointerEvent) => {
    pointerDragRef.current = {
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
      pointerDragRef.current.active = false;
    }, 0);
  };

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

  return (
    <article
      className={`stream-card-slot relative shrink-0 overflow-visible${
        expanded ? " stream-card-slot--expanded" : ""
      }`}
      style={{
        width: cardWidth,
        height: dims.collapsedHeight,
        zIndex: expanded ? 80 : 1,
        transition: "width 260ms cubic-bezier(0.25, 0.46, 0.45, 0.94)",
      }}
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
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
              <PosterImage item={item} variant="browse" />
            </div>

            {!expanded && showResumeBadge && (
              <span className="stream-card-status-badge">In riproduzione</span>
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
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleStreamingList(preview);
                    }}
                    className="stream-card-icon-btn"
                    aria-label={
                      item.isFavorite
                        ? "Rimuovi dalla lista"
                        : "Aggiungi alla lista"
                    }
                  >
                    {item.isFavorite ? (
                      <Check className="h-3.5 w-3.5" strokeWidth={2} />
                    ) : (
                      <Plus className="h-3.5 w-3.5" strokeWidth={2} />
                    )}
                  </button>
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
