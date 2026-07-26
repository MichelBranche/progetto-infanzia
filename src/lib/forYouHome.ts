import type { BrowseItem } from "./browse";
import type { StreamingContinueItem, StremioMetaPreview } from "../types/stremio";
import type { StreamingRow } from "./useStreamingCatalogs";
import {
  buildContinueCatalogMap,
  enrichContinuePreviewWithMap,
  streamingBrowseItem,
  streamingPreviewDedupeKey,
} from "./streamingBrowse";
import {
  HOME_ROW_DISPLAY_LIMIT,
  type UnifiedHomeRow,
} from "./unifiedBrowse";
import { isStreamingCommunityPreview } from "./streamingRows";

const FOR_YOU_MIN_ITEMS = 4;
const MS_PER_DAY = 86_400_000;

function normalizeGenre(raw: string): string {
  return raw.trim().toLowerCase();
}

function genresFromPreview(preview: StremioMetaPreview): string[] {
  const out = new Set<string>();
  for (const genre of preview.genres ?? []) {
    const n = normalizeGenre(genre);
    if (n) out.add(n);
  }
  const rowKey = preview.sourceRowKey?.toLowerCase() ?? "";
  if (rowKey.startsWith("sc-genre-")) {
    const slug = rowKey.slice("sc-genre-".length).replace(/-/g, " ");
    if (slug) out.add(slug);
  }
  return [...out];
}

function isPriorityScRow(row: StreamingRow): boolean {
  return /trend|popular|pi[uù]\s+vist|hot|viral|latest|novit|imdb|top/i.test(
    `${row.key} ${row.title}`,
  );
}

function continueRecencyWeight(updatedAt: string, now: number): number {
  const ts = Date.parse(updatedAt);
  if (!Number.isFinite(ts)) return 0.5;
  const days = Math.max(0, (now - ts) / MS_PER_DAY);
  return Math.max(0.25, 1.5 / (1 + days / 14));
}

/**
 * Riga homepage «Per te»: affinità di genere da Continua a guardare + My List,
 * solo Streaming Community. Cold start → trending/popular SC.
 */
