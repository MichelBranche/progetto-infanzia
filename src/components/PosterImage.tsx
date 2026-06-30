import { Film, Sparkles, Tv } from "lucide-react";
import { useState } from "react";
import type { MediaItem } from "../types/media";

export type PosterVariant = "browse" | "episode";

export function posterUrlFor(
  item: MediaItem,
  variant: PosterVariant = "browse",
): string | undefined {
  if (variant === "episode") {
    return item.posterUrl ?? item.seriesPosterUrl;
  }
  if (item.seriesPosterUrl) return item.seriesPosterUrl;
  return item.posterUrl;
}

interface PosterImageProps {
  item: MediaItem;
  variant?: PosterVariant;
  className?: string;
  priority?: boolean;
}

export function PosterImage({
  item,
  variant = "browse",
  className = "",
  priority = false,
}: PosterImageProps) {
  const posterUrl = posterUrlFor(item, variant);
  const [failed, setFailed] = useState(false);

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
      loading={priority ? "eager" : "lazy"}
      decoding="async"
      onError={() => setFailed(true)}
      className={`absolute inset-0 h-full w-full object-cover ${className}`}
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
