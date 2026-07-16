import type { StremioMetaPreview } from "../types/stremio";
import {
  buildSearchIndex,
  filterAndRankSearchIndex,
  filterAndRankSearchItems,
  rankSearchResults,
  suggestDidYouMean,
  type SearchIndexEntry,
} from "./smartSearch";

export function filterCatalogPreviews(
  catalog: StremioMetaPreview[],
  query: string,
): StremioMetaPreview[] {
  return filterAndRankSearchItems(catalog, query, 96);
}

export function buildCatalogSearchIndex(
  catalog: StremioMetaPreview[],
): SearchIndexEntry<StremioMetaPreview>[] {
  return buildSearchIndex(catalog);
}

export function filterCatalogIndex(
  index: SearchIndexEntry<StremioMetaPreview>[],
  query: string,
): StremioMetaPreview[] {
  return filterAndRankSearchIndex(index, query, 96);
}

export function suggestCatalogDidYouMean(
  catalog: StremioMetaPreview[],
  query: string,
): StremioMetaPreview | null {
  return suggestDidYouMean(catalog, query);
}

export function mergeSearchPreviews(
  apiResults: StremioMetaPreview[],
  localMatches: StremioMetaPreview[],
  catalog: StremioMetaPreview[],
  query?: string,
): StremioMetaPreview[] {
  const knownByKey = new Map<string, StremioMetaPreview>();
  for (const preview of catalog) {
    knownByKey.set(`${preview.type}:${preview.id}`, preview);
  }

  const seen = new Set<string>();
  const merged: StremioMetaPreview[] = [];

  const push = (preview: StremioMetaPreview) => {
    const key = `${preview.type}:${preview.id}`;
    if (seen.has(key)) return;
    seen.add(key);

    const known = knownByKey.get(key);
    merged.push({
      ...preview,
      name: preview.name?.trim() ? preview.name : (known?.name ?? preview.name),
      poster: preview.poster ?? known?.poster,
      slug: preview.slug ?? known?.slug,
      catalogPrefix: preview.catalogPrefix ?? known?.catalogPrefix,
      genres: preview.genres?.length ? preview.genres : known?.genres,
      cast: preview.cast?.length ? preview.cast : known?.cast,
      directors: preview.directors?.length ? preview.directors : known?.directors,
      releaseInfo: preview.releaseInfo ?? known?.releaseInfo,
    });
  };

  // Local ranked matches first (already smart-sorted), then API, then re-rank all.
  for (const preview of localMatches) push(preview);
  for (const preview of apiResults) push(preview);

  if (query?.trim()) {
    return rankSearchResults(merged, query);
  }
  return merged;
}

export function appendUniquePreviews(
  current: StremioMetaPreview[],
  incoming: StremioMetaPreview[],
): StremioMetaPreview[] {
  const seen = new Set(current.map((p) => `${p.type}:${p.id}`));
  const next = [...current];
  for (const preview of incoming) {
    const key = `${preview.type}:${preview.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    next.push(preview);
  }
  return next;
}
