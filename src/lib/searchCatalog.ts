import type { StremioMetaPreview } from "../types/stremio";

export function filterCatalogPreviews(
  catalog: StremioMetaPreview[],
  query: string,
): StremioMetaPreview[] {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];

  return catalog.filter((preview) => {
    const name = preview.name?.toLowerCase() ?? "";
    const slug = preview.slug?.toLowerCase().replace(/-/g, " ") ?? "";
    return name.includes(q) || slug.includes(q);
  });
}

export function mergeSearchPreviews(
  apiResults: StremioMetaPreview[],
  localMatches: StremioMetaPreview[],
  catalog: StremioMetaPreview[],
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
    });
  };

  for (const preview of apiResults) push(preview);
  for (const preview of localMatches) push(preview);
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
