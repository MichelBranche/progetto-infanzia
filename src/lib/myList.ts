import type { MediaItem } from "../types/media";
import type { StremioMetaPreview } from "../types/stremio";
import { parseStreamingMediaId, streamingPreviewDisplayName } from "./streamingBrowse";

export interface StreamingListInput {
  catalogPrefix: string;
  contentType: string;
  titleId: string;
  slug?: string;
  name: string;
  poster?: string;
  mediaType?: string;
  releaseInfo?: string;
}

export function streamingListKey(
  preview: Pick<StremioMetaPreview, "catalogPrefix" | "type" | "id">,
): string {
  return `${preview.catalogPrefix ?? "sc"}:${preview.type}:${preview.id}`;
}

export function markStreamingInMyList(
  preview: StremioMetaPreview,
  keys: Set<string>,
): StremioMetaPreview {
  return {
    ...preview,
    inMyList: keys.has(streamingListKey(preview)),
  };
}

export function previewToListInput(preview: StremioMetaPreview): StreamingListInput {
  return {
    catalogPrefix: preview.catalogPrefix ?? "sc",
    contentType: preview.type,
    titleId: preview.id,
    slug: preview.slug,
    name: streamingPreviewDisplayName(preview),
    poster: preview.poster,
    mediaType: preview.mediaType,
    releaseInfo: preview.releaseInfo,
  };
}

export function mediaItemToListInput(media: MediaItem): StreamingListInput | null {
  const target = parseStreamingMediaId(media.id);
  if (!target) return null;
  return {
    catalogPrefix: target.catalogPrefix ?? "sc",
    contentType: target.contentType,
    titleId: target.metaId,
    slug: target.slug,
    name: media.title,
    poster: media.posterUrl,
    mediaType: media.mediaType,
    releaseInfo: media.year ? String(media.year) : undefined,
  };
}

export function mediaItemToStreamingPreview(media: MediaItem): StremioMetaPreview | null {
  const target = parseStreamingMediaId(media.id);
  if (!target) return null;
  return {
    id: target.metaId,
    type: target.contentType,
    name: media.title,
    poster: media.posterUrl,
    catalogPrefix: target.catalogPrefix,
    slug: target.slug,
    mediaType: media.mediaType,
    releaseInfo: media.year ? String(media.year) : undefined,
    inMyList: media.isFavorite,
  };
}
