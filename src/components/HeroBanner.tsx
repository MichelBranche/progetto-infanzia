import { memo, useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Play, Plus, Check, Info, Star, Calendar, Heart } from "lucide-react";
import type { MediaItem } from "../types/media";
import { mediaTypeLabel } from "../types/media";
import { episodeDisplayTitle } from "../lib/browse";
import type { BrowseItem } from "../lib/browse";
import {
  isStreamingMediaId,
  streamingBrowseItem,
} from "../lib/streamingBrowse";
import { mediaItemToStreamingPreview } from "../lib/myList";
import { useLordFlixHeroEntrance } from "../hooks/useLordFlixHeroEntrance";
import { HERO_POSTER_MS } from "../lib/preview";
import { prefetchStreamUrl } from "../lib/streamCache";
import { useProfile } from "../context/ProfileContext";
import { PosterImage, posterUrlFor } from "./PosterImage";
import {
  prefetchHeroImage,
  resolveHeroImageUrl,
  resolveHeroLogoUrl,
} from "../lib/heroImage";
import { SparkleActionButton } from "./SparkleActionButton";
import { useHeroScrollParallax } from "../hooks/useHeroScrollParallax";
import { useHeroAmbientControls } from "../context/HeroAmbientContext";
import {
  cacheHeroPalette,
  getCachedHeroPalette,
  prefetchHeroPalette,
  resolveAmbientPalette,
  resolveAmbientPaletteAsync,
} from "../lib/imagePalette";
import { heroUrlQualityScore, pickBestHeroUrl, pickBestLogoUrl } from "../lib/posterUrl";

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

function toHeroItem(media: MediaItem): MediaItem {
  if (!media.seriesTitle) return media;
  return {
    ...media,
    title: media.seriesTitle,
    season: undefined,
    episode: undefined,
    posterUrl: media.seriesPosterUrl ?? media.posterUrl,
    backgroundUrl: media.backgroundUrl,
    logoUrl: media.logoUrl,
  };
}

function heroImageForItem(media: MediaItem, resolved?: string): string | undefined {
  return resolved ?? posterUrlFor(toHeroItem(media), "hero");
}

