import type { MediaItem } from "../types/media";
import type { StremioMetaPreview } from "../types/stremio";
import {
  previewToMediaItem,
  streamingPreviewDisplayName,
} from "./streamingBrowse";

export interface SeriesRef {
  mediaType: string;
  seriesTitle: string;
}

export type BrowseItem =
  | { kind: "media"; item: MediaItem }
  | {
      kind: "series";
      series: SeriesRef;
      title: string;
      episodeCount: number;
      representative: MediaItem;
    }
  | { kind: "streaming"; preview: StremioMetaPreview };

export function seriesKey(mediaType: string, seriesTitle: string) {
  return `${mediaType}::${seriesTitle}`;
}

export function parseSeriesKey(key: string): SeriesRef | null {
  const idx = key.indexOf("::");
  if (idx === -1) return null;
  return {
    mediaType: key.slice(0, idx),
    seriesTitle: key.slice(idx + 2),
  };
}

export function isEpisodicSeriesItem(item: MediaItem) {
  return (
    (item.mediaType === "serie" || item.mediaType === "cartone") &&
    Boolean(item.seriesTitle?.trim())
  );
}

export function toBrowseItems(items: MediaItem[]): BrowseItem[] {
  const seriesMap = new Map<string, MediaItem[]>();
  const result: BrowseItem[] = [];

  for (const item of items) {
    if (isEpisodicSeriesItem(item) && item.seriesTitle) {
      const key = seriesKey(item.mediaType, item.seriesTitle);
      const group = seriesMap.get(key) ?? [];
      group.push(item);
      seriesMap.set(key, group);
    } else {
      result.push({ kind: "media", item });
    }
  }

  for (const [key, episodes] of seriesMap) {
    const ref = parseSeriesKey(key);
    if (!ref) continue;
    result.push({
      kind: "series",
      series: ref,
      title: ref.seriesTitle,
      episodeCount: episodes.length,
      representative: pickSeriesRepresentative(episodes),
    });
  }

  return result.sort((a, b) => {
    const titleA = browseItemTitle(a);
    const titleB = browseItemTitle(b);
    return titleA.localeCompare(titleB, "it", { sensitivity: "base" });
  });
}

export function isWatchInProgress(item: MediaItem): boolean {
  const pos = item.watchPosition ?? 0;
  const dur = item.watchDuration ?? 0;
  if (pos <= 5) return false;
  if (dur <= 0) return true;
  return pos / dur < 0.92;
}

export function isWatchCompleted(item: MediaItem): boolean {
  const pos = item.watchPosition ?? 0;
  const dur = item.watchDuration ?? 0;
  return dur > 0 && (pos <= 5 || pos / dur >= 0.92);
}

export function getSeriesResumeEpisode(
  episodes: MediaItem[],
): MediaItem | undefined {
  const sorted = [...episodes].sort(compareEpisodes);
  const inProgress = sorted.find(isWatchInProgress);
  if (inProgress) return inProgress;
  return sorted.find((ep) => !isWatchCompleted(ep));
}

export function getSeriesPlayTarget(episodes: MediaItem[]): MediaItem | undefined {
  const sorted = [...episodes].sort(compareEpisodes);
  return getSeriesResumeEpisode(sorted) ?? sorted[0];
}

function pickSeriesRepresentative(episodes: MediaItem[]) {
  return getSeriesPlayTarget(episodes) ?? [...episodes].sort(compareEpisodes)[0];
}

export function getSeriesEpisodes(
  items: MediaItem[],
  series: SeriesRef,
): MediaItem[] {
  const normalizedTitle = series.seriesTitle.trim().toLowerCase();

  return items
    .filter(
      (item) =>
        item.mediaType === series.mediaType &&
        item.seriesTitle?.trim().toLowerCase() === normalizedTitle,
    )
    .sort(compareEpisodes);
}

function parseSxE(text: string): { season?: number; episode?: number } {
  const match = text.match(/s(\d{1,3})e(\d{1,3})/i);
  if (!match) return {};
  return {
    season: Number.parseInt(match[1], 10),
    episode: Number.parseInt(match[2], 10),
  };
}

function parseEpisodeFromPath(text: string): { season?: number; episode?: number } {
  const seasonMatch = text.match(/(?:season|stagione)\s*(\d{1,3})/i);
  const epMatch = text.match(
    /(?:^|[\s._-])e(?:p(?:isode)?)?\s*(\d{1,3})(?:[\s._-]|$)/i,
  );

  return {
    season: seasonMatch ? Number.parseInt(seasonMatch[1], 10) : undefined,
    episode: epMatch ? Number.parseInt(epMatch[1], 10) : undefined,
  };
}

