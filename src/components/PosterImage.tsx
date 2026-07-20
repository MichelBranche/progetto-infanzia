import { Film, Sparkles, Tv } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePosterQuality } from "../context/PosterQualityContext";
import type { PosterQualityTier } from "../lib/posterQuality";
import {
  adaptHeroUrl,
  adaptPosterUrl,
  posterUrlFallbacks,
} from "../lib/posterUrl";
import type { MediaItem } from "../types/media";

export type PosterVariant = "browse" | "continue" | "episode" | "hero";

function rawPosterUrlFor(
  item: MediaItem,
  variant: PosterVariant = "browse",
): string | undefined {
  if (variant === "hero") {
    return item.backgroundUrl ?? item.seriesPosterUrl ?? item.posterUrl;
  }
  if (variant === "continue") {
    return item.backgroundUrl ?? item.posterUrl ?? item.seriesPosterUrl;
  }
  if (variant === "episode") {
    return item.posterUrl ?? item.seriesPosterUrl;
  }
  if (item.seriesPosterUrl) {
    return item.seriesPosterUrl;
  }
  return item.posterUrl;
}

export function posterUrlFor(
  item: MediaItem,
  variant: PosterVariant = "browse",
  tier: PosterQualityTier = "high",
): string | undefined {
  const url = rawPosterUrlFor(item, variant);
  return variant === "hero"
    ? adaptHeroUrl(url, tier)
    : adaptPosterUrl(url, tier);
}

interface PosterImageProps {
  item: MediaItem;
  variant?: PosterVariant;
  className?: string;
  priority?: boolean;
  srcOverride?: string;
  onImageLoad?: (image: HTMLImageElement) => void;
}

export function PosterImage({
  item,
  variant = "browse",
  className = "",
  priority = false,
  srcOverride,
  onImageLoad,
}: PosterImageProps) {
  const { tier, reportSlowImageLoad } = usePosterQuality();
  const rawUrl = srcOverride ?? rawPosterUrlFor(item, variant);
  const [failed, setFailed] = useState(false);
  const [srcIndex, setSrcIndex] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [upgradedSrc, setUpgradedSrc] = useState<string | undefined>();
  const loadStartedAt = useRef<number | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const reportedLoadFor = useRef<string | null>(null);

  // Browse non-priority: parte in low-res e fa upgrade al tier di contesto
  // (meno byte al primo paint, stessa qualita' finale).
  const paintTier: PosterQualityTier =
    variant === "browse" && !priority ? "low" : tier;

  const candidates = useMemo(
    () => (rawUrl ? posterUrlFallbacks(rawUrl, paintTier) : []),
    [rawUrl, paintTier],
  );

  const upgradeUrl = useMemo(() => {
    if (!rawUrl) return undefined;
    const nextTier: PosterQualityTier | undefined =
      paintTier !== tier ? tier : tier === "high" ? undefined : "high";
    if (!nextTier) return undefined;
    const next =
      variant === "hero"
        ? adaptHeroUrl(rawUrl, nextTier)
        : adaptPosterUrl(rawUrl, nextTier);
    const current =
      variant === "hero"
        ? adaptHeroUrl(rawUrl, paintTier)
        : adaptPosterUrl(rawUrl, paintTier);
    return next && next !== current ? next : undefined;
  }, [rawUrl, paintTier, tier, variant]);

  const activeSrc = upgradedSrc ?? candidates[srcIndex];
  // Le card della griglia (browse) caricano in lazy: lo scroll non scatena piu'
  // una raffica di decodifiche simultanee. Hero/continue/priority restano eager.
  const eager =
    priority || variant === "hero" || variant === "continue";

  const handleImageReady = useCallback(
    (image: HTMLImageElement) => {
      const src = image.currentSrc || image.src;
      if (!src || reportedLoadFor.current === src) return;
      reportedLoadFor.current = src;

      setLoaded(true);

      const startedAt = loadStartedAt.current;
      if (startedAt) {
        reportSlowImageLoad(Date.now() - startedAt);
      }
      onImageLoad?.(image);
    },
    [onImageLoad, reportSlowImageLoad],
  );

  useEffect(() => {
    setSrcIndex(0);
    setFailed(false);
    setUpgradedSrc(undefined);
    reportedLoadFor.current = null;
  }, [rawUrl, paintTier]);

  useEffect(() => {
    loadStartedAt.current = activeSrc ? Date.now() : null;
    reportedLoadFor.current = null;
    // Upgrade di qualita': l'URL e' gia' in cache (preload), niente shimmer.
    if (upgradedSrc && activeSrc === upgradedSrc) {
      setLoaded(true);
      return;
    }
    setLoaded(false);
  }, [activeSrc, upgradedSrc]);

  useEffect(() => {
    const img = imgRef.current;
    if (!img || !activeSrc) return;
    if (img.complete && img.naturalWidth > 0) {
      handleImageReady(img);
    }
  }, [activeSrc, handleImageReady]);

  useEffect(() => {
    if (!upgradeUrl || !activeSrc || upgradeUrl === activeSrc) return;

    let cancelled = false;
    const img = new Image();
    img.decoding = "async";
    img.onload = () => {
      if (!cancelled) setUpgradedSrc(upgradeUrl);
    };
    img.src = upgradeUrl;

    return () => {
      cancelled = true;
    };
  }, [upgradeUrl, activeSrc]);

  const fitClass =
    variant === "browse"
      ? "object-contain object-center"
      : "object-cover object-center";

  // Nessun URL: shimmer (come hero), non un riquadro vuoto.
  if (!activeSrc) {
    return (
      <div
        className={`absolute inset-0 shimmer ${className}`}
        aria-busy="true"
        aria-label="Caricamento poster"
      />
    );
  }

  if (failed) {
    return (
      <div
        className={`absolute inset-0 bg-gradient-to-br ${item.gradient} ${className}`}
      />
    );
  }

  return (
    <div className="absolute inset-0" aria-busy={!loaded || undefined}>
      {!loaded && (
        <div className="absolute inset-0 shimmer" aria-hidden />
      )}
      <img
        ref={imgRef}
        src={activeSrc}
        alt={item.title}
        loading={eager ? "eager" : "lazy"}
        decoding="async"
        fetchPriority={priority || variant === "hero" ? "high" : "auto"}
        onError={() => {
          if (srcIndex + 1 < candidates.length) {
            setSrcIndex((index) => index + 1);
            loadStartedAt.current = Date.now();
            return;
          }
          setFailed(true);
        }}
        onLoad={(event) => handleImageReady(event.currentTarget)}
        style={{
          opacity: loaded ? 1 : 0,
          transition: "opacity 0.35s ease",
        }}
        className={`absolute inset-0 h-full w-full ${fitClass} ${className}`}
      />
    </div>
  );
}

export const mediaTypeOptions = [
  {
    id: "film" as const,
    label: "Film",
    description: "Un film singolo",
    icon: Film,
  },
  {
    id: "cartone" as const,
    label: "Cartone",
    description: "Animazione o cartone",
    icon: Sparkles,
  },
  {
    id: "serie" as const,
    label: "Serie TV",
    description: "Episodio di una serie",
    icon: Tv,
  },
];
