import type { BrowseItem } from "./browse";
import { browseItemMedia } from "./browse";
import type { MediaItem } from "../types/media";

export interface SectionBrowseRow {
  key: string;
  title: string;
  subtitle?: string;
  items: BrowseItem[];
}

const ROW_CHUNK = 28;

export function featuredFromBrowseItems(
  items: BrowseItem[],
): MediaItem | undefined {
  for (const browse of items) {
    const media = browseItemMedia(browse);
    if (media.posterUrl?.trim()) return media;
  }
  return items[0] ? browseItemMedia(items[0]) : undefined;
}

export function splitSectionBrowseRows(
  items: BrowseItem[],
  sectionTitle: string,
): SectionBrowseRow[] {
  const local: BrowseItem[] = [];
  const streaming: BrowseItem[] = [];

  for (const item of items) {
    if (item.kind === "streaming") streaming.push(item);
    else local.push(item);
  }

  const rows: SectionBrowseRow[] = [];

  if (local.length > 0) {
    rows.push({
      key: "local",
      title: "Dalla tua libreria",
      subtitle: `${local.length.toLocaleString("it-IT")} titoli in locale`,
      items: local,
    });
  }

  if (streaming.length > 0) {
    const chunks = Math.ceil(streaming.length / ROW_CHUNK);
    for (let i = 0; i < chunks; i++) {
      const chunk = streaming.slice(i * ROW_CHUNK, (i + 1) * ROW_CHUNK);
      rows.push({
        key: `streaming-${i}`,
        title: i === 0 ? `In streaming · ${sectionTitle}` : "Altri titoli",
        subtitle:
          i === 0
            ? `${streaming.length.toLocaleString("it-IT")} dal catalogo sincronizzato`
            : undefined,
        items: chunk,
      });
    }
  }

  if (rows.length === 0 && items.length > 0) {
    rows.push({
      key: "all",
      title: sectionTitle,
      items,
    });
  }

  return rows;
}