export function effectiveSeasonEpisode(item: MediaItem): {
  season: number;
  episode: number;
} {
  const combined = `${item.filePath} ${item.fileName} ${item.title}`;
  const fromSxE = parseSxE(combined);
  const fromPath = parseEpisodeFromPath(combined);

  const season = item.season ?? fromSxE.season ?? fromPath.season;
  const episode = item.episode ?? fromSxE.episode ?? fromPath.episode;

  return {
    season: season ?? Number.MAX_SAFE_INTEGER,
    episode: episode ?? Number.MAX_SAFE_INTEGER,
  };
}

export function episodeCodeLabel(item: MediaItem): string | null {
  if (item.season != null && item.episode != null) {
    return `S${String(item.season).padStart(2, "0")}E${String(item.episode).padStart(2, "0")}`;
  }
  const match = `${item.fileName} ${item.filePath}`.match(/s(\d{1,2})e(\d{1,2})/i);
  if (match) {
    return `S${match[1].padStart(2, "0")}E${match[2].padStart(2, "0")}`;
  }
  if (item.episode != null) return `Ep. ${item.episode}`;
  return null;
}

function stripEpisodeCodePrefix(text: string): string {
  return text
    .replace(/^\s*s\d{1,2}e\d{1,2}\s*[-–:._]+\s*/i, "")
    .replace(/^\s*e(?:p(?:isode)?)?\s*\d{1,3}\s*[-–:._]+\s*/i, "")
    .trim();
}

function titleFromFileName(fileName: string): string {
  const stem = fileName.replace(/\.[^.]+$/, "").replace(/[._-]+/g, " ");
  return stripEpisodeCodePrefix(stem);
}

/** Titolo episodio senza prefisso serie/stagione (anche per voci importate in passato). */
export function episodeDisplayTitle(item: MediaItem): string {
  const title = item.title.trim();
  const series = item.seriesTitle?.trim();

  let name = title;
  if (series) {
    const escaped = series.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const prefixPattern = new RegExp(
      `^${escaped}\\s*[—–-]\\s*(?:S\\d{1,2}E\\d{1,2}|Stagione\\s+\\d+|Ep\\.?\\s+\\d+)?\\s*(:\\s*)?`,
      "i",
    );
    name = title.replace(prefixPattern, "").trim();
  }

  name = stripEpisodeCodePrefix(name);

  if (!name) {
    const afterCode = title.match(/s\d{1,2}e\d{1,2}\s*[-–:]\s*(.+)$/i);
    if (afterCode?.[1]) name = afterCode[1].trim();
  }

  if (!name || /^s\d{1,2}e\d{1,2}$/i.test(name)) {
    const fromFile = titleFromFileName(item.fileName);
    if (fromFile && !/^s\d{1,2}e\d{1,2}$/i.test(fromFile)) {
      name = fromFile;
    }
  }

  if (!name || /^s\d{1,2}e\d{1,2}$/i.test(name)) {
    return titleFromFileName(item.fileName) || title || "Episodio";
  }

  return name;
}

export function compareEpisodes(a: MediaItem, b: MediaItem) {
  const aKey = effectiveSeasonEpisode(a);
  const bKey = effectiveSeasonEpisode(b);

  if (aKey.season !== bKey.season) return aKey.season - bKey.season;
  if (aKey.episode !== bKey.episode) return aKey.episode - bKey.episode;

  return a.filePath.localeCompare(b.filePath, undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

export function nextEpisode(
  episodes: MediaItem[],
  currentId: string,
): MediaItem | undefined {
  const idx = episodes.findIndex((ep) => ep.id === currentId);
  if (idx === -1 || idx >= episodes.length - 1) return undefined;
  return episodes[idx + 1];
}

export function prevEpisode(
  episodes: MediaItem[],
  currentId: string,
): MediaItem | undefined {
  const idx = episodes.findIndex((ep) => ep.id === currentId);
  if (idx <= 0) return undefined;
  return episodes[idx - 1];
}

export function browseItemId(item: BrowseItem) {
  if (item.kind === "series") {
    return `series-${seriesKey(item.series.mediaType, item.series.seriesTitle)}`;
  }
  if (item.kind === "streaming") {
    return `streaming-${item.preview.type}-${item.preview.id}`;
  }
  return item.item.id;
}

export function browseItemTitle(item: BrowseItem) {
  if (item.kind === "series") return item.title;
  if (item.kind === "streaming") return streamingPreviewDisplayName(item.preview);
  return item.item.title;
}

export function browseItemMedia(item: BrowseItem): MediaItem {
  if (item.kind === "media") return item.item;
  if (item.kind === "streaming") return previewToMediaItem(item.preview);
  return {
    ...item.representative,
    title: item.title,
    season: undefined,
    episode: undefined,
    posterUrl: undefined,
  };
}