function applyHeroPalette(
  media: MediaItem,
  imageUrl: string | undefined,
  setPalette: (palette: import("../lib/imagePalette").AmbientPalette) => void,
) {
  const cached = getCachedHeroPalette(media.id);
  if (cached) {
    setPalette(cached);
    return;
  }
  void prefetchHeroPalette(
    media.id,
    imageUrl,
    media.gradient,
  ).then((palette) => {
    if (palette) setPalette(palette);
  });
}
const textMotion = {
  initial: { opacity: 1, y: 0 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 1, y: 0 },
  transition: { duration: 0 },
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

function heroGenreLabel(media: MediaItem): string {
  if (media.genres?.[0]) return media.genres[0];
  return mediaTypeLabel(media.mediaType);
}

function heroRatingLabel(media: MediaItem, isStreaming: boolean): string | null {
  if (media.runtimeMins) return `${media.runtimeMins} min`;
  if (isStreaming) return "HD";
  return null;
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
  const [index, setIndex] = useState(0);
  const [heroImageById, setHeroImageById] = useState<Record<string, string>>({});
  const [heroLogoUrl, setHeroLogoUrl] = useState<string | undefined>();
  const slideTimerRef = useRef<number | null>(null);
  const heroRef = useRef<HTMLDivElement>(null);
  const mediaLayerRef = useRef<HTMLDivElement>(null);
  const contentLayerRef = useRef<HTMLDivElement>(null);
  const { setPalette, setActive, setBackdropUrl } = useHeroAmbientControls();

  useHeroScrollParallax(
    heroRef,
    mediaLayerRef,
    contentLayerRef,
    scrollContainerRef ?? { current: null },
    Boolean(scrollContainerRef),
  );

  const safeIndex = items.length > 0 ? index % items.length : 0;
  const media = items[safeIndex];
  useLordFlixHeroEntrance(contentLayerRef, media?.id ?? "empty");
  const isStreaming = media ? isStreamingMediaId(media.id) : false;

  useEffect(() => {
    document.documentElement.style.setProperty(
      "--lf-hero-slide-ms",
      `${HERO_POSTER_MS}ms`,
    );
  }, []);

  useEffect(() => {
    setActive(true);
    return () => setActive(false);
  }, [setActive]);

  const handleHeroImageLoad = useCallback(
    (image: HTMLImageElement, heroItem: MediaItem) => {
      const cached = getCachedHeroPalette(heroItem.id);
      if (cached) {
        setPalette(cached);
        return;
      }

      const immediate = resolveAmbientPalette(image, heroItem.gradient);
      setPalette(immediate);

      const imageUrl = image.currentSrc || image.src;
      void resolveAmbientPaletteAsync(image, imageUrl, heroItem.gradient).then(
        (palette) => {
          setPalette(palette);
          cacheHeroPalette(heroItem.id, palette);
        },
      );
    },
    [setPalette],
  );

  const clearSlideTimer = () => {
    if (slideTimerRef.current != null) {
      window.clearTimeout(slideTimerRef.current);
      slideTimerRef.current = null;
    }
  };

  useEffect(() => {
    setIndex(0);
  }, [items]);

  useEffect(() => {
    if (!media) return;

    const heroItem = toHeroItem(media);
    let cancelled = false;
    setHeroLogoUrl(pickBestLogoUrl(heroItem.logoUrl));

    void (async () => {
      const [image, logo] = await Promise.all([
        resolveHeroImageUrl(heroItem),
        resolveHeroLogoUrl(heroItem),
      ]);
      if (cancelled) return;

      if (image) {
        setHeroImageById((current) => {
          const currentScore = heroUrlQualityScore(current[media.id]);
          const nextScore = heroUrlQualityScore(image);
          if (current[media.id] === image || nextScore < currentScore) {
            return current;
          }
          return { ...current, [media.id]: image };
        });
        void prefetchHeroPalette(media.id, image, media.gradient);
      }

      if (logo) setHeroLogoUrl(logo);
    })();

    return () => {
      cancelled = true;
    };
  }, [media?.id, media?.logoUrl, media?.seriesTitle, media?.gradient]);

  useEffect(() => {
    let cancelled = false;

    const loadItem = async (item: MediaItem) => {
      const heroItem = toHeroItem(item);
      const previewUrl = pickBestHeroUrl(
        item.backgroundUrl,
        posterUrlFor(heroItem, "hero"),
        item.posterUrl,
      );

      if (!cancelled && previewUrl) {
        setHeroImageById((current) =>
          current[item.id] === previewUrl
            ? current
            : { ...current, [item.id]: previewUrl },
        );
        void prefetchHeroPalette(item.id, previewUrl, item.gradient);
      }

      if (!isStreamingMediaId(item.id)) return;

      const upgraded = await resolveHeroImageUrl(item);
      if (cancelled || !upgraded) return;

      setHeroImageById((current) => {
        const currentScore = heroUrlQualityScore(current[item.id]);
        const nextScore = heroUrlQualityScore(upgraded);
        if (current[item.id] === upgraded || nextScore < currentScore) {
          return current;
        }
        return { ...current, [item.id]: upgraded };
      });
      void prefetchHeroPalette(item.id, upgraded, item.gradient);
    };

    for (const item of items) {
      void loadItem(item);
    }

    return () => {
      cancelled = true;
    };
  }, [items]);

  useEffect(() => {
    if (!media) return;
    const heroItem = toHeroItem(media);
    const imageUrl = heroImageForItem(heroItem, heroImageById[media.id]);
    applyHeroPalette(media, imageUrl, setPalette);
  }, [
    media?.id,
    media?.gradient,
    heroImageById,
    setPalette,
  ]);

  // Backdrop sfocato a tutto schermo (solo home full-page, stile LordFlix)
  useEffect(() => {
    if (!fullPage || !media) return;
    const heroItem = toHeroItem(media);
    const imageUrl = pickBestHeroUrl(
      heroImageById[media.id],
      posterUrlFor(heroItem, "hero"),
      media.backgroundUrl,
      media.posterUrl,
    );
    setBackdropUrl(imageUrl ?? null);
  }, [fullPage, media, heroImageById, setBackdropUrl]);

  useEffect(() => {
    if (!fullPage) return;
    return () => setBackdropUrl(null);
  }, [fullPage, setBackdropUrl]);

  useEffect(() => {
    if (!activeProfile || !media || isStreaming) return;
    prefetchStreamUrl(activeProfile.id, media.id);
    const next = items[(safeIndex + 1) % items.length];
    if (next && !isStreamingMediaId(next.id)) {
      prefetchStreamUrl(activeProfile.id, next.id);
    }
  }, [activeProfile, media, isStreaming, safeIndex, items]);

  const selectSlide = useCallback(
    (nextIndex: number) => {
      const next = items[nextIndex];
      if (next) {
        const heroItem = toHeroItem(next);
        const imageUrl = heroImageForItem(heroItem, heroImageById[next.id]);
        applyHeroPalette(next, imageUrl, setPalette);
      }
      setIndex(nextIndex);
    },
    [items, heroImageById, setPalette],
  );

  useEffect(() => {
    if (!media || items.length <= 1) return;

    clearSlideTimer();
    slideTimerRef.current = window.setTimeout(() => {
      selectSlide((safeIndex + 1) % items.length);
    }, HERO_POSTER_MS);

    return clearSlideTimer;
  }, [media?.id, items.length, safeIndex, selectSlide]);

  const goToSlide = (dotIndex: number) => {
    clearSlideTimer();
    selectSlide(dotIndex);
  };

  useEffect(() => {
    if (items.length === 0) return;
    const next = items[(safeIndex + 1) % items.length];
    if (!next) return;
    prefetchHeroImage(next);
    const heroItem = toHeroItem(next);
    const imageUrl = heroImageForItem(heroItem, heroImageById[next.id]);
    void prefetchHeroPalette(next.id, imageUrl, next.gradient);
  }, [items, safeIndex, heroImageById]);

  if (!media) return null;

  const episodeTitle = episodeDisplayTitle(media);
  const heroTitle = media.seriesTitle ?? episodeTitle;
  const heroPoster = toHeroItem(media);
  const heroImageUrl = pickBestHeroUrl(
    heroImageById[media.id],
    posterUrlFor(heroPoster, "hero"),
    media.backgroundUrl,
    media.posterUrl,
  );
  const resume =
    media.watchPosition != null && media.watchPosition > 10;
  const ratingLabel = heroRatingLabel(media, isStreaming);
  const genreLabel = heroGenreLabel(media);
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
      className={`lf-hero pointer-events-none relative z-20 w-full shrink-0 ${
        fullPage
          ? "lf-hero--full"
          : "h-[min(72vh,720px)] min-h-[380px] max-h-[820px] overflow-hidden sm:h-[85vh] sm:min-h-[420px]"
      }`}
    >
      <div
        ref={mediaLayerRef}
        className="lf-hero__media-wrap pointer-events-none"
      >
        <AnimatePresence mode="sync" initial={false}>
          <motion.div
            key={media.id}
            className="absolute inset-0 lf-hero__kenburns"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1.35, ease: "easeInOut" }}
          >
          {heroImageUrl ? (
          <PosterImage
            item={heroPoster}
            variant="hero"
            priority
            srcOverride={heroImageUrl}
            className={`${mediaClassName} lf-hero__media`}
            onImageLoad={(image) => {
              if (media.id !== heroPoster.id) return;
              handleHeroImageLoad(image, heroPoster);
            }}
          />
          ) : null}
          </motion.div>
        </AnimatePresence>
        {/* Dentro il wrapper mascherato: la patina dissolve insieme all'immagine */}
        {fullPage && (
          <div className="lf-hero__fade lf-hero__fade--left" aria-hidden />
        )}
      </div>

      {!fullPage && <div className="hero-prime__scrim" />}

      <div
        ref={contentLayerRef}
        className={`page-px pointer-events-none relative z-10 flex h-full flex-col justify-end will-change-transform ${
          fullPage ? "pb-20 lg:pb-24" : "pb-16 sm:pb-20"
        }`}
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={media.id} {...textMotion} className="pointer-events-auto max-w-[44rem] text-center lg:text-left">
            {showEpisodeTagline && (
              <p data-hero-part className="title-clip text-[13px] leading-snug text-white/72 sm:text-[14px]">
                {episodeTitle}
              </p>
            )}

            {heroLogoUrl ? (
              <img
                data-hero-part
                src={heroLogoUrl}
                alt={heroTitle}
                className="mx-auto mb-3 max-h-[10.5rem] w-auto max-w-[min(100%,720px)] object-contain object-center drop-shadow-[0_8px_32px_rgba(0,0,0,0.55)] sm:max-h-48 lg:mx-0 lg:max-h-[15.75rem] lg:max-w-[min(100%,840px)] lg:object-left xl:max-h-[16.5rem]"
              />
            ) : (
              <h1 data-hero-part className="title-safe mt-2 font-display text-[clamp(3.25rem,8vw,6.5rem)] font-bold leading-[0.9] tracking-[-0.03em] text-white">
                {heroTitle}
              </h1>
            )}

            <div data-hero-part className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px] text-white/78 sm:text-[14px]">
              {ratingLabel && (
                <span className="inline-flex items-center gap-1.5">
                  <Star className="h-4 w-4 fill-white/20 text-white/90" strokeWidth={1.75} />
                  {ratingLabel}
                </span>
              )}
              {media.year && (
                <span className="inline-flex items-center gap-1.5">
                  <Calendar className="h-4 w-4 text-white/80" strokeWidth={1.75} />
                  {media.year}
                </span>
              )}
              <span className="inline-flex items-center gap-1.5">
                <Heart className="h-4 w-4 text-white/80" strokeWidth={1.75} />
                {genreLabel}
              </span>
            </div>

            {media.description ? (
              <p data-hero-part className="title-safe mt-3 line-clamp-2 max-w-xl text-[14px] leading-relaxed text-white/82 sm:text-[15px]">
                {media.description}
              </p>
            ) : null}

            <div data-hero-part className="mt-5 flex flex-wrap items-center justify-center gap-3 sm:mt-6 lg:justify-start">
              <button
                type="button"
                onClick={() => onPlay(media.id)}
                className="theme-btn-primary relative inline-flex h-[52px] min-w-[140px] items-center justify-center gap-2 rounded-full px-8 text-lg font-bold tracking-wide shadow-xl shadow-black/10 transition-transform duration-200 hover:scale-105 active:scale-95"
              >
                <Play className="h-5 w-5 fill-current" />
                {resume ? "Riprendi" : "PLAY"}
              </button>

              {((onToggleFavorite || onToggleStreamingList) ||
                (onOpenDetail || onOpenSeries)) && (
                <div className="relative z-0 flex h-[52px] items-stretch">
                  <div className="theme-btn-secondary pointer-events-none absolute inset-0 -z-10 rounded-full border border-white/10 shadow-lg shadow-black/5 backdrop-blur-[20px] backdrop-saturate-150" />

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
                      className="group/btn flex h-full items-center justify-center rounded-l-full px-5 outline-none transition-colors active:bg-white/30"
                      aria-label={media.isFavorite ? "In lista" : "La mia lista"}
                    >
                      {media.isFavorite ? (
                        <Check className="h-6 w-6 text-white transition-transform duration-300 group-hover/btn:scale-110" strokeWidth={2.5} />
                      ) : (
                        <Plus className="h-6 w-6 text-white transition-transform duration-300 group-hover/btn:scale-110" strokeWidth={2} />
                      )}
                    </SparkleActionButton>
                  )}

                  {(onOpenDetail || onOpenSeries) && (
                    <>
                      {(onToggleFavorite || onToggleStreamingList) && (
                        <div className="flex h-full items-center">
                          <div className="h-6 w-px bg-white/30" />
                        </div>
                      )}
                      <SparkleActionButton
                        sparkle="info"
                        onClick={handleInfo}
                        className={`group/btn flex h-full items-center justify-center px-5 outline-none transition-colors active:bg-white/30 ${
                          onToggleFavorite || onToggleStreamingList
                            ? "rounded-r-full"
                            : "rounded-full"
                        }`}
                        aria-label="Dettagli"
                      >
                        <Info className="h-6 w-6 text-white transition-transform duration-300 group-hover/btn:scale-110" strokeWidth={2} />
                      </SparkleActionButton>
                    </>
                  )}
                </div>
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
                <Check className="h-3.5 w-3.5 text-white/70" strokeWidth={2.5} />
                {heroSourceBadge(media)}
              </p>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {items.length > 1 && (
        <div className="lf-hero-dots pointer-events-auto absolute right-6 bottom-24 z-30 flex items-center gap-2 sm:right-12 sm:bottom-28 lg:right-16 lg:bottom-32">
          {items.map((item, dotIndex) => {
            const isActive = dotIndex === safeIndex;
            return (
              <button
                key={item.id}
                type="button"
                aria-label={`Vai a ${item.title}`}
                onClick={() => goToSlide(dotIndex)}
                className={`lf-hero-dot ${
                  isActive ? "lf-hero-dot--active" : "lf-hero-dot--idle"
                }`}
              >
                {isActive && (
                  <span
                    key={safeIndex}
                    className="dot-filling"
                  />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
});
