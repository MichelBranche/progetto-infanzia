import { memo, useEffect, useRef, useState, type RefObject } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Play, Plus, Check, Info, BadgeCheck } from "lucide-react";
import type { MediaItem } from "../types/media";
import { formatDuration, mediaTypeLabel } from "../types/media";
import { episodeDisplayTitle } from "../lib/browse";
import type { BrowseItem } from "../lib/browse";
import {
  isStreamingMediaId,
  parseStreamingMediaId,
  streamingBrowseItem,
} from "../lib/streamingBrowse";
import { mediaItemToStreamingPreview } from "../lib/myList";
import { HERO_POSTER_MS, HERO_PREVIEW_SEC } from "../lib/preview";
import { prefetchStreamUrl } from "../lib/streamCache";
import { prefetchStreamingPreview } from "../lib/streamingPreviewCache";
import { supportsStreamingPreview } from "../lib/streamingHeroPreview";
import { useProfile } from "../context/ProfileContext";
import { usePreviewAudio } from "../context/PreviewAudioContext";
import { PosterImage, posterUrlFor } from "./PosterImage";
import {
  needsHeroImageUpgrade,
  prefetchHeroImage,
  resolveHeroImageUrl,
} from "../lib/heroImage";
import { PreviewAudioToggle } from "./PreviewAudioToggle";
import { SparkleActionButton } from "./SparkleActionButton";
import { VideoPreview } from "./VideoPreview";
import { StreamingVideoPreview } from "./StreamingVideoPreview";
import { useHeroScrollParallax } from "../hooks/useHeroScrollParallax";

interface HeroBannerProps {
  items: MediaItem[];
  scrollContainerRef?: RefObject<HTMLElement | null>;
  fullPage?: boolean;
  onPlay: (id: string) => void;
  onOpenSeries?: (media: MediaItem) => void;
  onOpenDetail?: (browse: BrowseItem) => void;
  onToggleFavorite?: (id: string) => void;
  onToggleStreamingList?: (preview: import("../types/stremio").StremioMetaPreview) => void;
  onEdit?: (media: MediaItem) => void;
}

const textMotion = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
  transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1] as const },
};

function heroSourceBadge(media: MediaItem): string {
  if (!isStreamingMediaId(media.id)) {
    return mediaTypeLabel(media.mediaType);
  }
  if (media.id.includes(":sc:") || media.id.startsWith("sc:")) {
    return "In streaming";
  }
  if (media.id.includes("saturn:")) return "Anime";
  if (media.id.includes("loonex:")) return "Archivio Cartoni";
  if (media.id.includes("youtube:")) return "YouTube";
  return "In streaming";
}

function heroPlayLabel(media: MediaItem, resume: boolean): string {
  if (resume) return "Riprendi";
  if (media.episode != null) {
    return `Episodio ${media.episode} / Guarda ora`;
  }
  return "Guarda ora";
}

function heroStatusLine(media: MediaItem, isStreaming: boolean): string {
  const parts: string[] = [];
  if (media.season != null) {
    parts.push(`Stagione ${media.season}`);
  } else if (media.year) {
    parts.push(String(media.year));
  }
  if (isStreaming) {
    parts.push("Disponibile ora");
  } else {
    const duration = formatDuration(media.watchDuration);
    if (duration) parts.push(duration);
  }
  return parts.join(" · ");
}

