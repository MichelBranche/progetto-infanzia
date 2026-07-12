import { memo, useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
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
import { useMobileDevice, useCompactShell } from "../context/MobileDeviceContext";

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
const heroEaseOut = [0.33, 1, 0.68, 1] as const;
const heroEaseIn = [0.4, 0, 1, 1] as const;
const heroMediaEase = [0.4, 0, 0.2, 1] as const;

const heroMediaMotion = {
  initial: { opacity: 0, filter: "blur(8px)" },
  animate: {
    opacity: 1,
    filter: "blur(0px)",
    transition: { duration: 0.72, ease: heroMediaEase },
  },
  exit: {
    opacity: 0,
    filter: "blur(6px)",
    transition: { duration: 0.55, ease: heroEaseIn },
  },
};

const heroContentMotion = {
  initial: {},
  animate: {
    transition: {
      staggerChildren: 0.065,
      delayChildren: 0.08,
    },
  },
  exit: {
    transition: {
      staggerChildren: 0.045,
      staggerDirection: -1,
    },
  },
};

const heroPartMotion = {
  initial: { opacity: 0, y: 22 },
  animate: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: heroEaseOut },
  },
  exit: {
    opacity: 0,
    y: -14,
    transition: { duration: 0.34, ease: heroEaseIn },
  },
};

const HERO_SWIPE_MIN_PX = 52;
const HERO_SWIPE_RATIO = 0.14;

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

