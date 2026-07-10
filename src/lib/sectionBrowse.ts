import type { BrowseItem } from "./browse";
import type { StremioMetaPreview } from "../types/stremio";
import type { StreamingRow } from "./useStreamingCatalogs";
import { splitFilmBrowseRowsByGenre, type FilmBrowseRow } from "./filmGenres";

export type SectionBrowseRow = FilmBrowseRow;

const ROW_CHUNK = 28;

export function splitSectionBrowseRows(
  items: BrowseItem[],
  sectionTitle: string,
  sectionId?: string,
  streamingRows: StreamingRow[] = [],
  catalogIndex: StremioMetaPreview[] = [],
): SectionBrowseRow[] {
  if (sectionId === "film") {
    return splitFilmBrowseRowsByGenre(items, streamingRows, catalogIndex);
  }

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
