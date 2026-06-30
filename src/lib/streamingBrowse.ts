import type { MediaItem } from "../types/media";
import type { StremioMeta, StremioMetaPreview, StreamingContinueItem, StreamingWatchProgressInput } from "../types/stremio";
import type { BrowseItem } from "./browse";

const STREAMING_GRADIENT = "from-indigo-950 via-slate-900 to-violet-950";

export function streamingBrowseItem(preview: StremioMetaPreview): BrowseItem {
  return { kind: "streaming", preview };
}

export function isStreamingSeries(preview: StremioMetaPreview) {
  return preview.type === "series" || preview.type === "channel";
}

export const STREAMING_ID_PREFIX = "stremio:";
export const SC_STREAMING_ID_PREFIX = "sc:";
export const SATURN_STREAMING_ID_PREFIX = "saturn:";

/** Nome visualizzato per anteprime streaming (fallback da slug se name assente). */
export function streamingPreviewDisplayName(preview: StremioMetaPreview): string {
  const name = preview.name?.trim();
  if (name) return name;
  const slug = preview.slug?.trim();
  if (slug) {
    const base = slug.replace(/-[A-Za-z0-9]{4,8}$/, "");
    return base.replace(/-/g, " ").trim() || slug;
  }
  return preview.id;
}

export function streamingMediaId(preview: StremioMetaPreview): string {
  if (preview.catalogPrefix === "sc" && preview.slug) {
    const base = `${SC_STREAMING_ID_PREFIX}${preview.type}:${preview.id}:${preview.slug}`;
    if (preview.resumeVideoId && preview.resumeVideoId !== preview.id) {
      return `${base}:${preview.resumeVideoId}`;
    }
    return base;
  }
  if (preview.catalogPrefix === "saturn" && preview.slug) {
    const base = `${SATURN_STREAMING_ID_PREFIX}${preview.type}:${preview.slug}`;
    if (preview.resumeVideoId && preview.resumeVideoId !== preview.id) {
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
    posterUrl: preview.poster,
    isFavorite: preview.inMyList ?? false,
    kidFriendly: true,
    streamingServices: [],
    genres: [],
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
  slug?: string;
  catalogPrefix?: string;
}

export function isStreamingMediaId(id: string): boolean {
  return (
    id.startsWith(STREAMING_ID_PREFIX) ||
    id.startsWith(SC_STREAMING_ID_PREFIX) ||
    id.startsWith(SATURN_STREAMING_ID_PREFIX)
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

export function previewToWatchTarget(preview: StremioMetaPreview): AddonWatchTarget {
  return { contentType: preview.type, metaId: preview.id };
}

export function continueToPreview(item: StreamingContinueItem): StremioMetaPreview {
  return {
    id: item.titleId,
    type: item.contentType,
    name: item.episodeLabel
      ? `${item.titleName} · ${item.episodeLabel}`
      : item.titleName,
    poster: item.poster,
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
  return {
    contentType: item.contentType,
    metaId: item.titleId,
    slug: item.slug,
    catalogPrefix: item.catalogPrefix,
    videoId: item.videoId,
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
