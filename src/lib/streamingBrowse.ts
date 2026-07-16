import type { MediaItem } from "../types/media";
import type { StremioMeta, StremioMetaPreview, StreamingContinueItem, StreamingWatchProgressInput } from "../types/stremio";
import type { BrowseItem } from "./browse";
import { compareEpisodes } from "./browse";
import { decodeHtmlEntities } from "./htmlText";
import { maximizeHeroUrl, maximizePosterUrl, pickBestLogoUrl } from "./posterUrl";

const STREAMING_GRADIENT = "from-indigo-950 via-slate-900 to-violet-950";

function continueCatalogKey(
  item: Pick<StreamingContinueItem, "catalogPrefix" | "contentType" | "titleId" | "slug">,
): string {
  return `${item.catalogPrefix}:${item.contentType}:${item.titleId}:${item.slug ?? ""}`;
}

function previewCatalogKey(preview: StremioMetaPreview): string {
  return `${preview.catalogPrefix ?? "sc"}:${preview.type}:${preview.id}:${preview.slug ?? ""}`;
}

/**
 * Indicizza il catalogo per chiave, mantenendo la prima occorrenza (stessa
 * semantica di `Array.find`) così l'enrichment "Continua" evita scansioni
 * O(continue × catalog).
 */
export function buildContinueCatalogMap(
  catalog: StremioMetaPreview[],
): Map<string, StremioMetaPreview> {
  const map = new Map<string, StremioMetaPreview>();
  for (const entry of catalog) {
    const key = previewCatalogKey(entry);
    if (!map.has(key)) map.set(key, entry);
  }
  return map;
}

export function enrichContinuePreviewWithMap(
  item: StreamingContinueItem,
  catalogMap: Map<string, StremioMetaPreview>,
): StremioMetaPreview {
  const preview = continueToPreview(item);
  const match = catalogMap.get(continueCatalogKey(item));
  if (!match) return preview;

  return {
    ...preview,
    poster:
      preview.poster ??
      maximizePosterUrl(match.poster ?? match.background),
    background:
      preview.background ??
      maximizeHeroUrl(match.background ?? match.poster),
  };
}

export function enrichContinuePreview(
  item: StreamingContinueItem,
  catalog: StremioMetaPreview[] = [],
): StremioMetaPreview {
  return enrichContinuePreviewWithMap(item, buildContinueCatalogMap(catalog));
}

export function streamingBrowseItem(preview: StremioMetaPreview): BrowseItem {
  return { kind: "streaming", preview };
}

