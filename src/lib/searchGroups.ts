import type { BrowseItem } from "./browse";
import type { StremioMetaPreview } from "../types/stremio";

export interface StreamingSearchGroups {
  sc: BrowseItem[];
  saturn: BrowseItem[];
  other: BrowseItem[];
}

export function partitionStreamingBrowseItems(
  items: BrowseItem[],
): StreamingSearchGroups {
  const groups: StreamingSearchGroups = { sc: [], saturn: [], other: [] };
  for (const item of items) {
    if (item.kind !== "streaming") continue;
    const prefix = item.preview.catalogPrefix;
    if (prefix === "sc") groups.sc.push(item);
    else if (prefix === "saturn") groups.saturn.push(item);
    else groups.other.push(item);
  }
  return groups;
}

export function partitionStreamingPreviews(items: StremioMetaPreview[]) {
  const sc: StremioMetaPreview[] = [];
  const saturn: StremioMetaPreview[] = [];
  const other: StremioMetaPreview[] = [];
  for (const preview of items) {
    if (preview.catalogPrefix === "sc") sc.push(preview);
    else if (preview.catalogPrefix === "saturn") saturn.push(preview);
    else other.push(preview);
  }
  return { sc, saturn, other };
}
