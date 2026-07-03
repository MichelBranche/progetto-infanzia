import type { BrowseItem } from "./browse";
import { browseItemId } from "./browse";
import { isStreamingSeries, previewToDetailTarget } from "./streamingBrowse";
import type { AddonWatchTarget } from "./streamingBrowse";
import { STREMIO_ADDONS_ENABLED, isBuiltinStreamingCatalog } from "./features";

export type BrowseDetailAction =
  | { type: "watch"; mediaId: string }
  | { type: "series"; seriesKey: string }
  | { type: "streaming"; target: AddonWatchTarget };

export function browseDetailAction(
  browse: BrowseItem,
): BrowseDetailAction | null {
  if (browse.kind === "streaming") {
    const preview = browse.preview;
    if (
      !STREMIO_ADDONS_ENABLED &&
      !isBuiltinStreamingCatalog(preview.catalogPrefix)
    ) {
      return null;
    }
    if (
      preview.catalogPrefix === "sc" ||
      preview.catalogPrefix === "saturn" ||
      preview.catalogPrefix === "loonex"
    ) {
      const target = previewToDetailTarget(preview);
      if (!target.slug) return null;
      return { type: "streaming", target };
    }
    if (!STREMIO_ADDONS_ENABLED) return null;
    return {
      type: "streaming",
      target: previewToDetailTarget(preview),
    };
  }

  if (browse.kind === "series") {
    return {
      type: "series",
      seriesKey: `${browse.series.mediaType}::${browse.series.seriesTitle}`,
    };
  }

  if (browse.kind === "media") {
    return { type: "watch", mediaId: browse.item.id };
  }

  return null;
}

export function similarBrowseItems(
  browse: BrowseItem,
  pool: BrowseItem[],
  limit = 20,
): BrowseItem[] {
  const id = browseItemId(browse);
  const targetType =
    browse.kind === "streaming"
      ? browse.preview.mediaType ?? browse.preview.type
      : browse.kind === "series"
        ? browse.series.mediaType
        : browse.item.mediaType;

  return pool
    .filter((item) => browseItemId(item) !== id)
    .filter((item) => {
      if (browse.kind === "streaming" && item.kind === "streaming") {
        return (
          (item.preview.mediaType ?? item.preview.type) === targetType ||
          (isStreamingSeries(browse.preview) && isStreamingSeries(item.preview))
        );
      }
      if (browse.kind !== "streaming" && item.kind !== "streaming") {
        const type =
          item.kind === "series"
            ? item.series.mediaType
            : item.kind === "media"
              ? item.item.mediaType
              : "";
        return type === targetType;
      }
      return browse.kind === "streaming" && item.kind === "streaming";
    })
    .slice(0, limit);
}