export function buildForYouHomeRow(input: {
  continueItems: StreamingContinueItem[];
  catalogIndex: StremioMetaPreview[];
  streamingRows: StreamingRow[];
  myListPreviews?: StremioMetaPreview[];
  excludeKeys?: Iterable<string>;
}): UnifiedHomeRow | null {
  const {
    continueItems,
    catalogIndex,
    streamingRows,
    myListPreviews = [],
    excludeKeys,
  } = input;

  const excluded = new Set(excludeKeys ?? []);
  const catalogMap = buildContinueCatalogMap([
    ...catalogIndex,
    ...streamingRows.flatMap((row) => row.items),
  ]);

  const scRows = streamingRows.filter(
    (row) =>
      row.items.length > 0 &&
      (row.key.toLowerCase().startsWith("sc") ||
        row.items.some(isStreamingCommunityPreview)),
  );

  const now = Date.now();
  const genreWeights = new Map<string, number>();
  const preferredTypes = new Map<string, number>();
  const seedKeys = new Set<string>();

  for (const item of continueItems) {
    if ((item.catalogPrefix || "sc").toLowerCase() !== "sc") continue;
    const base = enrichContinuePreviewWithMap(item, catalogMap);
    const match = catalogMap.get(
      `${item.catalogPrefix}:${item.contentType}:${item.titleId}:${item.slug ?? ""}`,
    );
    // Enrich con generi dal catalogo (continue non li porta).
    const preview: StremioMetaPreview = match
      ? {
          ...base,
          genres: [
            ...new Set([...(base.genres ?? []), ...(match.genres ?? [])]),
          ],
          sourceRowKey: base.sourceRowKey ?? match.sourceRowKey,
          sourceRowTitle: base.sourceRowTitle ?? match.sourceRowTitle,
          type: match.type || base.type,
        }
      : base;
    const key = streamingPreviewDedupeKey(preview);
    seedKeys.add(key);
    excluded.add(key);
    const weight = continueRecencyWeight(item.updatedAt, now);
    preferredTypes.set(
      preview.type,
      (preferredTypes.get(preview.type) ?? 0) + weight,
    );
    for (const genre of genresFromPreview(preview)) {
      genreWeights.set(genre, (genreWeights.get(genre) ?? 0) + weight);
    }
  }

  const myListKeys = new Set<string>();
  for (const preview of myListPreviews) {
    if (!isStreamingCommunityPreview(preview)) continue;
    const key = streamingPreviewDedupeKey(preview);
    myListKeys.add(key);
    for (const genre of genresFromPreview(preview)) {
      genreWeights.set(genre, (genreWeights.get(genre) ?? 0) + 0.35);
    }
    preferredTypes.set(
      preview.type,
      (preferredTypes.get(preview.type) ?? 0) + 0.2,
    );
  }

  const hasTaste = genreWeights.size > 0 || preferredTypes.size > 0;

  const byKey = new Map<string, StremioMetaPreview>();
  const candidateBoost = new Map<string, number>();

  const mergeCandidate = (preview: StremioMetaPreview, rowBoost = 0) => {
    if (!isStreamingCommunityPreview(preview)) return;
    const key = streamingPreviewDedupeKey(preview);
    if (excluded.has(key) || seedKeys.has(key)) return;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, preview);
      candidateBoost.set(key, rowBoost);
      return;
    }
    byKey.set(key, {
      ...existing,
      ...preview,
      genres: [
        ...new Set([...(existing.genres ?? []), ...(preview.genres ?? [])]),
      ],
      sourceRowKey: existing.sourceRowKey ?? preview.sourceRowKey,
      sourceRowTitle: existing.sourceRowTitle ?? preview.sourceRowTitle,
      poster: preview.poster ?? existing.poster,
      background: preview.background ?? existing.background,
    });
    candidateBoost.set(
      key,
      Math.max(candidateBoost.get(key) ?? 0, rowBoost),
    );
  };

  for (const row of scRows) {
    const boost = isPriorityScRow(row) ? 1.2 : 0;
    for (const item of row.items) mergeCandidate(item, boost);
  }
  for (const item of catalogIndex) mergeCandidate(item, 0);

  type Scored = { preview: StremioMetaPreview; score: number };
  const scored: Scored[] = [];

  for (const [key, preview] of byKey) {
    let score = candidateBoost.get(key) ?? 0;
    if (myListKeys.has(key)) score += 2.5;

    const typeWeight = preferredTypes.get(preview.type) ?? 0;
    score += typeWeight * 1.1;

    for (const genre of genresFromPreview(preview)) {
      score += (genreWeights.get(genre) ?? 0) * 3.2;
    }

    if (!hasTaste) {
      score += preview.poster ? 0.05 : 0;
    } else if (score < 0.15) {
      continue;
    }

    scored.push({ preview, score });
  }

  scored.sort(
    (a, b) =>
      b.score - a.score || a.preview.name.localeCompare(b.preview.name, "it"),
  );

  let picks = scored.map((s) => s.preview);

  if (picks.length < FOR_YOU_MIN_ITEMS) {
    const filler: StremioMetaPreview[] = [];
    const seen = new Set(picks.map(streamingPreviewDedupeKey));
    for (const key of excluded) seen.add(key);
    for (const key of seedKeys) seen.add(key);

    const pushFiller = (preview: StremioMetaPreview) => {
      if (!isStreamingCommunityPreview(preview)) return;
      const key = streamingPreviewDedupeKey(preview);
      if (seen.has(key)) return;
      seen.add(key);
      filler.push(preview);
    };

    for (const row of [...scRows].sort((a, b) => {
      const sa = isPriorityScRow(a) ? 0 : 1;
      const sb = isPriorityScRow(b) ? 0 : 1;
      return sa - sb;
    })) {
      for (const item of row.items) pushFiller(item);
    }
    for (const item of catalogIndex) pushFiller(item);
    picks = [...picks, ...filler];
  }

  const items: BrowseItem[] = picks
    .slice(0, HOME_ROW_DISPLAY_LIMIT)
    .map((preview) => streamingBrowseItem(preview));

  if (items.length < FOR_YOU_MIN_ITEMS) return null;

  return {
    key: "for-you",
    title: "Per te",
    subtitle: hasTaste
      ? "In base a quello che guardi"
      : "Suggeriti per iniziare",
    items,
  };
}
