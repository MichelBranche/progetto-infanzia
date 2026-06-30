import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Play, Plus, Check, Info } from "lucide-react";
import type { MediaItem } from "../types/media";
import { formatDuration, mediaTypeLabel } from "../types/media";
import { episodeDisplayTitle } from "../lib/browse";
import {
  isScStreamingMediaId,
  isStreamingMediaId,
  scPreviewTarget,
} from "../lib/streamingBrowse";
import { mediaItemToStreamingPreview } from "../lib/myList";
import type { StremioMetaPreview } from "../types/stremio";
import { HERO_POSTER_MS, HERO_PREVIEW_SEC } from "../lib/preview";
import { prefetchStreamUrl } from "../lib/streamCache";
import { prefetchScPreview } from "../lib/streamingPreviewCache";
import { useProfile } from "../context/ProfileContext";
import { usePreviewAudio } from "../context/PreviewAudioContext";
import { PosterImage } from "./PosterImage";
import { PreviewAudioToggle } from "./PreviewAudioToggle";
import { VideoPreview } from "./VideoPreview";
import { StreamingVideoPreview } from "./StreamingVideoPreview";

interface HeroBannerProps {
  items: MediaItem[];
  onPlay: (id: string) => void;
  onOpenSeries?: (media: MediaItem) => void;
  onToggleFavorite?: (id: string) => void;
  onToggleStreamingList?: (preview: StremioMetaPreview) => void;
  onEdit?: (media: MediaItem) => void;
}

const textMotion = {
  initial: { opacity: 0, y: 24 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -12 },
  transition: { duration: 0.35, ease: [0.22, 1, 0.36, 1] as const },
};

