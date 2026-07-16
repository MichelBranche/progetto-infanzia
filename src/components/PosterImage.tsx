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

  const candidates = useMemo(
    () => (rawUrl ? posterUrlFallbacks(rawUrl, tier) : []),
    [rawUrl, tier],
  );

  const upgradeUrl = useMemo(() => {
    if (!rawUrl || tier === "low") return undefined;
    const high =
      variant === "hero"
        ? adaptHeroUrl(rawUrl, "high")
        : adaptPosterUrl(rawUrl, "high");
    const current =
      variant === "hero"
        ? adaptHeroUrl(rawUrl, tier)
        : adaptPosterUrl(rawUrl, tier);
    return high && high !== current ? high : undefined;
  }, [rawUrl, tier, variant]);

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
  }, [rawUrl, tier]);

  useEffect(() => {
    loadStartedAt.current = activeSrc ? Date.now() : null;
    reportedLoadFor.current = null;
    setLoaded(false);
  }, [activeSrc]);

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

  if (!activeSrc || failed) {
    return (
      <div
        className={`absolute inset-0 bg-gradient-to-br ${item.gradient} ${className}`}
      />
    );
  }

  return (
    <img
      ref={imgRef}
      key={activeSrc}
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
      style={
        eager
          ? undefined
          : { opacity: loaded ? 1 : 0, transition: "opacity 0.4s ease" }
      }
      className={`absolute inset-0 h-full w-full ${fitClass} ${className}`}
    />
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
