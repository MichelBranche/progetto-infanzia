import { fetchStreamInfo } from "./api";

const cache = new Map<string, Promise<string>>();

export function getCachedStreamUrl(
  profileId: string,
  mediaId: string,
): Promise<string> {
  const key = `${profileId}:${mediaId}`;
  let pending = cache.get(key);
  if (!pending) {
    pending = fetchStreamInfo(profileId, mediaId).then((info) => info.url);
    cache.set(key, pending);
  }
  return pending;
}

export function prefetchStreamUrl(profileId: string, mediaId: string) {
  void getCachedStreamUrl(profileId, mediaId).catch(() => {
    cache.delete(`${profileId}:${mediaId}`);
  });
}
