import type {
  StreamingContinueItem,
  StreamingWatchProgressInput,
} from "../types/stremio";

export function streamingProgressKey(
  input: Pick<
    StreamingWatchProgressInput,
    "catalogPrefix" | "contentType" | "titleId" | "slug" | "videoId"
  >,
): string {
  return [
    input.catalogPrefix.trim(),
    input.contentType.trim(),
    input.titleId.trim(),
    input.slug.trim(),
    input.videoId.trim(),
  ].join(":");
}

export function continueItemKey(item: StreamingContinueItem): string {
  return streamingProgressKey(item);
}

export function continueSeriesKey(item: StreamingContinueItem): string {
  return [
    item.catalogPrefix,
    item.contentType,
    item.titleId,
    item.slug,
  ].join(":");
}

export function isIncompleteStreamingWatch(item: StreamingContinueItem): boolean {
  if (item.positionSecs <= 5) return false;
  const duration = item.durationSecs;
  if (!duration || duration <= 0) return true;
  return item.positionSecs / duration < 0.92;
}

export function continueItemToInput(
  item: StreamingContinueItem,
): StreamingWatchProgressInput {
  return {
    catalogPrefix: item.catalogPrefix,
    contentType: item.contentType,
    titleId: item.titleId,
    slug: item.slug,
    videoId: item.videoId,
    titleName: item.titleName,
    episodeLabel: item.episodeLabel,
    poster: item.poster,
    positionSecs: item.positionSecs,
    durationSecs: item.durationSecs,
  };
}

export function mergeStreamingContinue(
  local: StreamingContinueItem[],
  cloud: StreamingContinueItem[],
  limit: number,
): StreamingContinueItem[] {
  const byKey = new Map<string, StreamingContinueItem>();

  for (const item of [...local, ...cloud]) {
    if (!isIncompleteStreamingWatch(item)) continue;
    const key = continueItemKey(item);
    const existing = byKey.get(key);
    if (
      !existing ||
      Date.parse(item.updatedAt) > Date.parse(existing.updatedAt)
    ) {
      byKey.set(key, item);
    }
  }

  const sorted = [...byKey.values()].sort(
    (a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt),
  );

  const seenSeries = new Set<string>();
  const result: StreamingContinueItem[] = [];
  for (const item of sorted) {
    const series = continueSeriesKey(item);
    if (seenSeries.has(series)) continue;
    seenSeries.add(series);
    result.push(item);
    if (result.length >= limit) break;
  }

  return result;
}
