import type { BrowseItem } from "./browse";
import { browseItemMedia } from "./browse";
import type { StremioMetaPreview } from "../types/stremio";
import type { StreamingRow } from "./useStreamingCatalogs";
import { streamingBrowseItem } from "./streamingBrowse";
import { enrichStreamingPreview } from "./unifiedBrowse";

export interface FilmBrowseRow {
  key: string;
  title: string;
  subtitle?: string;
  items: BrowseItem[];
}

export interface FilmGenreCategory {
  key: string;
  title: string;
  genreMatch: RegExp;
  rowMatch: RegExp;
  slugMatch: RegExp;
}

export const FILM_GENRE_CATEGORIES: FilmGenreCategory[] = [
  {
    key: "horror",
    title: "Horror",
    genreMatch: /horror|horrore|splatter|terrore/i,
    rowMatch: /horror|horrore|splatter|terrore/i,
    slugMatch: /horror|horrore|splatter|terrore/i,
  },
  {
    key: "azione",
    title: "Azione",
    genreMatch: /action|azione|avventura|adventure/i,
    rowMatch: /azione|action|avventura/i,
    slugMatch: /azione|action|avventura/i,
  },
  {
    key: "dramma",
    title: "Dramma",
    genreMatch: /drama|dramma|drammatico/i,
    rowMatch: /dramma|drama|drammatico/i,
    slugMatch: /dramma|drama|drammatico/i,
  },
  {
    key: "romance",
    title: "Storia d'amore",
    genreMatch: /romance|romantico|romantic|amore|love/i,
    rowMatch: /romantic|romance|romantico|amore|love/i,
    slugMatch: /romantic|romance|romantico|amore|love/i,
  },
  {
    key: "commedia",
    title: "Comico",
    genreMatch: /comedy|commedia|comico|commed/i,
    rowMatch: /commedia|comedy|comico/i,
    slugMatch: /commedia|comedy|comico|commed/i,
  },
  {
    key: "fantascienza",
    title: "Fantascienza",
    genreMatch: /sci[\s-]?fi|science fiction|fantascienza|fantasy|fantasia/i,
    rowMatch: /fantascienza|sci[\s-]?fi|fantasy|fantasia/i,
    slugMatch: /fantascienza|sci|fantasy|fantasia/i,
  },
  {
    key: "thriller",
    title: "Thriller",
    genreMatch: /thriller|suspense|mistero|mystery|crime|crimine|noir|poliziesco/i,
    rowMatch: /thriller|suspense|mistero|crime|crimine|noir|poliziesc/i,
    slugMatch: /thriller|suspense|mistero|crime|crimine|noir|poliziesc/i,
  },
  {
    key: "animazione",
    title: "Animazione",
    genreMatch: /animation|animazione|cartoon/i,
    rowMatch: /animazione|animation|cartoon/i,
    slugMatch: /animazione|animation|cartoon/i,
  },
];

const MIN_FILM_GENRE_ROW_ITEMS = 1;
const MAX_FILM_GENRE_ROW_ITEMS = 64;

function isCatalogMovie(preview: StremioMetaPreview): boolean {
  return preview.type === "movie" || preview.mediaType === "film";
}

function isFilmBrowseItem(item: BrowseItem): boolean {
  if (item.kind === "streaming") {
    return isCatalogMovie(item.preview);
  }
  return browseItemMedia(item).mediaType === "film";
}

function previewKey(preview: StremioMetaPreview): string {
  return `${preview.type}:${preview.id}`;
}

function previewGenreScore(preview: StremioMetaPreview): number {
  let score = (preview.genres?.length ?? 0) * 2;
  if (preview.sourceRowKey?.startsWith("sc-genre-")) score += 12;
  if (preview.sourceRowTitle) score += 1;
  return score;
}

function mergePreviewMetadata(
  existing: StremioMetaPreview | undefined,
  incoming: StremioMetaPreview,
): StremioMetaPreview {
  if (!existing || previewGenreScore(incoming) > previewGenreScore(existing)) {
    return incoming;
  }
  return {
    ...existing,
    genres: [
      ...new Set([...(existing.genres ?? []), ...(incoming.genres ?? [])]),
    ],
  };
}

