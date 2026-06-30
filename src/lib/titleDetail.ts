import {
  compareEpisodes,
  episodeCodeLabel,
  episodeDisplayTitle,
  getSeriesEpisodes,
  getSeriesPlayTarget,
  isWatchInProgress,
  parseSeriesKey,
  type SeriesRef,
} from "./browse";
import { posterUrlFor } from "../components/PosterImage";
import type { MediaItem } from "../types/media";
import {
  formatDuration,
  mediaTypeLabel,
  watchProgressPercent,
} from "../types/media";
import type { StremioMeta, StremioVideo } from "../types/stremio";

export interface TitleDetailEpisode {
  id: string;
  title: string;
  code?: string;
  thumbnail?: string;
  /** Genera miniatura da un frame del video (senza copertina dedicata). */
  useVideoFrame?: boolean;
  durationHintSec?: number;
  description?: string;
  runtime?: string;
  season?: number;
  episode?: number;
  progressPercent?: number;
}

export interface TitleDetailModel {
  id: string;
  name: string;
  typeLabel: string;
  isSeries: boolean;
  heroImage?: string;
  logo?: string;
  year?: string;
  runtime?: string;
  views?: string;
  quality?: string;
  rating?: string;
  castLine?: string;
  genreLine?: string;
  directorsLine?: string;
  description?: string;
  episodes: TitleDetailEpisode[];
  primaryEpisodeId?: string;
  playLabel?: string;
  hasPreview?: boolean;
}

function extractYear(releaseInfo?: string) {
  if (!releaseInfo) return undefined;
  return releaseInfo.match(/\d{4}/)?.[0];
}

function parseDurationHint(runtime?: string): number | undefined {
  if (!runtime) return undefined;
  const mins = runtime.match(/(\d+)\s*min/i);
  if (mins) return Number.parseInt(mins[1], 10) * 60;
  const secs = runtime.match(/(\d+)\s*s(ec)?/i);
  if (secs) return Number.parseInt(secs[1], 10);
  return undefined;
}

function formatViews(count?: number) {
  if (count == null || count <= 0) return undefined;
  if (count >= 1_000_000) {
    return `${(count / 1_000_000).toFixed(1).replace(".0", "")}M views`;
  }
  if (count >= 1000) {
    return `${Math.round(count / 1000)}K views`;
  }
  return `${count} views`;
}

function stremioEpisodeCode(video: StremioVideo) {
  if (video.season != null && video.episode != null) {
    return `S${video.season} · E${video.episode}`;
  }
  if (video.episode != null) {
    return `Episodio ${video.episode}`;
  }
  return undefined;
}

function inferSeasonFromLabel(code?: string, title?: string): number | null {
  for (const src of [code, title]) {
    if (!src) continue;
    const seasonWord = src.match(/\bstagione\s*0*(\d{1,3})\b/i);
    if (seasonWord) return Number.parseInt(seasonWord[1], 10);
    const sx = src.match(/\bS\s*0*(\d{1,3})\s*(?:[·xE]|$)/i);
    if (sx) return Number.parseInt(sx[1], 10);
  }
  return null;
}

/** Ricava la stagione da campi espliciti o da etichette tipo S2 · E5 / Stagione 2. */
export function inferEpisodeSeason(episode: TitleDetailEpisode): number {
  if (episode.season != null) return episode.season;
  return inferSeasonFromLabel(episode.code, episode.title) ?? 1;
}

export function seasonsFromEpisodes(
  episodes: TitleDetailEpisode[],
  seasonNumbers?: number[],
): number[] {
  if (seasonNumbers && seasonNumbers.length > 0) {
    return [...seasonNumbers].sort((a, b) => a - b);
  }
  const nums = [
    ...new Set(episodes.map((ep) => inferEpisodeSeason(ep))),
  ].sort((a, b) => a - b);
  return nums.length > 0 ? nums : [1];
}

export function episodesForSeason(
  episodes: TitleDetailEpisode[],
  season: number,
): TitleDetailEpisode[] {
  return episodes.filter((ep) => inferEpisodeSeason(ep) === season);
}

function mediaEpisodeCode(item: MediaItem) {
  return episodeCodeLabel(item) ?? undefined;
}

function mediaRuntimeLabel(item: MediaItem) {
  if (item.watchDuration) return formatDuration(item.watchDuration) ?? undefined;
  if (item.runtimeMins) return `${item.runtimeMins} min`;
  return undefined;
}

export interface TitleDetailEpisodeProgress {
  watchPosition: number;
  watchDuration?: number;
}

function episodeProgressPercent(progress?: TitleDetailEpisodeProgress) {
  if (!progress || progress.watchPosition <= 0) return undefined;
  return watchProgressPercent({
    watchPosition: progress.watchPosition,
    watchDuration: progress.watchDuration,
  } as MediaItem);
}

export function stremioVideosToDetailEpisodes(
  meta: StremioMeta,
  videos: StremioMeta["videos"],
  progressByVideoId?: Record<string, TitleDetailEpisodeProgress>,
): TitleDetailEpisode[] {
  const isSeries = meta.type === "series" || meta.type === "channel";
  return sortedEpisodes(
    videos.map((video, index) => {
      const genericThumb =
        !video.thumbnail || video.thumbnail === meta.poster;
      return {
        id: video.id,
        title: isSeries
          ? video.title?.trim() ||
            (video.episode != null
              ? `Episodio ${video.episode}`
              : `Episodio ${index + 1}`)
          : video.title || meta.name,
        code:
          stremioEpisodeCode(video) ?? `Episodio ${video.episode ?? index + 1}`,
        thumbnail: genericThumb ? undefined : video.thumbnail,
        useVideoFrame: genericThumb,
        durationHintSec: parseDurationHint(meta.runtime),
        description: video.description,
        runtime: video.runtime,
        season: video.season,
        episode: video.episode,
        progressPercent: episodeProgressPercent(progressByVideoId?.[video.id]),
      };
    }),
  );
}

