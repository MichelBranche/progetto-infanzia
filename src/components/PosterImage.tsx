import { Film, Sparkles, Tv } from "lucide-react";
import type { MediaItem } from "../types/media";
import { CoverImage } from "./CoverImage";

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
}

export function PosterImage({
  item,
  variant = "browse",
  className = "",
}: PosterImageProps) {
  const posterUrl = posterUrlFor(item, variant);

  return (
    <CoverImage
      src={posterUrl}
      alt={item.title}
      className={`absolute inset-0 ${className}`}
      imgClassName="absolute inset-0"
      fallback={
        <div
          className={`absolute inset-0 bg-gradient-to-br ${item.gradient} ${className}`}
        />
      }
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
