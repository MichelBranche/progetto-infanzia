import type { AddonWatchTarget } from "./streamingBrowse";
import {
  resolveStreamingPreview,
  type StreamingPreviewClip,
} from "./streamingHeroPreview";

const cache = new Map<string, Promise<StreamingPreviewClip | null>>();

function cacheKey(target: AddonWatchTarget, maxDurationSec: number) {
  return `${target.catalogPrefix ?? "?"}:${target.contentType}:${target.metaId}:${target.slug}:${maxDurationSec}`;
}

export function getCachedStreamingPreview(
  target: AddonWatchTarget,
  maxDurationSec: number,
): Promise<StreamingPreviewClip | null> {
  const key = cacheKey(target, maxDurationSec);
  let pending = cache.get(key);
  if (!pending) {
    pending = resolveStreamingPreview(target, maxDurationSec).catch(() => null);
    cache.set(key, pending);
  }
  return pending;
}

export function prefetchStreamingPreview(
  target: AddonWatchTarget,
  maxDurationSec: number,
) {
  void getCachedStreamingPreview(target, maxDurationSec).then((result) => {
    if (!result) cache.delete(cacheKey(target, maxDurationSec));
  });
}

/** @deprecated Use getCachedStreamingPreview */
export interface ScPreviewStream {
  url: string;
  isHls: boolean;
}

export function getCachedScPreview(
  titleId: string,
  slug: string,
  maxDurationSec = 15,
): Promise<ScPreviewStream | null> {
  return getCachedStreamingPreview(
    {
      contentType: "movie",
      metaId: titleId,
      slug,
      catalogPrefix: "sc",
    },
    maxDurationSec,
  ).then((clip) =>
    clip ? { url: clip.url, isHls: clip.isHls } : null,
  );
}

export function prefetchScPreview(
  titleId: string,
  slug: string,
  maxDurationSec = 15,
) {
  prefetchStreamingPreview(
    {
      contentType: "movie",
      metaId: titleId,
      slug,
      catalogPrefix: "sc",
    },
    maxDurationSec,
  );
}
