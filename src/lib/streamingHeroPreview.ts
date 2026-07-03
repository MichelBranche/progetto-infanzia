import type { MediaItem } from "../types/media";
import type { StremioMeta, StremioVideo } from "../types/stremio";
import {
  fetchLoonexMeta,
  fetchSaturnMeta,
  fetchScMeta,
  fetchScSeasonEpisodes,
  resolveLoonexStream,
  resolveSaturnStream,
  resolveScPreview,
  resolveScStream,
} from "./addonsApi";
import { previewStartTime } from "./preview";
import type { StremioMetaPreview } from "../types/stremio";
import type { AddonWatchTarget } from "./streamingBrowse";

export interface StreamingPreviewClip {
  url: string;
  isHls: boolean;
  startTimeSec: number;
}

const DEFAULT_EPISODE_DURATION_SEC = 24 * 60;
const DEFAULT_MOVIE_DURATION_SEC = 100 * 60;

function pickRandom<T>(items: T[]): T | undefined {
  if (items.length === 0) return undefined;
  return items[Math.floor(Math.random() * items.length)];
}

function runtimeToSecs(runtime?: string | null): number | undefined {
  if (!runtime) return undefined;
  const minMatch = runtime.match(/(\d+)\s*min/i);
  if (minMatch) return Number(minMatch[1]) * 60;
  const n = Number(runtime);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

function clipStartTime(
  durationSec: number | undefined,
  previewDurationSec: number,
): number {
  const duration =
    durationSec && durationSec > 0
      ? durationSec
      : DEFAULT_EPISODE_DURATION_SEC;
  const stub: Pick<MediaItem, "watchDuration"> = { watchDuration: duration };
  return previewStartTime(stub as MediaItem, previewDurationSec, duration);
}

async function scEpisodeVideos(
  meta: StremioMeta,
  slug: string,
): Promise<StremioVideo[]> {
  if (meta.videos.length > 0) return meta.videos;
  const season = meta.seasonNumbers?.[0] ?? 1;
  try {
    const episodes = await fetchScSeasonEpisodes(meta.id, slug, season);
    return episodes.length > 0 ? episodes : meta.videos;
  } catch {
    return meta.videos;
  }
}

async function resolveScClip(
  titleId: string,
  slug: string,
  maxDurationSec: number,
): Promise<StreamingPreviewClip | null> {
  const trailer = await resolveScPreview(titleId, slug).catch(() => null);
  if (trailer) {
    return { url: trailer.url, isHls: trailer.isHls, startTimeSec: 0 };
  }

  const meta = await fetchScMeta(titleId, slug);
  const videos =
    meta.type === "movie" ? meta.videos : await scEpisodeVideos(meta, slug);
  const video = pickRandom(videos);
  if (meta.type !== "movie" && !video) return null;

  const stream = await resolveScStream(
    titleId,
    slug,
    meta.type === "movie" ? undefined : video?.id,
  );
  const duration =
    runtimeToSecs(video?.runtime) ??
    (meta.type === "movie"
      ? DEFAULT_MOVIE_DURATION_SEC
      : DEFAULT_EPISODE_DURATION_SEC);

  return {
    url: stream.url,
    isHls: stream.isHls,
    startTimeSec: clipStartTime(duration, maxDurationSec),
  };
}

async function resolveLoonexClip(
  slug: string,
  maxDurationSec: number,
): Promise<StreamingPreviewClip | null> {
  const meta = await fetchLoonexMeta(slug);
  const video = pickRandom(meta.videos);
  if (!video) return null;

  const stream = await resolveLoonexStream(slug, video.id);
  const duration = runtimeToSecs(video.runtime) ?? DEFAULT_EPISODE_DURATION_SEC;
  return {
    url: stream.url,
    isHls: stream.isHls,
    startTimeSec: clipStartTime(duration, maxDurationSec),
  };
}

async function resolveSaturnClip(
  slug: string,
  maxDurationSec: number,
): Promise<StreamingPreviewClip | null> {
  const meta = await fetchSaturnMeta(slug);
  const video = pickRandom(meta.videos);
  if (!video) return null;

  const stream = await resolveSaturnStream(slug, video.id);
  const duration = runtimeToSecs(video.runtime) ?? DEFAULT_EPISODE_DURATION_SEC;
  return {
    url: stream.url,
    isHls: stream.isHls,
    startTimeSec: clipStartTime(duration, maxDurationSec),
  };
}

export function supportsStreamingPreview(
  target: AddonWatchTarget | null,
): boolean {
  if (!target?.slug) return false;
  const prefix = target.catalogPrefix;
  return prefix === "sc" || prefix === "loonex" || prefix === "saturn";
}

export function previewToStreamingTarget(
  preview: StremioMetaPreview,
): AddonWatchTarget | null {
  const slug = preview.slug?.trim();
  if (!slug) return null;
  const prefix = preview.catalogPrefix;
  if (prefix === "sc") {
    return {
      contentType: preview.type,
      metaId: preview.id,
      slug,
      catalogPrefix: "sc",
    };
  }
  if (prefix === "loonex" || prefix === "saturn") {
    return {
      contentType: preview.type,
      metaId: slug,
      slug,
      catalogPrefix: prefix,
    };
  }
  return null;
}

export function supportsStreamingPreviewForItem(
  preview: StremioMetaPreview,
): boolean {
  return supportsStreamingPreview(previewToStreamingTarget(preview));
}

export async function resolveStreamingPreview(
  target: AddonWatchTarget,
  maxDurationSec: number,
): Promise<StreamingPreviewClip | null> {
  const slug = target.slug;
  if (!slug) return null;

  switch (target.catalogPrefix) {
    case "sc":
      return resolveScClip(target.metaId, slug, maxDurationSec);
    case "loonex":
      return resolveLoonexClip(slug, maxDurationSec);
    case "saturn":
      return resolveSaturnClip(slug, maxDurationSec);
    default:
      return null;
  }
}
