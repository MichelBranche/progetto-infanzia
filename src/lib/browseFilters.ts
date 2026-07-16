import type { BrowseItem } from "./browse";
import { browseItemMedia } from "./browse";
import type { StremioMetaPreview } from "../types/stremio";
import type { StreamingRow } from "./useStreamingCatalogs";
import {
  FILM_GENRE_CATEGORIES,
  type FilmGenreCategory,
} from "./filmGenres";
import { STREAMING_SERVICES, serviceById } from "../data/streaming";

export type BrowseSortId = "popular" | "recent" | "az";

export interface BrowseFilterOption {
  id: string;
  label: string;
}

export interface BrowseFilterState {
  genre: string | null;
  year: number | null;
  sort: BrowseSortId;
  provider: string | null;
}

export const DEFAULT_BROWSE_FILTERS: BrowseFilterState = {
  genre: null,
  year: null,
  sort: "popular",
  provider: null,
};

export const BROWSE_SORT_OPTIONS: BrowseFilterOption[] = [
  { id: "popular", label: "Popolari" },
  { id: "recent", label: "Più recenti" },
  { id: "az", label: "A–Z" },
];

function previewKey(preview: StremioMetaPreview): string {
  return `${preview.type}:${preview.id}`;
}

function genreContext(preview: StremioMetaPreview): string {
  return [
    preview.sourceRowKey,
    preview.sourceRowTitle,
    ...(preview.genres ?? []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function matchesGenreCategory(
  preview: StremioMetaPreview,
  category: FilmGenreCategory,
): boolean {
  const rowKey = preview.sourceRowKey?.toLowerCase() ?? "";
  if (rowKey.startsWith("sc-genre-")) {
    const slug = rowKey.slice("sc-genre-".length);
    if (category.slugMatch.test(slug)) return true;
  }

  const context = genreContext(preview);
  if (context && category.rowMatch.test(context)) return true;

  for (const genre of preview.genres ?? []) {
    if (category.genreMatch.test(genre)) return true;
  }

  return false;
}

function matchesLocalGenre(
  genres: string[] | undefined,
  category: FilmGenreCategory,
): boolean {
  for (const genre of genres ?? []) {
    if (category.genreMatch.test(genre)) return true;
  }
  return false;
}

/** Enrich streaming previews with genre row metadata when listing genres are empty. */
export function buildGenreEnrichmentMap(
  streamingRows: StreamingRow[] = [],
  catalogIndex: StremioMetaPreview[] = [],
): Map<string, StremioMetaPreview> {
  const byKey = new Map<string, StremioMetaPreview>();

  const push = (preview: StremioMetaPreview) => {
    const key = previewKey(preview);
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, preview);
      return;
    }
    byKey.set(key, {
      ...existing,
      genres: [
        ...new Set([...(existing.genres ?? []), ...(preview.genres ?? [])]),
      ],
      sourceRowKey: existing.sourceRowKey ?? preview.sourceRowKey,
      sourceRowTitle: existing.sourceRowTitle ?? preview.sourceRowTitle,
    });
  };

  for (const preview of catalogIndex) {
    push(preview);
  }

  for (const row of streamingRows) {
    const isGenreRow =
      row.key.startsWith("sc-genre-") || /genre/i.test(row.key);
    if (!isGenreRow) continue;
    for (const preview of row.items) {
      push({
        ...preview,
        sourceRowKey: preview.sourceRowKey ?? row.key,
        sourceRowTitle: preview.sourceRowTitle ?? row.title,
        genres: preview.genres?.length ? preview.genres : [row.title],
      });
    }
  }

  return byKey;
}

export function browseItemYear(item: BrowseItem): number | null {
  if (item.kind === "streaming") {
    const info = item.preview.releaseInfo?.trim() ?? "";
    const match = info.match(/(\d{4})/);
    if (!match) return null;
    const year = Number.parseInt(match[1], 10);
    return Number.isFinite(year) ? year : null;
  }
  const year = browseItemMedia(item).year;
  return typeof year === "number" && year > 0 ? year : null;
}

export function browseItemStreamingServices(item: BrowseItem): string[] {
  if (item.kind === "streaming") {
    return item.preview.streamingServices ?? [];
  }
  return browseItemMedia(item).streamingServices ?? [];
}

export function providerLabel(providerId: string): string {
  return serviceById(providerId)?.label ?? providerId;
}

export function genreFilterOptions(
  items: BrowseItem[] = [],
): BrowseFilterOption[] {
  const counts = new Map<string, number>();
  for (const item of items) {
    const genres =
      item.kind === "streaming"
        ? item.preview.genres ?? []
        : browseItemMedia(item).genres ?? [];
    for (const genre of genres) {
      const label = genre.trim();
      if (!label || label.length > 40) continue;
      // Salta etichette rumore da dump archivi
      if (/^action & adventure$/i.test(label)) continue;
      if (/^sci-fi & fantasy$/i.test(label)) continue;
      if (/^war & politics$/i.test(label)) continue;
      counts.set(label, (counts.get(label) ?? 0) + 1);
    }
  }

  const fromCatalog = [...counts.entries()]
    .filter(([, count]) => count >= 3)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "it"))
    .slice(0, 24)
    .map(([label]) => ({ id: `label:${label}`, label }));

  if (fromCatalog.length > 0) {
    return [{ id: "", label: "Tutti i generi" }, ...fromCatalog];
  }

  return [
    { id: "", label: "Tutti i generi" },
    ...FILM_GENRE_CATEGORIES.map((category) => ({
      id: category.key,
      label: category.title,
    })),
  ];
}

