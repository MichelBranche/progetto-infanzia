import type { TitleDetailEpisode } from "../lib/titleDetail";
import { useEpisodeFrameThumbnail } from "../hooks/useEpisodeFrameThumbnail";
import { CoverImage } from "./CoverImage";
import { LoadingSpinner } from "./LoadingSpinner";

interface EpisodeThumbnailProps {
  episode: TitleDetailEpisode;
  index: number;
  resolveEpisodeStream?: (
    episodeId: string,
  ) => Promise<{ url: string; isHls: boolean } | null>;
}

export function EpisodeThumbnail({
  episode,
  index,
  resolveEpisodeStream,
}: EpisodeThumbnailProps) {
  const needsFrame = episode.useVideoFrame && Boolean(resolveEpisodeStream);
  const { thumbnail: frameThumb, loading, rootRef } = useEpisodeFrameThumbnail({
    enabled: Boolean(needsFrame),
    cacheKey: `ep:${episode.id}`,
    seed: episode.id,
    durationHintSec: episode.durationHintSec,
    resolveStream: needsFrame
      ? () => resolveEpisodeStream!(episode.id)
      : undefined,
  });

  const src = frameThumb ?? (needsFrame ? null : episode.thumbnail);

  return (
    <div ref={rootRef} className="relative h-full w-full">
      {src ? (
        <CoverImage
          src={src}
          alt=""
          className="h-full w-full"
          loading="eager"
          spinnerSize="xs"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-indigo-950 to-violet-950">
          {loading ? (
            <LoadingSpinner size="sm" />
          ) : (
            <span className="text-2xl font-semibold text-white/30">
              {episode.episode ?? index + 1}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
