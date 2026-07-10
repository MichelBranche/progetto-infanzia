import { Film, Sparkles, Tv } from "lucide-react";
import { useState } from "react";
import type { MediaItem } from "../types/media";
import { maximizeHeroUrl, maximizePosterUrl } from "../lib/posterUrl";

export type PosterVariant = "browse" | "continue" | "episode" | "hero";

export function posterUrlFor(
  item: MediaItem,
  variant: PosterVariant = "browse",
): string | undefined {
  let url: string | undefined;
  if (variant === "hero") {
    url = item.backgroundUrl ?? item.seriesPosterUrl ?? item.posterUrl;
  } else if (variant === "continue") {
    url = item.backgroundUrl ?? item.posterUrl ?? item.seriesPosterUrl;
  } else if (variant === "episode") {
    url = item.posterUrl ?? item.seriesPosterUrl;
  } else if (item.seriesPosterUrl) {
    url = item.seriesPosterUrl;
  } else {
    url = item.posterUrl;
  }
  return variant === "hero"
    ? maximizeHeroUrl(url)
    : maximizePosterUrl(url);
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
  const posterUrl = srcOverride
    ? variant === "hero"
      ? maximizeHeroUrl(srcOverride)
      : maximizePosterUrl(srcOverride)
    : posterUrlFor(item, variant);
  const [failed, setFailed] = useState(false);
  const fitClass =
    variant === "browse"
      ? "object-contain object-center"
      : "object-cover object-center";

  if (!posterUrl || failed) {
    return (
      <div
        className={`absolute inset-0 bg-gradient-to-br ${item.gradient} ${className}`}
      />
    );
  }

  return (
    <img
      src={posterUrl}
      alt={item.title}
      loading={priority || variant === "hero" ? "eager" : "lazy"}
      decoding="async"
      fetchPriority={priority || variant === "hero" ? "high" : undefined}
      onError={() => setFailed(true)}
      onLoad={(event) => onImageLoad?.(event.currentTarget)}
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