function HeroSlideDots({
  items,
  safeIndex,
  onSelect,
  className = "",
}: {
  items: MediaItem[];
  safeIndex: number;
  onSelect: (index: number) => void;
  className?: string;
}) {
  return (
    <div className={`lf-hero-dots ${className}`.trim()}>
      {items.map((item, dotIndex) => {
        const isActive = dotIndex === safeIndex;
        return (
          <button
            key={item.id}
            type="button"
            aria-label={`Vai a ${item.title}`}
            onClick={() => onSelect(dotIndex)}
            className={`lf-hero-dot ${
              isActive ? "lf-hero-dot--active" : "lf-hero-dot--idle"
            }`}
          >
            {isActive && <span key={safeIndex} className="dot-filling" />}
          </button>
        );
      })}
    </div>
  );
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
  const { isMobileDevice } = useMobileDevice();
  const { isCompactShell } = useCompactShell();
  const touchLayout = isCompactShell;
  const [index, setIndex] = useState(0);
  const [heroImageById, setHeroImageById] = useState<Record<string, string>>({});
  const [heroLogoUrl, setHeroLogoUrl] = useState<string | undefined>();
  const [heroSwipeDragX, setHeroSwipeDragX] = useState(0);
  const [isHeroSwiping, setIsHeroSwiping] = useState(false);
  const slideTimerRef = useRef<number | null>(null);
  const heroRef = useRef<HTMLDivElement>(null);
  const mediaLayerRef = useRef<HTMLDivElement>(null);
  const contentLayerRef = useRef<HTMLDivElement>(null);
  const heroSwipeRef = useRef({
    active: false,
    locked: "none" as "none" | "x" | "y",
    startX: 0,
    startY: 0,
    pointerId: -1,
  });
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

  const goToSlide = useCallback(
    (dotIndex: number) => {
      clearSlideTimer();
      selectSlide(dotIndex);
    },
    [selectSlide],
  );

  const stepSlide = useCallback(
    (delta: number) => {
      if (items.length <= 1) return;
      clearSlideTimer();
      const nextIndex = (safeIndex + delta + items.length) % items.length;
      selectSlide(nextIndex);
    },
    [items.length, safeIndex, selectSlide],
  );

  const resetHeroSwipe = useCallback(() => {
    heroSwipeRef.current = {
      active: false,
      locked: "none",
      startX: 0,
      startY: 0,
      pointerId: -1,
    };
    setHeroSwipeDragX(0);
    setIsHeroSwiping(false);
  }, []);

  const onHeroSwipeStart = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!touchLayout || items.length <= 1 || event.button !== 0) return;
      heroSwipeRef.current = {
        active: true,
        locked: "none",
        startX: event.clientX,
        startY: event.clientY,
        pointerId: event.pointerId,
      };
    },
    [items.length, touchLayout],
  );

  const onHeroSwipeMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const swipe = heroSwipeRef.current;
      if (!swipe.active || swipe.pointerId !== event.pointerId) return;

      const dx = event.clientX - swipe.startX;
      const dy = event.clientY - swipe.startY;

      if (swipe.locked === "none") {
        if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
        if (Math.abs(dx) > Math.abs(dy) * 1.15) {
          swipe.locked = "x";
          setIsHeroSwiping(true);
          event.currentTarget.setPointerCapture(event.pointerId);
        } else {
          swipe.active = false;
          swipe.locked = "y";
          return;
        }
      }

      if (swipe.locked !== "x") return;

      const width = heroRef.current?.clientWidth ?? 0;
      const maxDrag = width * 0.28;
      const clamped =
        dx < 0
          ? Math.max(dx, safeIndex >= items.length - 1 ? -maxDrag * 0.35 : -maxDrag)
          : Math.min(dx, safeIndex <= 0 ? maxDrag * 0.35 : maxDrag);

      setHeroSwipeDragX(clamped * 0.42);
    },
    [items.length, safeIndex],
  );

  const onHeroSwipeEnd = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const swipe = heroSwipeRef.current;
      if (!swipe.active && swipe.locked !== "x") {
        resetHeroSwipe();
        return;
      }

      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }

      if (swipe.locked === "x") {
        const dx = event.clientX - swipe.startX;
        const width = heroRef.current?.clientWidth ?? 0;
        const threshold = Math.max(HERO_SWIPE_MIN_PX, width * HERO_SWIPE_RATIO);
        if (dx <= -threshold) stepSlide(1);
        else if (dx >= threshold) stepSlide(-1);
      }

      resetHeroSwipe();
    },
    [resetHeroSwipe, stepSlide],
  );

  const onHeroSwipeCancel = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      resetHeroSwipe();
    },
    [resetHeroSwipe],
  );

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

  const heroSwipeEnabled = touchLayout && items.length > 1;
  const heroDragStyle =
    heroSwipeDragX !== 0
      ? { transform: `translate3d(${heroSwipeDragX}px, 0, 0)` }
      : undefined;

  return (
    <div
      ref={heroRef}
      className={`lf-hero pointer-events-none relative z-20 w-full shrink-0 ${
        touchLayout ? "lf-hero--touch-layout " : ""
      }${heroSwipeEnabled ? "lf-hero--swipeable " : ""}${
        isHeroSwiping ? "lf-hero--swiping " : ""
      }${
        fullPage
          ? "lf-hero--full"
          : "h-[min(72vh,720px)] min-h-[380px] max-h-[820px] overflow-hidden sm:h-[85vh] sm:min-h-[420px]"
      }`}
      onPointerDownCapture={heroSwipeEnabled ? onHeroSwipeStart : undefined}
      onPointerMoveCapture={heroSwipeEnabled ? onHeroSwipeMove : undefined}
      onPointerUpCapture={heroSwipeEnabled ? onHeroSwipeEnd : undefined}
      onPointerCancelCapture={heroSwipeEnabled ? onHeroSwipeCancel : undefined}
    >
      <div
        ref={mediaLayerRef}
        className="lf-hero__media-wrap pointer-events-none"
      >
        <div
          className="lf-hero__swipe-shift absolute inset-0"
          style={heroDragStyle}
        >
        <AnimatePresence mode="sync" initial={false}>
          <motion.div
            key={media.id}
            className="absolute inset-0"
            initial={heroMediaMotion.initial}
            animate={heroMediaMotion.animate}
            exit={heroMediaMotion.exit}
          >
          <div className="lf-hero__kenburns absolute inset-0">
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
          </div>
          </motion.div>
        </AnimatePresence>
        {/* Dentro il wrapper mascherato: la patina dissolve insieme all'immagine */}
        {fullPage && (
          <div className="lf-hero__fade lf-hero__fade--left" aria-hidden />
        )}
        {fullPage && (
          <div className="lf-hero__scrim-mobile pointer-events-none absolute inset-x-0 bottom-0 z-[1]" aria-hidden />
        )}
        </div>
      </div>

      {!fullPage && <div className="hero-prime__scrim" />}

      <div
        ref={contentLayerRef}
        className={`lf-hero__content-shell page-px pointer-events-none relative z-10 flex h-full min-h-full flex-col justify-end will-change-transform ${
          fullPage && !touchLayout
            ? "pb-20 lg:pb-24"
            : fullPage
              ? ""
              : "pb-16 sm:pb-20"
        }`}
      >
        {touchLayout ? <div className="lf-hero__content-spacer" aria-hidden /> : null}
        <div className="lf-hero__swipe-shift w-full" style={heroDragStyle}>
        <div className="lf-hero__content-stage relative w-full">
          <AnimatePresence mode="sync" initial={false}>
            <motion.div
              key={media.id}
              variants={heroContentMotion}
              initial="initial"
              animate="animate"
              exit="exit"
              className={`lf-hero__content pointer-events-auto w-full ${
                touchLayout
                  ? "mx-auto max-w-3xl text-center"
                  : "max-w-[44rem] text-center lg:text-left"
              }`}
            >
            {showEpisodeTagline && (
              <motion.p
                variants={heroPartMotion}
                data-hero-part
                className="title-clip text-[12px] leading-snug text-white/72 sm:text-[14px]"
              >
                {episodeTitle}
              </motion.p>
            )}

            {heroLogoUrl ? (
              <motion.img
                variants={heroPartMotion}
                data-hero-part
                src={heroLogoUrl}
                alt={heroTitle}
                className={`lf-hero__logo w-auto object-contain object-center drop-shadow-[0_8px_32px_rgba(0,0,0,0.55)] ${
                  touchLayout
                    ? "mx-auto mb-3"
                    : "mx-auto mb-2 lg:mx-0 lg:mb-3 lg:object-left"
                }`}
              />
            ) : (
              <motion.h1
                variants={heroPartMotion}
                data-hero-part
                className={`title-safe font-display font-bold tracking-[-0.03em] text-white ${
                  touchLayout
                    ? "mt-1 text-[clamp(2.25rem,5.5vw,4rem)] leading-[0.92]"
                    : "mt-1 max-md:px-0.5 text-[clamp(1.75rem,7.5vw,3.25rem)] leading-[0.92] lg:mt-2 lg:text-[clamp(3.25rem,8vw,6.5rem)] lg:leading-[0.9]"
                }`}
              >
                {heroTitle}
              </motion.h1>
            )}

            <motion.div
              variants={heroPartMotion}
              data-hero-part
              className={`lf-hero-meta mt-2 flex flex-wrap items-center justify-center gap-2 ${
                touchLayout ? "" : "lg:hidden"
              }`}
            >
              {ratingLabel && (
                <span className="lf-hero-meta__pill">{ratingLabel}</span>
              )}
              {media.year && (
                <span className="lf-hero-meta__pill">{media.year}</span>
              )}
              <span className="lf-hero-meta__pill">{genreLabel}</span>
              {isStreaming && (
                <span className="lf-hero-meta__pill lf-hero-meta__pill--accent">
                  {heroSourceBadge(media)}
                </span>
              )}
            </motion.div>

            {!touchLayout && (
            <motion.div
              variants={heroPartMotion}
              data-hero-part
              className="mt-3 hidden flex-wrap items-center gap-x-4 gap-y-2 text-[13px] text-white/78 sm:text-[14px] lg:flex"
            >
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
            </motion.div>
            )}

            {media.description ? (
              <motion.p
                variants={heroPartMotion}
                data-hero-part
                className={`title-safe mt-2 line-clamp-2 max-w-xl leading-relaxed text-white/82 ${
                  touchLayout
                    ? "mx-auto text-[15px] sm:text-[16px]"
                    : "mx-auto text-[13px] sm:text-[15px] lg:mx-0 lg:mt-3"
                }`}
              >
                {media.description}
              </motion.p>
            ) : null}

            <motion.div
              variants={heroPartMotion}
              data-hero-part
              className={`lf-hero-actions mt-4 flex w-full gap-3 sm:mt-5 ${
                touchLayout
                  ? "lf-hero-actions--stacked flex-col items-center"
                  : "flex-col items-stretch gap-2.5 sm:gap-3 lg:mt-6 lg:flex-row lg:flex-wrap lg:items-center lg:justify-start"
              }`}
            >
              <button
                type="button"
                onClick={() => onPlay(media.id)}
                className={`theme-btn-primary relative inline-flex shrink-0 items-center justify-center gap-2.5 font-bold tracking-wide shadow-xl shadow-black/10 transition-transform duration-200 hover:scale-[1.02] active:scale-[0.98] ${
                  touchLayout
                    ? `rounded-full px-8 text-base ${
                        isMobileDevice
                          ? "h-14 min-h-[56px] min-w-[11rem] text-lg"
                          : "h-12 min-h-[48px] min-w-[10.5rem]"
                      }`
                    : "h-12 min-h-[48px] w-full rounded-xl px-6 text-base sm:h-[52px] sm:min-w-[140px] sm:w-auto sm:rounded-full sm:px-8 sm:text-lg sm:hover:scale-105 sm:active:scale-95"
                }`}
              >
                <Play
                  className={
                    touchLayout && isMobileDevice
                      ? "h-6 w-6 fill-current"
                      : "h-5 w-5 fill-current"
                  }
                />
                {resume ? "Riprendi" : "PLAY"}
              </button>

              {((onToggleFavorite || onToggleStreamingList) ||
                (onOpenDetail || onOpenSeries)) && (
                <div
                  className={`lf-hero-secondary relative z-0 shrink-0 items-stretch ${
                    touchLayout
                      ? `inline-flex w-auto ${
                          isMobileDevice ? "h-12" : "h-11"
                        }`
                      : "flex h-12 w-full sm:h-[52px] sm:w-auto"
                  }`}
                >
                  <div
                    className={`theme-btn-secondary pointer-events-none absolute inset-0 -z-10 border border-white/10 shadow-lg shadow-black/5 backdrop-blur-[20px] backdrop-saturate-150 ${
                      touchLayout ? "rounded-full" : "rounded-xl sm:rounded-full"
                    }`}
                  />

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
                      className={`group/btn flex h-full items-center justify-center outline-none transition-colors active:bg-white/30 ${
                        touchLayout
                          ? "w-12 rounded-l-full px-0"
                          : "flex-1 rounded-l-xl px-4 sm:flex-none sm:rounded-l-full sm:px-5"
                      }`}
                      aria-label={media.isFavorite ? "In lista" : "La mia lista"}
                    >
                      {media.isFavorite ? (
                        <Check
                          className={`text-white transition-transform duration-300 group-hover/btn:scale-110 ${
                            touchLayout ? "h-5 w-5" : "h-5 w-5 sm:h-6 sm:w-6"
                          }`}
                          strokeWidth={2.5}
                        />
                      ) : (
                        <Plus
                          className={`text-white transition-transform duration-300 group-hover/btn:scale-110 ${
                            touchLayout ? "h-5 w-5" : "h-5 w-5 sm:h-6 sm:w-6"
                          }`}
                          strokeWidth={2}
                        />
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
                        className={`group/btn flex h-full items-center justify-center outline-none transition-colors active:bg-white/30 ${
                          touchLayout
                            ? "w-12 rounded-r-full px-0"
                            : `flex-1 px-4 sm:flex-none sm:px-5 ${
                                onToggleFavorite || onToggleStreamingList
                                  ? "rounded-r-xl sm:rounded-r-full"
                                  : "rounded-xl sm:rounded-full"
                              }`
                        }`}
                        aria-label="Dettagli"
                      >
                        <Info
                          className={`text-white transition-transform duration-300 group-hover/btn:scale-110 ${
                            touchLayout ? "h-5 w-5" : "h-5 w-5 sm:h-6 sm:w-6"
                          }`}
                          strokeWidth={2}
                        />
                      </SparkleActionButton>
                    </>
                  )}
                </div>
              )}

              {onEdit && !isStreaming && (
                <button
                  type="button"
                  onClick={() => onEdit(media)}
                  className="rounded-[6px] border border-white/30 px-4 py-2.5 text-[14px] font-medium text-white/88 transition-colors hover:border-white/50 hover:text-white max-lg:w-full"
                >
                  Modifica
                </button>
              )}
            </motion.div>

            {isStreaming && !touchLayout && (
              <motion.p
                variants={heroPartMotion}
                data-hero-part
                className="mt-3 hidden items-center gap-1.5 text-[12px] text-white/55 lg:flex"
              >
                <Check className="h-3.5 w-3.5 text-white/70" strokeWidth={2.5} />
                {heroSourceBadge(media)}
              </motion.p>
            )}

            {items.length > 1 && touchLayout && (
              <motion.div variants={heroPartMotion} data-hero-part>
                <HeroSlideDots
                  items={items}
                  safeIndex={safeIndex}
                  onSelect={goToSlide}
                  className="lf-hero-dots--inline mt-5"
                />
              </motion.div>
            )}
          </motion.div>
        </AnimatePresence>
        </div>
        </div>
      </div>

      {items.length > 1 && !touchLayout && (
        <HeroSlideDots
          items={items}
          safeIndex={safeIndex}
          onSelect={goToSlide}
          className="lf-hero-dots--dock pointer-events-auto absolute right-6 bottom-24 z-30 sm:right-12 sm:bottom-28 lg:right-16 lg:bottom-32"
        />
      )}
    </div>
  );
});