export function titleDetailFromStremio(
  meta: StremioMeta,
  progressByVideoId?: Record<string, TitleDetailEpisodeProgress>,
): TitleDetailModel {
  const isSeries = meta.type === "series" || meta.type === "channel";
  const primaryVideo = meta.videos[0];

  return {
    id: meta.id,
    name: meta.name,
    typeLabel: isSeries ? "Serie TV" : "Film",
    isSeries,
    heroImage: meta.background ?? meta.poster,
    logo: meta.logo,
    year: extractYear(meta.releaseInfo),
    runtime: meta.runtime,
    views: formatViews(meta.viewCount),
    quality: meta.quality,
    rating: meta.rating,
    castLine: meta.cast?.slice(0, 4).join(", "),
    genreLine: meta.genres.join(", ") || undefined,
    directorsLine: meta.directors?.join(", "),
    description: meta.description?.trim(),
    episodes: stremioVideosToDetailEpisodes(meta, meta.videos, progressByVideoId),
    primaryEpisodeId: primaryVideo?.id,
    playLabel: "Riproduci",
    hasPreview: meta.hasPreview,
  };
}

export function titleDetailFromMediaItem(
  item: MediaItem,
  episodes: MediaItem[] = [],
): TitleDetailModel {
  const isSeries =
    episodes.length > 1 ||
    Boolean(item.seriesTitle && item.mediaType !== "film");
  const playTarget = isSeries
    ? getSeriesPlayTarget(episodes) ?? episodes[0]
    : item;
  const heroItem = isSeries
    ? {
        ...item,
        title: item.seriesTitle ?? item.title,
        season: undefined,
        episode: undefined,
      }
    : item;

  const resumeTarget = isSeries
    ? episodes.find((ep) => isWatchInProgress(ep))
    : isWatchInProgress(item)
      ? item
      : undefined;

  return {
    id: isSeries ? (item.seriesTitle ?? item.id) : item.id,
    name: isSeries ? (item.seriesTitle ?? item.title) : item.title,
    typeLabel: mediaTypeLabel(item.mediaType),
    isSeries,
    heroImage: posterUrlFor(heroItem, "browse"),
    year: playTarget?.year ? String(playTarget.year) : undefined,
    runtime: playTarget ? mediaRuntimeLabel(playTarget) : mediaRuntimeLabel(item),
    genreLine: item.genres?.join(", "),
    description:
      playTarget?.description?.trim() ||
      item.description?.trim() ||
      episodes[0]?.description?.trim(),
    episodes: sortedEpisodes(
      (isSeries ? episodes : [item]).map((ep, index) => ({
        id: ep.id,
        title: isSeries ? episodeDisplayTitle(ep) : ep.title,
        code: isSeries
          ? mediaEpisodeCode(ep) ?? `Episodio ${index + 1}`
          : mediaTypeLabel(ep.mediaType),
        thumbnail: ep.posterUrl ? posterUrlFor(ep, isSeries ? "episode" : "browse") : undefined,
        useVideoFrame: isSeries && !ep.posterUrl,
        durationHintSec:
          ep.watchDuration ??
          (ep.runtimeMins ? ep.runtimeMins * 60 : undefined),
        description: ep.description,
        runtime: mediaRuntimeLabel(ep),
        season: ep.season,
        episode: ep.episode,
        progressPercent: watchProgressPercent(ep),
      })),
    ),
    primaryEpisodeId: resumeTarget?.id ?? playTarget?.id ?? item.id,
    playLabel: resumeTarget ? "Riprendi" : "Riproduci",
  };
}

export function titleDetailFromSeriesKey(
  seriesKey: string,
  items: MediaItem[],
): TitleDetailModel | null {
  const series = parseSeriesKey(seriesKey);
  if (!series) return null;

  const episodes = getSeriesEpisodes(items, series);
  if (episodes.length === 0) return null;

  const representative = episodes[0];
  const detail = titleDetailFromMediaItem(
    {
      ...representative,
      seriesTitle: series.seriesTitle,
      mediaType: series.mediaType,
    },
    episodes,
  );

  return {
    ...detail,
    id: seriesKey,
    name: series.seriesTitle,
    typeLabel: mediaTypeLabel(series.mediaType),
  };
}

export function localEpisodesForMedia(
  item: MediaItem,
  libraryItems: MediaItem[],
): MediaItem[] {
  if (!item.seriesTitle?.trim()) {
    return [item];
  }

  const series: SeriesRef = {
    mediaType: item.mediaType,
    seriesTitle: item.seriesTitle,
  };
  const episodes = getSeriesEpisodes(libraryItems, series);
  return episodes.length > 0 ? episodes : [item];
}

export function sortedEpisodes(episodes: TitleDetailEpisode[]) {
  return [...episodes].sort((a, b) => {
    if (a.season != null && b.season != null && a.season !== b.season) {
      return a.season - b.season;
    }
    if (a.episode != null && b.episode != null && a.episode !== b.episode) {
      return a.episode - b.episode;
    }
    return a.title.localeCompare(b.title, "it");
  });
}

export function compareMediaEpisodes(a: MediaItem, b: MediaItem) {
  return compareEpisodes(a, b);
}