export const HeroBanner = memo(function HeroBanner({
  items,
  scrollContainerRef,
  fullPage = false,
  onPlay,
  onOpenSeries,
  onOpenDetail,
  onToggleFavorite,
  onToggleStreamingList,
  onEdit,
}: HeroBannerProps) {
  const { activeProfile } = useProfile();
  const { previewAudio, togglePreviewAudio, isPreviewMuted } = usePreviewAudio();
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<"poster" | "video">("poster");
  const [heroImageUrl, setHeroImageUrl] = useState<string | undefined>();
  const slideTimerRef = useRef<number | null>(null);
  const heroRef = useRef<HTMLDivElement>(null);
  const mediaLayerRef = useRef<HTMLDivElement>(null);
  const contentLayerRef = useRef<HTMLDivElement>(null);

  useHeroScrollParallax(
    heroRef,
    mediaLayerRef,
    contentLayerRef,
    scrollContainerRef ?? { current: null },
    Boolean(scrollContainerRef),
  );

  const safeIndex = items.length > 0 ? index % items.length : 0;
  const media = items[safeIndex];
  const isStreaming = media ? isStreamingMediaId(media.id) : false;
  const streamTarget = media ? parseStreamingMediaId(media.id) : null;
  const canStreamPreview = supportsStreamingPreview(streamTarget);

  const clearSlideTimer = () => {
    if (slideTimerRef.current != null) {
      window.clearTimeout(slideTimerRef.current);
      slideTimerRef.current = null;
    }
  };

  useEffect(() => {
    setIndex(0);
    setPhase("poster");
  }, [items]);

  useEffect(() => {
    if (!activeProfile || !media) return;
    if (canStreamPreview && streamTarget) {
      prefetchStreamingPreview(streamTarget, HERO_PREVIEW_SEC);
      return;
    }
    if (isStreaming) return;
    prefetchStreamUrl(activeProfile.id, media.id);
    const next = items[(safeIndex + 1) % items.length];
    if (next && !isStreamingMediaId(next.id)) {
      prefetchStreamUrl(activeProfile.id, next.id);
    } else if (next) {
      const nextTarget = parseStreamingMediaId(next.id);
      if (supportsStreamingPreview(nextTarget)) {
        prefetchStreamingPreview(nextTarget!, HERO_PREVIEW_SEC);
      }
    }
  }, [activeProfile, media, isStreaming, canStreamPreview, streamTarget, safeIndex, items]);

  useEffect(() => {
    if (!media || items.length === 0) return;

    clearSlideTimer();

    if (isStreaming && !canStreamPreview) {
      slideTimerRef.current = window.setTimeout(() => {
        setPhase("poster");
        setIndex((current) => (current + 1) % items.length);
      }, HERO_POSTER_MS);
      return clearSlideTimer;
    }

    if (phase === "poster") {
      slideTimerRef.current = window.setTimeout(
        () => setPhase("video"),
        HERO_POSTER_MS,
      );
    } else {
      slideTimerRef.current = window.setTimeout(() => {
        setPhase("poster");
        setIndex((current) => (current + 1) % items.length);
      }, HERO_PREVIEW_SEC * 1000);
    }

    return clearSlideTimer;
  }, [phase, media?.id, isStreaming, canStreamPreview, items.length]);

  const goToSlide = (dotIndex: number) => {
    clearSlideTimer();
    setIndex(dotIndex);
    setPhase("poster");
  };

  const advanceSlide = () => {
    clearSlideTimer();
    setPhase("poster");
    setIndex((current) => (current + 1) % items.length);
  };

  useEffect(() => {
    if (!media) return;
    let cancelled = false;
    const heroItem: MediaItem = media.seriesTitle
      ? {
          ...media,
          title: media.seriesTitle,
          season: undefined,
          episode: undefined,
          posterUrl: media.seriesPosterUrl ?? media.posterUrl,
          backgroundUrl: media.backgroundUrl,
        }
      : media;
    const fallback = posterUrlFor(heroItem, "hero");
    setHeroImageUrl(fallback);

    if (!needsHeroImageUpgrade(media)) {
      return () => {
        cancelled = true;
      };
    }

    void resolveHeroImageUrl(media).then((url) => {
      if (!cancelled && url) setHeroImageUrl(url);
    });

    return () => {
      cancelled = true;
    };
  }, [
    media?.id,
    media?.backgroundUrl,
    media?.posterUrl,
    media?.seriesPosterUrl,
    media?.seriesTitle,
  ]);

  useEffect(() => {
    if (items.length === 0) return;
    const next = items[(safeIndex + 1) % items.length];
    if (next) prefetchHeroImage(next);
  }, [items, safeIndex]);

  if (!media) return null;

  const episodeTitle = episodeDisplayTitle(media);
  const heroTitle = media.seriesTitle ?? episodeTitle;
  const heroPoster: MediaItem = media.seriesTitle
    ? {
        ...media,
        title: media.seriesTitle,
        season: undefined,
        episode: undefined,
        posterUrl: media.seriesPosterUrl ?? media.posterUrl,
        backgroundUrl: media.backgroundUrl,
      }
    : media;
  const resume =
    media.watchPosition != null && media.watchPosition > 10;
  const hasVideoPreview = items.some(
    (item) =>
      !isStreamingMediaId(item.id) ||
      supportsStreamingPreview(parseStreamingMediaId(item.id)),
  );
  const statusLine = heroStatusLine(media, isStreaming);
  const showEpisodeTagline =
    media.seriesTitle && episodeTitle !== media.seriesTitle;

  const handleInfo = () => {
    if (isStreaming && onOpenDetail) {
      const preview = mediaItemToStreamingPreview(media);
      if (preview) onOpenDetail(streamingBrowseItem(preview));
      return;
    }
    if (onOpenSeries && media.seriesTitle) {
      onOpenSeries(media);
    }
  };

  const mediaClassName =
    "hero-prime__media absolute inset-0 h-full w-full";

  return (
    <div
      ref={heroRef}
      className={`pointer-events-none relative z-20 w-full shrink-0 overflow-hidden bg-black ${
        fullPage
          ? "h-[100svh] min-h-[560px]"
          : "h-[72vh] min-h-[420px] max-h-[820px] sm:min-h-[460px] lg:h-[78vh] lg:min-h-[500px]"
      }`}
    >
      <div
        ref={mediaLayerRef}
        className={`pointer-events-none absolute -inset-x-[4%] will-change-transform ${
          fullPage
            ? "-top-[var(--app-nav-height)] bottom-0 h-[calc(100%+var(--app-nav-height))]"
            : "inset-y-0"
        }`}
      >
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.div
            key={`${media.id}-poster`}
            className="absolute inset-0 ken-burns-hero"
            initial={{ opacity: 0, scale: 1.03 }}
            animate={{
              opacity: phase === "poster" ? 1 : 0,
              scale: phase === "poster" ? 1 : 1.02,
            }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.9, ease: "easeInOut" }}
          >
          <PosterImage
            item={heroPoster}
            variant="hero"
            priority
            srcOverride={heroImageUrl}
            className={`${mediaClassName} opacity-100`}
          />
          </motion.div>
          {!isStreaming && (
            <motion.div
              key={`${media.id}-video`}
              className="absolute inset-0"
              initial={{ opacity: 0 }}
              animate={{ opacity: phase === "video" ? 1 : 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.9, ease: "easeInOut" }}
            >
              <VideoPreview
                media={media}
                active={phase === "video"}
                maxDurationSec={HERO_PREVIEW_SEC}
                muted={isPreviewMuted("hero", phase === "video")}
                className={mediaClassName}
                onEnded={advanceSlide}
              />
            </motion.div>
          )}
          {canStreamPreview && streamTarget && (
            <motion.div
              key={`${media.id}-stream-video`}
              className="absolute inset-0"
              initial={{ opacity: 0 }}
              animate={{ opacity: phase === "video" ? 1 : 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.9, ease: "easeInOut" }}
            >
              <StreamingVideoPreview
                target={streamTarget}
                active={phase === "video"}
                maxDurationSec={HERO_PREVIEW_SEC}
                muted={isPreviewMuted("hero", phase === "video")}
                className={mediaClassName}
                onEnded={advanceSlide}
                onUnavailable={advanceSlide}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div
        className={`hero-prime__scrim ${
          phase === "video" ? "hero-prime__scrim--video" : ""
        }`}
      />

      {hasVideoPreview && (
        <PreviewAudioToggle
          enabled={previewAudio}
          onToggle={togglePreviewAudio}
          className="pointer-events-auto absolute right-4 bottom-20 z-20 sm:right-8 sm:bottom-24"
        />
      )}

      <div
        ref={contentLayerRef}
        className={`page-px pointer-events-none relative z-10 flex h-full flex-col justify-end will-change-transform ${
          fullPage ? "pb-[max(5.5rem,12vh)] sm:pb-[max(6.5rem,14vh)]" : "pb-16 sm:pb-20"
        }`}
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={media.id} {...textMotion} className="pointer-events-auto max-w-[34rem]">
            <span className="inline-flex items-center rounded-[3px] bg-[#1a98ff] px-2 py-0.5 text-[11px] font-bold tracking-[0.04em] text-white uppercase">
              {heroSourceBadge(media)}
            </span>

            {showEpisodeTagline && (
              <p className="title-clip mt-3 text-[13px] leading-snug text-white/72 sm:text-[14px]">
                {episodeTitle}
              </p>
            )}

            <h1 className="title-safe mt-2 font-display text-[clamp(2.75rem,6.5vw,5.5rem)] font-bold leading-[0.9] tracking-[-0.04em] text-white">
              {heroTitle}
            </h1>

            {statusLine && (
              <p className="mt-3 flex items-center gap-2 text-[13px] text-emerald-400 sm:text-[14px]">
                <BadgeCheck className="h-4 w-4 shrink-0" strokeWidth={2.25} />
                <span>{statusLine}</span>
              </p>
            )}

            {media.description ? (
              <p className="title-safe mt-3 line-clamp-2 max-w-xl text-[14px] leading-relaxed text-white/82 sm:text-[15px]">
                {media.description}
              </p>
            ) : null}

            <div className="mt-5 flex flex-wrap items-center gap-2.5 sm:mt-6 sm:gap-3">
              <button
                type="button"
                onClick={() => onPlay(media.id)}
                className="inline-flex min-h-[44px] min-w-[168px] items-center justify-center gap-2.5 rounded-[6px] bg-white px-5 py-2.5 text-[15px] font-semibold text-black transition-colors hover:bg-white/92 sm:px-6"
              >
                <Play className="h-[18px] w-[18px] fill-black" />
                {heroPlayLabel(media, resume)}
              </button>

              {(onToggleFavorite || onToggleStreamingList) && (
                <SparkleActionButton
                  sparkle="list"
                  checked={media.isFavorite}
                  onClick={() => {
                    if (isStreaming && onToggleStreamingList) {
                      const preview = mediaItemToStreamingPreview(media);
                      if (preview) onToggleStreamingList(preview);
                      return;
                    }
                    if (!isStreaming && onToggleFavorite) {
                      onToggleFavorite(media.id);
                    }
                  }}
                  className="flex h-11 w-11 items-center justify-center rounded-full border border-white/45 bg-black/35 text-white backdrop-blur-[2px] transition-colors hover:border-white/70 hover:bg-black/50"
                  aria-label={media.isFavorite ? "In lista" : "La mia lista"}
                >
                  {media.isFavorite ? (
                    <Check className="h-[18px] w-[18px]" strokeWidth={2.5} />
                  ) : (
                    <Plus className="h-[18px] w-[18px]" strokeWidth={2} />
                  )}
                </SparkleActionButton>
              )}

              {(onOpenDetail || onOpenSeries) && (
                <SparkleActionButton
                  sparkle="info"
                  onClick={handleInfo}
                  className="flex h-11 w-11 items-center justify-center rounded-full border border-white/45 bg-black/35 text-white backdrop-blur-[2px] transition-colors hover:border-white/70 hover:bg-black/50"
                  aria-label="Dettagli"
                >
                  <Info className="h-[18px] w-[18px]" strokeWidth={2} />
                </SparkleActionButton>
              )}

              {onEdit && !isStreaming && (
                <button
                  type="button"
                  onClick={() => onEdit(media)}
                  className="rounded-[6px] border border-white/30 px-4 py-2.5 text-[14px] font-medium text-white/88 transition-colors hover:border-white/50 hover:text-white"
                >
                  Modifica
                </button>
              )}
            </div>

            {isStreaming && (
              <p className="mt-3 flex items-center gap-1.5 text-[12px] text-white/55">
                <Check className="h-3.5 w-3.5 text-[#1a98ff]" strokeWidth={2.5} />
                Incluso nel catalogo
              </p>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {items.length > 1 && (
        <div
          className={`pointer-events-none absolute inset-x-0 z-20 flex justify-center gap-2 ${
            fullPage ? "bottom-[max(2rem,5vh)]" : "bottom-6 sm:bottom-8"
          }`}
        >
          {items.map((item, dotIndex) => (
            <button
              key={item.id}
              type="button"
              aria-label={`Vai a ${item.title}`}
              onClick={() => goToSlide(dotIndex)}
              className={`pointer-events-auto rounded-full transition-all ${
                dotIndex === safeIndex
                  ? "h-2 w-7 bg-white"
                  : "h-2 w-2 bg-white/35 hover:bg-white/55"
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
});