export function HeroBanner({
  items,
  onPlay,
  onOpenSeries,
  onToggleFavorite,
  onToggleStreamingList,
  onEdit,
}: HeroBannerProps) {
  const { activeProfile } = useProfile();
  const { previewAudio, togglePreviewAudio, isPreviewMuted } = usePreviewAudio();
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<"poster" | "video">("poster");
  const slideTimerRef = useRef<number | null>(null);

  const safeIndex = items.length > 0 ? index % items.length : 0;
  const media = items[safeIndex];
  const isStreaming = media ? isStreamingMediaId(media.id) : false;
  const isScStreaming = media ? isScStreamingMediaId(media.id) : false;
  const scPreview = media ? scPreviewTarget(media.id) : null;

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
    if (isScStreaming && scPreview) {
      prefetchScPreview(scPreview.titleId, scPreview.slug);
      return;
    }
    if (isStreaming) return;
    prefetchStreamUrl(activeProfile.id, media.id);
    const next = items[(safeIndex + 1) % items.length];
    if (next && !isStreamingMediaId(next.id)) {
      prefetchStreamUrl(activeProfile.id, next.id);
    } else if (next && isScStreamingMediaId(next.id)) {
      const nextPreview = scPreviewTarget(next.id);
      if (nextPreview) prefetchScPreview(nextPreview.titleId, nextPreview.slug);
    }
  }, [activeProfile, media, isStreaming, isScStreaming, scPreview, safeIndex, items]);

  useEffect(() => {
    if (!media || items.length === 0) return;

    clearSlideTimer();

    if (isStreaming && !isScStreaming) {
      slideTimerRef.current = window.setTimeout(() => {
        setPhase("poster");
        setIndex((current) => (current + 1) % items.length);
      }, HERO_POSTER_MS + HERO_PREVIEW_SEC * 1000);
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
  }, [phase, media?.id, isStreaming, isScStreaming, items.length]);

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

  if (!media) return null;

  const episodeTitle = episodeDisplayTitle(media);
  const heroTitle = media.seriesTitle ?? episodeTitle;
  const durationLabel = formatDuration(media.watchDuration);
  const heroPoster: MediaItem = media.seriesTitle
    ? {
        ...media,
        title: media.seriesTitle,
        season: undefined,
        episode: undefined,
        posterUrl: undefined,
      }
    : media;
  const resume =
    media.watchPosition != null && media.watchPosition > 10;
  const hasVideoPreview = items.some(
    (item) =>
      !isStreamingMediaId(item.id) || isScStreamingMediaId(item.id),
  );

  return (
    <div className="relative h-[52vh] min-h-[320px] max-h-[720px] w-full shrink-0 overflow-hidden bg-black sm:h-[58vh] sm:min-h-[360px] lg:h-[64vh] lg:min-h-[400px]">
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.div
          key={`${media.id}-poster`}
          className="absolute inset-0"
          initial={{ opacity: 0, scale: 1.04 }}
          animate={{
            opacity: phase === "poster" ? 1 : 0,
            scale: phase === "poster" ? 1 : 1.03,
          }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.9, ease: "easeInOut" }}
        >
          <PosterImage item={heroPoster} variant="browse" className="opacity-90" />
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
              className="absolute inset-0 h-full w-full object-cover"
              onEnded={advanceSlide}
            />
          </motion.div>
        )}
        {isScStreaming && scPreview && (
          <motion.div
            key={`${media.id}-sc-video`}
            className="absolute inset-0"
            initial={{ opacity: 0 }}
            animate={{ opacity: phase === "video" ? 1 : 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.9, ease: "easeInOut" }}
          >
            <StreamingVideoPreview
              titleId={scPreview.titleId}
              slug={scPreview.slug}
              active={phase === "video"}
              maxDurationSec={HERO_PREVIEW_SEC}
              muted={isPreviewMuted("hero", phase === "video")}
              className="absolute inset-0 h-full w-full object-cover"
              onEnded={advanceSlide}
            />
          </motion.div>
        )}
      </AnimatePresence>

      <div className="absolute inset-0 bg-gradient-to-t from-void via-void/70 to-void/10" />
      <div className="absolute inset-0 bg-gradient-to-r from-void/95 via-void/35 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-void to-transparent" />

      {hasVideoPreview && (
        <PreviewAudioToggle
          enabled={previewAudio}
          onToggle={togglePreviewAudio}
          className="absolute bottom-24 right-4 z-20 sm:bottom-28 sm:right-8 lg:right-12"
        />
      )}

      <div className="page-px relative flex h-full flex-col justify-end pb-24 pt-24 sm:pb-32 sm:pt-28">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={media.id} {...textMotion} className="max-w-[40rem]">
            <p className="mb-3 text-[12px] font-medium uppercase tracking-[0.2em] text-white/55">
              {isStreaming ? "In streaming" : mediaTypeLabel(media.mediaType)}
              {media.year ? ` · ${media.year}` : ""}
              {durationLabel ? ` · ${durationLabel}` : ""}
            </p>

            <h1 className="title-safe font-display text-[clamp(2.5rem,5vw,4.25rem)] font-bold leading-[0.95] tracking-[-0.03em] text-white drop-shadow-[0_2px_24px_rgba(0,0,0,0.55)]">
              {heroTitle}
            </h1>

            {media.seriesTitle && episodeTitle !== media.seriesTitle && (
              <p className="title-clip mt-3 text-[15px] text-white/75">
                {episodeTitle}
              </p>
            )}

            {media.description ? (
              <p className="title-safe mt-4 line-clamp-3 max-w-xl text-[15px] leading-relaxed text-white/70">
                {media.description}
              </p>
            ) : null}

            <div className="mt-7 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => onPlay(media.id)}
                className="group flex min-w-[132px] items-center justify-center gap-2.5 rounded-[4px] bg-white px-7 py-2.5 text-[15px] font-semibold text-black transition-colors hover:bg-white/90"
              >
                <Play className="h-5 w-5 fill-black" />
                {resume ? "Riprendi" : "Guarda"}
              </button>

              {onOpenSeries && media.seriesTitle && (
                <button
                  type="button"
                  onClick={() => onOpenSeries(media)}
                  className="flex items-center gap-2 rounded-[4px] bg-white/20 px-6 py-2.5 text-[15px] font-semibold text-white backdrop-blur-md transition-colors hover:bg-white/30"
                >
                  <Info className="h-5 w-5" strokeWidth={2} />
                  Episodi
                </button>
              )}

              {(onToggleFavorite || onToggleStreamingList) && (
                <button
                  type="button"
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
                  className="flex h-[42px] w-[42px] items-center justify-center rounded-full border-2 border-white/35 bg-black/35 text-white backdrop-blur-sm transition-colors hover:border-white/60 hover:bg-black/50"
                  aria-label={media.isFavorite ? "In lista" : "La mia lista"}
                >
                  {media.isFavorite ? (
                    <Check className="h-5 w-5" strokeWidth={2.5} />
                  ) : (
                    <Plus className="h-5 w-5" strokeWidth={2} />
                  )}
                </button>
              )}

              {onEdit && !isStreaming && (
                <button
                  type="button"
                  onClick={() => onEdit(media)}
                  className="rounded-[4px] border border-white/25 px-5 py-2.5 text-[14px] font-medium text-white/85 transition-colors hover:border-white/45 hover:text-white"
                >
                  Modifica
                </button>
              )}
            </div>
          </motion.div>
        </AnimatePresence>

        {items.length > 1 && (
          <div className="absolute bottom-6 left-4 flex gap-1.5 sm:bottom-8 sm:left-8 lg:left-12">
            {items.map((item, dotIndex) => (
              <button
                key={item.id}
                type="button"
                aria-label={`Vai a ${item.title}`}
                onClick={() => goToSlide(dotIndex)}
                className={`h-[3px] rounded-full transition-all ${
                  dotIndex === safeIndex
                    ? "w-8 bg-white"
                    : "w-5 bg-white/30 hover:bg-white/50"
                }`}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