function previewContext(preview: StremioMetaPreview): string {
  return [
    preview.sourceRowKey,
    preview.sourceRowTitle,
    ...(preview.genres ?? []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function genreSlugFromPreview(preview: StremioMetaPreview): string | null {
  const rowKey = preview.sourceRowKey?.toLowerCase() ?? "";
  if (rowKey.startsWith("sc-genre-")) {
    return rowKey.slice("sc-genre-".length);
  }
  return null;
}

function matchesCategoryPreview(
  preview: StremioMetaPreview,
  category: FilmGenreCategory,
): boolean {
  const slug = genreSlugFromPreview(preview);
  if (slug && category.slugMatch.test(slug)) return true;

  const context = previewContext(preview);
  if (context && category.rowMatch.test(context)) return true;

  for (const genre of preview.genres ?? []) {
    if (category.genreMatch.test(genre)) return true;
  }
  return false;
}

function matchesCategoryRow(
  row: StreamingRow,
  category: FilmGenreCategory,
): boolean {
  const key = row.key.toLowerCase();
  if (key.startsWith("sc-genre-")) {
    const slug = key.slice("sc-genre-".length);
    if (category.slugMatch.test(slug)) return true;
  }
  const label = `${row.key} ${row.title}`.toLowerCase();
  return category.rowMatch.test(label);
}

function previewToBrowseItem(
  preview: StremioMetaPreview,
  browseByKey: Map<string, BrowseItem>,
): BrowseItem {
  return browseByKey.get(previewKey(preview)) ?? streamingBrowseItem(
    enrichStreamingPreview(preview),
  );
}

function collectGenrePreviews(
  catalogIndex: StremioMetaPreview[],
  streamingRows: StreamingRow[],
): Map<string, StremioMetaPreview> {
  const byKey = new Map<string, StremioMetaPreview>();

  const push = (preview: StremioMetaPreview) => {
    if (!isCatalogMovie(preview)) return;
    const key = previewKey(preview);
    byKey.set(key, mergePreviewMetadata(byKey.get(key), preview));
  };

  for (const preview of catalogIndex) {
    push(preview);
  }

  for (const row of streamingRows) {
    if (!row.key.startsWith("sc-genre-") && !/genre/i.test(row.key)) {
      continue;
    }
    for (const preview of row.items) {
      push({
        ...preview,
        sourceRowKey: preview.sourceRowKey ?? row.key,
        sourceRowTitle: preview.sourceRowTitle ?? row.title,
        genres: preview.genres?.length
          ? preview.genres
          : [row.title],
      });
    }
  }

  return byKey;
}

export function splitFilmBrowseRowsByGenre(
  items: BrowseItem[],
  streamingRows: StreamingRow[] = [],
  catalogIndex: StremioMetaPreview[] = [],
): FilmBrowseRow[] {
  const films = items.filter(isFilmBrowseItem);
  const local = films.filter((item) => item.kind !== "streaming");
  const browseByKey = new Map<string, BrowseItem>();

  for (const item of films) {
    if (item.kind !== "streaming") continue;
    browseByKey.set(previewKey(item.preview), item);
  }

  const rows: FilmBrowseRow[] = [];

  if (local.length > 0) {
    rows.push({
      key: "local",
      title: "Dalla tua libreria",
      subtitle: `${local.length.toLocaleString("it-IT")} titoli in locale`,
      items: local,
    });
  }

  const genrePreviews = collectGenrePreviews(catalogIndex, streamingRows);
  const categorizedKeys = new Set<string>();

  for (const category of FILM_GENRE_CATEGORIES) {
    const bucket: BrowseItem[] = [];
    const seen = new Set<string>();

    const pushMatch = (preview: StremioMetaPreview) => {
      const key = previewKey(preview);
      if (seen.has(key) || !matchesCategoryPreview(preview, category)) return;
      seen.add(key);
      categorizedKeys.add(key);
      bucket.push(previewToBrowseItem(preview, browseByKey));
    };

    for (const row of streamingRows) {
      if (!matchesCategoryRow(row, category)) continue;
      for (const preview of row.items.filter(isCatalogMovie)) {
        pushMatch({
          ...preview,
          sourceRowKey: preview.sourceRowKey ?? row.key,
          sourceRowTitle: preview.sourceRowTitle ?? row.title,
        });
        if (bucket.length >= MAX_FILM_GENRE_ROW_ITEMS) break;
      }
      if (bucket.length >= MAX_FILM_GENRE_ROW_ITEMS) break;
    }

    if (bucket.length < MAX_FILM_GENRE_ROW_ITEMS) {
      for (const preview of genrePreviews.values()) {
        pushMatch(preview);
        if (bucket.length >= MAX_FILM_GENRE_ROW_ITEMS) break;
      }
    }

    if (bucket.length >= MIN_FILM_GENRE_ROW_ITEMS) {
      rows.push({
        key: `genre-${category.key}`,
        title: category.title,
        subtitle: `${bucket.length.toLocaleString("it-IT")} film`,
        items: bucket,
      });
    }
  }

  const remaining = films.filter((item) => {
    if (item.kind !== "streaming") return false;
    return !categorizedKeys.has(previewKey(item.preview));
  });

  if (remaining.length > 0) {
    rows.push({
      key: "altri",
      title: "Altri film",
      subtitle: `${remaining.length.toLocaleString("it-IT")} titoli da scoprire`,
      items: remaining.slice(0, MAX_FILM_GENRE_ROW_ITEMS),
    });
  }

  if (rows.length === 0 && films.length > 0) {
    rows.push({
      key: "all",
      title: "Film",
      items: films,
    });
  }

  return rows;
}
