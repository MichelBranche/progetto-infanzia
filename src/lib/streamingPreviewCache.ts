import { resolveScPreview } from "./addonsApi";

export interface ScPreviewStream {
  url: string;
  isHls: boolean;
}

const cache = new Map<string, Promise<ScPreviewStream | null>>();

function cacheKey(titleId: string, slug: string) {
  return `${titleId}:${slug}`;
}

export function getCachedScPreview(
  titleId: string,
  slug: string,
): Promise<ScPreviewStream | null> {
  const key = cacheKey(titleId, slug);
  let pending = cache.get(key);
  if (!pending) {
    pending = resolveScPreview(titleId, slug)
      .then((stream) =>
        stream
          ? { url: stream.url, isHls: stream.isHls }
          : null,
      )
      .catch(() => null);
    cache.set(key, pending);
  }
  return pending;
}

export function prefetchScPreview(titleId: string, slug: string) {
  void getCachedScPreview(titleId, slug).then((result) => {
    if (!result) cache.delete(cacheKey(titleId, slug));
  });
}