export function dedupeStreamingPreviews(
  previews: StremioMetaPreview[],
): StremioMetaPreview[] {
  const seen = new Set<string>();
  const out: StremioMetaPreview[] = [];
  for (const preview of previews) {
    const key = `${preview.catalogPrefix ?? "sc"}:${preview.type}:${preview.id}:${preview.slug ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(preview);
  }
  return out;
}

export function isStreamingSeries(preview: StremioMetaPreview) {
  return preview.type === "series" || preview.type === "channel";
}

export const STREAMING_ID_PREFIX = "stremio:";
export const SC_STREAMING_ID_PREFIX = "sc:";
export const SATURN_STREAMING_ID_PREFIX = "saturn:";
export const LOONEX_STREAMING_ID_PREFIX = "loonex:";
export const YOUTUBE_STREAMING_ID_PREFIX = "youtube:";

/** Nome visualizzato per anteprime streaming (fallback da slug se name assente). */
export function streamingPreviewDisplayName(preview: StremioMetaPreview): string {
  const name = decodeHtmlEntities(preview.name?.trim() ?? "");
  if (name) return name;
  const slug = preview.slug?.trim();
  if (slug) {
    const base = slug.replace(/-[A-Za-z0-9]{4,8}$/, "");
    return base.replace(/-/g, " ").trim() || slug;
  }
  return preview.id;
}

export function streamingMediaId(preview: StremioMetaPreview): string {
  const isSeries = preview.type === "series" || preview.type === "channel";
  if (preview.catalogPrefix === "sc" && preview.slug) {
    const base = `${SC_STREAMING_ID_PREFIX}${preview.type}:${preview.id}:${preview.slug}`;
    if (
      isSeries &&
      preview.resumeVideoId &&
      preview.resumeVideoId !== preview.id
    ) {
      return `${base}:${preview.resumeVideoId}`;
    }
    return base;
  }
  if (preview.catalogPrefix === "saturn" && preview.slug) {
    const base = `${SATURN_STREAMING_ID_PREFIX}${preview.type}:${preview.slug}`;
    if (
      isSeries &&
      preview.resumeVideoId &&
      preview.resumeVideoId !== preview.id
    ) {
      return `${base}:${preview.resumeVideoId}`;
    }
    return base;
  }
  if (preview.catalogPrefix === "loonex" && preview.slug) {
    const base = `${LOONEX_STREAMING_ID_PREFIX}${preview.type}:${preview.slug}`;
    if (
      isSeries &&
      preview.resumeVideoId &&
      preview.resumeVideoId !== preview.id
    ) {
      return `${base}:${preview.resumeVideoId}`;
    }
    return base;
  }
  if (preview.catalogPrefix === "youtube" && preview.slug) {
    const base = `${YOUTUBE_STREAMING_ID_PREFIX}${preview.type}:${preview.slug}`;
    if (
      isSeries &&
      preview.resumeVideoId &&
      preview.resumeVideoId !== preview.id
    ) {
      return `${base}:${preview.resumeVideoId}`;
    }
    return base;
  }
  const prefix = STREAMING_ID_PREFIX;
  return `${prefix}${preview.type}:${preview.id}`;
}

export function previewToMediaItem(preview: StremioMetaPreview): MediaItem {
  const mediaType =
    preview.mediaType ??
    (preview.type === "movie"
      ? "film"
      : preview.type === "series"
        ? "serie"
        : preview.type === "channel"
          ? "serie"
          : preview.type);

  return {
    id: streamingMediaId(preview),
    title: streamingPreviewDisplayName(preview),
    mediaType,
    year: parseYear(preview.releaseInfo),
    filePath: "",
    fileName: "",
    description: preview.description,
    posterUrl: maximizePosterUrl(preview.poster),
    backgroundUrl: maximizeHeroUrl(preview.background),
    logoUrl: pickBestLogoUrl(preview.logo),
    isFavorite: preview.inMyList ?? false,
    kidFriendly: true,
    streamingServices: preview.streamingServices ?? [],
    genres: preview.genres ?? [],
    gradient: STREAMING_GRADIENT,
    createdAt: new Date(0).toISOString(),
    watchPosition: preview.watchPosition,
    watchDuration: preview.watchDuration,
  };
}

export function metaToMediaItem(
  meta: StremioMeta,
  videoTitle?: string,
): MediaItem {
  const base = previewToMediaItem({
    id: meta.id,
    type: meta.type,
    name: videoTitle ?? meta.name,
    poster: meta.poster,
    description: meta.description,
    releaseInfo: meta.releaseInfo,
  });
  return { ...base, title: videoTitle ?? meta.name };
}

function parseYear(releaseInfo?: string): number | undefined {
  if (!releaseInfo) return undefined;
  const match = releaseInfo.match(/\d{4}/);
  return match ? Number(match[0]) : undefined;
}

export interface AddonWatchTarget {
  contentType: string;
  metaId: string;
  videoId?: string;
  /** Episodio da evidenziare / «Riproduci» senza autoplay immediato */
  preferredVideoId?: string;
  slug?: string;
  catalogPrefix?: string;
}

export function isStreamingMediaId(id: string): boolean {
  return (
    id.startsWith(STREAMING_ID_PREFIX) ||
    id.startsWith(SC_STREAMING_ID_PREFIX) ||
    id.startsWith(SATURN_STREAMING_ID_PREFIX) ||
    id.startsWith(LOONEX_STREAMING_ID_PREFIX) ||
    id.startsWith(YOUTUBE_STREAMING_ID_PREFIX)
  );
}

export function isScStreamingMediaId(id: string): boolean {
  return id.startsWith(SC_STREAMING_ID_PREFIX);
}

export function scPreviewTarget(
  id: string,
): { titleId: string; slug: string } | null {
  const target = parseStreamingMediaId(id);
  if (!target?.slug || target.catalogPrefix !== "sc") return null;
  return { titleId: target.metaId, slug: target.slug };
}

export function parseStreamingMediaId(id: string): AddonWatchTarget | null {
  if (id.startsWith(LOONEX_STREAMING_ID_PREFIX)) {
    const rest = id.slice(LOONEX_STREAMING_ID_PREFIX.length);
    const parts = rest.split(":");
    if (parts.length < 2) return null;
    const contentType = parts[0];
    const slug = parts[1];
    if (!contentType || !slug) return null;

    let videoId: string | undefined;
    if (parts.length >= 3) {
      videoId = parts.slice(2).join(":");
    }

    return {
      contentType,
      metaId: slug,
      slug,
      catalogPrefix: "loonex",
      videoId,
    };
  }
  if (id.startsWith(YOUTUBE_STREAMING_ID_PREFIX)) {
    const rest = id.slice(YOUTUBE_STREAMING_ID_PREFIX.length);
    const parts = rest.split(":");
    if (parts.length < 2) return null;
    const contentType = parts[0];
    const slug = parts[1];
    if (!contentType || !slug) return null;

    let videoId: string | undefined;
    if (parts.length >= 3) {
      videoId = parts.slice(2).join(":");
    }

    return {
      contentType,
      metaId: slug,
      slug,
      catalogPrefix: "youtube",
      videoId,
    };
  }
  if (id.startsWith(SATURN_STREAMING_ID_PREFIX)) {
    const rest = id.slice(SATURN_STREAMING_ID_PREFIX.length);
    const parts = rest.split(":");
    if (parts.length < 2) return null;
    const contentType = parts[0];
    const slug = parts[1];
    if (!contentType || !slug) return null;

    let videoId: string | undefined;
    if (parts.length >= 3) {
      const last = parts[parts.length - 1];
      if (last && /^\d+$/.test(last)) {
        videoId = last;
      }
    }

    return {
      contentType,
      metaId: slug,
      slug,
      catalogPrefix: "saturn",
      videoId,
    };
  }
  if (id.startsWith(SC_STREAMING_ID_PREFIX)) {
    const rest = id.slice(SC_STREAMING_ID_PREFIX.length);
    const parts = rest.split(":");
    if (parts.length < 3) return null;
    const contentType = parts[0];
    const metaId = parts[1];
    if (!contentType || !metaId) return null;

    let slug: string;
    let videoId: string | undefined;
    if (parts.length >= 4) {
      const last = parts[parts.length - 1];
      if (last && /^\d+$/.test(last)) {
        videoId = last;
        slug = parts.slice(2, -1).join(":");
      } else {
        slug = parts.slice(2).join(":");
      }
    } else {
      slug = parts.slice(2).join(":");
    }

    if (!slug) return null;
    return {
      contentType,
      metaId,
      slug,
      catalogPrefix: "sc",
      videoId,
    };
  }
  if (!id.startsWith(STREAMING_ID_PREFIX)) return null;
  const rest = id.slice(STREAMING_ID_PREFIX.length);
  const sep = rest.indexOf(":");
  if (sep < 0) return null;
  const contentType = rest.slice(0, sep);
  const metaId = rest.slice(sep + 1);
  if (!contentType || !metaId) return null;
  return { contentType, metaId };
}

export function streamingPreviewDedupeKey(
  preview: Pick<StremioMetaPreview, "type" | "id" | "resumeVideoId">,
): string {
  const base = `${preview.type}:${preview.id}`;
  const vid = preview.resumeVideoId?.trim();
  if (vid && vid !== preview.id) return `${base}:${vid}`;
  return base;
}

export function streamingWatchVideoId(
  preview: StremioMetaPreview,
): string | undefined {
  const isSeries = preview.type === "series" || preview.type === "channel";
  if (isSeries) {
    const resume = preview.resumeVideoId?.trim();
    if (resume) return resume;
    return undefined;
  }
  if (
    preview.type === "movie" &&
    preview.watchPosition != null &&
    preview.watchPosition > 5
  ) {
    return preview.id;
  }
  return undefined;
}

export function previewToWatchTarget(preview: StremioMetaPreview): AddonWatchTarget {
  const videoId = streamingWatchVideoId(preview);
  if (preview.catalogPrefix === "sc" && preview.slug) {
    return {
      contentType: preview.type,
      metaId: preview.id,
      slug: preview.slug,
      catalogPrefix: "sc",
      videoId,
    };
  }
  if (preview.catalogPrefix === "saturn" && preview.slug) {
    return {
      contentType: preview.type,
      metaId: preview.slug,
      slug: preview.slug,
      catalogPrefix: "saturn",
      videoId,
    };
  }
  if (preview.catalogPrefix === "loonex" && preview.slug) {
    return {
      contentType: preview.type,
      metaId: preview.slug,
      slug: preview.slug,
      catalogPrefix: "loonex",
      videoId,
    };
  }
  if (preview.catalogPrefix === "youtube" && preview.slug) {
    return {
      contentType: preview.type,
      metaId: preview.slug,
      slug: preview.slug,
      catalogPrefix: "youtube",
      videoId,
    };
  }
  return {
    contentType: preview.type,
    metaId: preview.id,
    catalogPrefix: preview.catalogPrefix,
    videoId,
  };
}

export function previewToDetailTarget(preview: StremioMetaPreview): AddonWatchTarget {
  const target = previewToWatchTarget(preview);
  const preferredVideoId = streamingWatchVideoId(preview);
  return {
    ...target,
    videoId: undefined,
    preferredVideoId,
  };
}

export function continueToPreview(item: StreamingContinueItem): StremioMetaPreview {
  return {
    id: item.titleId,
    type: item.contentType,
    name: item.titleName,
    resumeEpisodeLabel: item.episodeLabel,
    poster: maximizePosterUrl(item.poster),
    background: maximizeHeroUrl(item.poster),
    catalogPrefix: item.catalogPrefix,
    slug: item.slug,
    watchPosition: item.positionSecs,
    watchDuration: item.durationSecs,
    resumeVideoId: item.videoId,
  };
}

export function continueToMediaItem(item: StreamingContinueItem): MediaItem {
  return previewToMediaItem(continueToPreview(item));
}

export function continueToWatchTarget(item: StreamingContinueItem): AddonWatchTarget {
  const isMovie = item.contentType === "movie";
  return {
    contentType: item.contentType,
    metaId: item.titleId,
    slug: item.slug,
    catalogPrefix: item.catalogPrefix,
    videoId: isMovie ? item.titleId : item.videoId,
  };
}

export function streamingProgressInput(
  item: StreamingContinueItem,
  positionSecs: number,
  durationSecs?: number,
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
    positionSecs,
    durationSecs,
  };
}

function streamingSeriesMediaType(meta: StremioMeta): MediaItem["mediaType"] {
  if (meta.type === "movie") return "film";
  if (meta.type === "channel") return "serie";
  return "serie";
}

/** Episodi ordinati per next/prev nel player (id = video.id). */
export function metaVideosToMediaItems(meta: StremioMeta): MediaItem[] {
  if (meta.type === "movie" || meta.videos.length <= 1) return [];
  return [...meta.videos]
    .map((video) => metaVideoToMediaItem(meta, video.id, video.title))
    .sort(compareEpisodes);
}

export function metaVideoToMediaItem(
  meta: StremioMeta,
  videoId: string,
  videoTitle?: string,
): MediaItem {
  const video = meta.videos.find((v) => v.id === videoId);
  const title = videoTitle?.trim() || video?.title?.trim() || meta.name;
  const isSeries = meta.type !== "movie";
  return {
    id: videoId,
    title,
    mediaType: streamingSeriesMediaType(meta),
    seriesTitle: isSeries ? meta.name : undefined,
    season: video?.season,
    episode: video?.episode,
    filePath: "",
    fileName: "",
    description: video?.description ?? meta.description,
    posterUrl: video?.thumbnail ?? meta.poster,
    isFavorite: false,
    kidFriendly: true,
    streamingServices: [],
    genres: meta.genres ?? [],
    gradient: STREAMING_GRADIENT,
    createdAt: new Date(0).toISOString(),
  };
}