export function collectYearOptions(items: BrowseItem[]): BrowseFilterOption[] {
  const years = new Map<number, number>();
  for (const item of items) {
    const year = browseItemYear(item);
    if (year == null) continue;
    years.set(year, (years.get(year) ?? 0) + 1);
  }
  const sorted = [...years.entries()].sort((a, b) => b[0] - a[0]);
  return [
    { id: "", label: "Tutti gli anni" },
    ...sorted.map(([year, count]) => ({
      id: String(year),
      label: count > 1 ? `${year} (${count})` : String(year),
    })),
  ];
}

export function collectProviderOptions(
  items: BrowseItem[] = [],
): BrowseFilterOption[] {
  const present = new Map<string, number>();
  for (const item of items) {
    for (const service of browseItemStreamingServices(item)) {
      present.set(service, (present.get(service) ?? 0) + 1);
    }
  }

  const ordered = STREAMING_SERVICES.filter((service) => present.has(service.id));

  return [
    { id: "", label: "Tutti i provider" },
    ...ordered.map((service) => ({
      id: service.id,
      label: `${service.label} (${present.get(service.id) ?? 0})`,
    })),
  ];
}

function itemMatchesGenre(
  item: BrowseItem,
  genreKey: string,
  enrichment: Map<string, StremioMetaPreview>,
): boolean {
  if (genreKey.startsWith("label:")) {
    const want = genreKey.slice("label:".length).toLowerCase();
    const genres =
      item.kind === "streaming"
        ? item.preview.genres ?? []
        : browseItemMedia(item).genres ?? [];
    return genres.some((genre) => genre.trim().toLowerCase() === want);
  }

  const category = FILM_GENRE_CATEGORIES.find((entry) => entry.key === genreKey);
  if (!category) return true;

  if (item.kind === "streaming") {
    const enriched = enrichment.get(previewKey(item.preview));
    const preview: StremioMetaPreview = enriched
      ? {
          ...item.preview,
          genres: [
            ...new Set([
              ...(item.preview.genres ?? []),
              ...(enriched.genres ?? []),
            ]),
          ],
          sourceRowKey: item.preview.sourceRowKey ?? enriched.sourceRowKey,
          sourceRowTitle:
            item.preview.sourceRowTitle ?? enriched.sourceRowTitle,
        }
      : item.preview;
    return matchesGenreCategory(preview, category);
  }

  return matchesLocalGenre(browseItemMedia(item).genres, category);
}

export function filterAndSortBrowseItems(
  items: BrowseItem[],
  filters: BrowseFilterState,
  streamingRows: StreamingRow[] = [],
  catalogIndex: StremioMetaPreview[] = [],
): BrowseItem[] {
  const enrichment =
    filters.genre != null
      ? buildGenreEnrichmentMap(streamingRows, catalogIndex)
      : new Map<string, StremioMetaPreview>();

  let next = items;

  if (filters.genre) {
    next = next.filter((item) =>
      itemMatchesGenre(item, filters.genre!, enrichment),
    );
  }

  if (filters.year != null) {
    next = next.filter((item) => browseItemYear(item) === filters.year);
  }

  if (filters.provider) {
    next = next.filter((item) =>
      browseItemStreamingServices(item).includes(filters.provider!),
    );
  }

  if (filters.sort === "popular") {
    return next;
  }

  const indexed = next.map((item, index) => ({ item, index }));
  indexed.sort((a, b) => {
    if (filters.sort === "recent") {
      const yearA = browseItemYear(a.item) ?? 0;
      const yearB = browseItemYear(b.item) ?? 0;
      if (yearA !== yearB) return yearB - yearA;
    }
    const titleA = browseItemMedia(a.item).title;
    const titleB = browseItemMedia(b.item).title;
    const byTitle = titleA.localeCompare(titleB, "it", {
      sensitivity: "base",
    });
    if (byTitle !== 0) return byTitle;
    return a.index - b.index;
  });

  return indexed.map((entry) => entry.item);
}

export function browseFilterChipLabel(
  kind: "genre" | "year" | "sort" | "provider",
  filters: BrowseFilterState,
): string {
  if (kind === "genre") {
    if (!filters.genre) return "Tutti i generi";
    if (filters.genre.startsWith("label:")) {
      return filters.genre.slice("label:".length);
    }
    return (
      FILM_GENRE_CATEGORIES.find((entry) => entry.key === filters.genre)
        ?.title ?? "Genere"
    );
  }
  if (kind === "year") {
    return filters.year != null ? String(filters.year) : "Tutti gli anni";
  }
  if (kind === "sort") {
    return (
      BROWSE_SORT_OPTIONS.find((entry) => entry.id === filters.sort)?.label ??
      "Popolari"
    );
  }
  if (!filters.provider) return "Tutti i provider";
  return serviceById(filters.provider)?.label ?? filters.provider;
}

export function isBrowseFilterActive(
  kind: "genre" | "year" | "sort" | "provider",
  filters: BrowseFilterState,
): boolean {
  if (kind === "genre") return filters.genre != null;
  if (kind === "year") return filters.year != null;
  if (kind === "provider") return filters.provider != null;
  return filters.sort !== "popular";
}
