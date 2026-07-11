import type { MediaCollection, MediaItem } from "../types/media";
import type {
  StremioMetaPreview,
  StreamingContinueItem,
} from "../types/stremio";
import type { BrowseItem } from "./browse";
import { browseItemId, isWatchInProgress, toBrowseItems } from "./browse";
import { isHeroEligibleLocalItem, isHeroPriorityLocalItem, isHeroPriorityPreview, isScHeroWithLogo } from "./heroImage";
import type { StreamingRow } from "./useStreamingCatalogs";
import { decodeHtmlEntities } from "./htmlText";
import {
  continueToPreview,
  streamingBrowseItem,
  streamingPreviewDedupeKey,
} from "./streamingBrowse";

export type LibraryMediaType = "film" | "serie" | "cartone";

const ANIMATION_CONTEXT =
  /anim|cartoon|carton|anime|bambin|kid|family|famiglia|disney|pixar|dreamworks|nickelodeon|miyazaki|sc-genre-animation|sc-genre-family|sc-genre-kids/i;

export function isCartoniCatalogPreview(preview: StremioMetaPreview): boolean {
  return preview.catalogPrefix === "loonex" || preview.catalogPrefix === "youtube";
}

function parseYear(releaseInfo?: string): number | undefined {
  if (!releaseInfo) return undefined;
  const match = releaseInfo.match(/\d{4}/);
  return match ? Number(match[0]) : undefined;
}

function isAnimationContext(context?: {
  rowKey?: string;
  rowTitle?: string;
}): boolean {
  if (!context) return false;
  const text = `${context.rowKey ?? ""} ${context.rowTitle ?? ""}`.toLowerCase();
  return ANIMATION_CONTEXT.test(text);
}

function isAnimationFromGenres(genres?: string[]): boolean {
  if (!genres?.length) return false;
  return genres.some((genre) => ANIMATION_CONTEXT.test(genre));
}

function resolveStreamingContext(
  preview: StremioMetaPreview,
  context?: { rowKey?: string; rowTitle?: string },
): { rowKey?: string; rowTitle?: string } {
  return {
    rowKey: context?.rowKey ?? preview.sourceRowKey,
    rowTitle: context?.rowTitle ?? preview.sourceRowTitle,
  };
}

export function isAnimationStreamingPreview(
  preview: StremioMetaPreview,
  context?: { rowKey?: string; rowTitle?: string },
): boolean {
  if (preview.catalogPrefix === "loonex") return true;
  if (preview.catalogPrefix === "youtube") return true;
  const resolved = resolveStreamingContext(preview, context);
  return (
    isAnimationContext(resolved) || isAnimationFromGenres(preview.genres)
  );
}

/** Cartoni section: solo cataloghi Loonex e YouTube. */
export function isCartoniStreamingPreview(
  preview: StremioMetaPreview,
  _context?: { rowKey?: string; rowTitle?: string },
): boolean {
  return isCartoniCatalogPreview(preview);
}

export function isCartoniBrowseItem(item: BrowseItem): boolean {
  return item.kind === "streaming" && isCartoniCatalogPreview(item.preview);
}

export function classifyStreamingMediaType(
  preview: StremioMetaPreview,
  context?: { rowKey?: string; rowTitle?: string },
): LibraryMediaType {
  const animated = isAnimationStreamingPreview(preview, context);
  if (preview.type === "movie") {
    return animated ? "cartone" : "film";
  }
  if (preview.type === "series" || preview.type === "channel") {
    return animated ? "cartone" : "serie";
  }
  return "film";
}

export function enrichStreamingPreview(
  preview: StremioMetaPreview,
  context?: { rowKey?: string; rowTitle?: string },
): StremioMetaPreview {
  const resolved = resolveStreamingContext(preview, context);
  const mediaType = classifyStreamingMediaType(preview, resolved);
  return {
    ...preview,
    name: decodeHtmlEntities(preview.name),
    description: preview.description
      ? decodeHtmlEntities(preview.description)
      : preview.description,
    mediaType,
    sourceRowKey: resolved.rowKey ?? preview.sourceRowKey,
    sourceRowTitle: resolved.rowTitle ?? preview.sourceRowTitle,
  };
}

export function streamingProgressKey(
  preview: Pick<StremioMetaPreview, "catalogPrefix" | "type" | "id">,
): string {
  return `${preview.catalogPrefix ?? "sc"}:${preview.type}:${preview.id}`;
}

export function buildStreamingProgressMap(
  continueItems: StreamingContinueItem[],
): Map<string, StreamingContinueItem> {
  const map = new Map<string, StreamingContinueItem>();
  for (const item of continueItems) {
    const key = `${item.catalogPrefix}:${item.contentType}:${item.titleId}`;
    const existing = map.get(key);
    if (!existing || item.updatedAt.localeCompare(existing.updatedAt) > 0) {
      map.set(key, item);
    }
  }
  return map;
}

export function applyStreamingProgress(
  preview: StremioMetaPreview,
  progressMap: Map<string, StreamingContinueItem>,
): StremioMetaPreview {
  const item = progressMap.get(streamingProgressKey(preview));
  if (!item) return preview;
  if (preview.type === "movie") {
    return {
      ...preview,
      watchPosition: item.positionSecs,
      watchDuration: item.durationSecs,
    };
  }
  const episodeId = preview.resumeVideoId?.trim();
  if (episodeId && item.videoId !== episodeId) {
    return preview;
  }
  return {
    ...preview,
    watchPosition: item.positionSecs,
    watchDuration: item.durationSecs,
    resumeVideoId: episodeId || item.videoId,
  };
}

export function flattenEnrichedStreaming(
  rows: StreamingRow[],
  progressMap?: Map<string, StreamingContinueItem>,
): StremioMetaPreview[] {
  const seen = new Set<string>();
  const result: StremioMetaPreview[] = [];

  for (const row of rows) {
    for (const item of row.items) {
      const key = streamingPreviewDedupeKey(item);
      if (seen.has(key)) continue;
      seen.add(key);
      const enriched = enrichStreamingPreview(item, {
        rowKey: row.key,
        rowTitle: row.title,
      });
      result.push(
        progressMap ? applyStreamingProgress(enriched, progressMap) : enriched,
      );
    }
  }

  return result;
}

export function streamingInCapsula(preview: StremioMetaPreview): boolean {
  const year = parseYear(preview.releaseInfo);
  return year != null && year < 2005;
}

export function dedupeBrowseItems(items: BrowseItem[]): BrowseItem[] {
  const seen = new Set<string>();
  const result: BrowseItem[] = [];
  for (const item of items) {
    const id = browseItemId(item);
    if (seen.has(id)) continue;
    seen.add(id);
    result.push(item);
  }
  return result;
}

export const MIN_HOME_ROW_ITEMS = 8;
export const HOME_ROW_DISPLAY_LIMIT = 20;
const ROWS_SKIP_MIN = new Set(["continue", "favorites"]);

export function shuffleArray<T>(items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function stableBrowseItems(items: BrowseItem[]): BrowseItem[] {
  return [...items].sort((a, b) =>
    browseItemId(a).localeCompare(browseItemId(b)),
  );
}

export function buildRandomHeroItems(
  localItems: MediaItem[],
  streamingPreviews: StremioMetaPreview[],
  toMediaItem: (preview: StremioMetaPreview) => MediaItem,
  count = 8,
): MediaItem[] {
  const seen = new Set<string>();
  const priority: MediaItem[] = [];
  const secondary: MediaItem[] = [];

  const push = (item: MediaItem, preferred: boolean) => {
    if (seen.has(item.id)) return;
    seen.add(item.id);
    (preferred ? priority : secondary).push(item);
  };

  for (const item of localItems) {
    if (!isHeroEligibleLocalItem(item)) continue;
    push(item, isHeroPriorityLocalItem(item));
  }
  for (const preview of streamingPreviews) {
    if (!isScHeroWithLogo(preview)) continue;
    push(toMediaItem(preview), isHeroPriorityPreview(preview));
  }

  const priorityPool = shuffleArray(priority);
  const secondaryPool = shuffleArray(secondary);

  if (priorityPool.length >= count) {
    return priorityPool.slice(0, count);
  }

  return [
    ...priorityPool,
    ...secondaryPool.slice(0, Math.max(0, count - priorityPool.length)),
  ];
}

const COLLECTION_STREAMING_TYPES: Record<
  string,
  LibraryMediaType[] | "capsula" | "all" | "mylist"
> = {
  continue: "all",
  "new-films": ["film"],
  "new-episodes": ["serie", "cartone"],
  film: ["film"],
  cartoni: ["cartone"],
  serie: ["serie"],
  discover: "all",
  favorites: "mylist",
  "dad-picks": "all",
  "mom-picks": "all",
  classics: "capsula",
  capsula: "capsula",
};

function previewMatchesCollection(
  collectionId: string,
  preview: StremioMetaPreview,
): boolean {
  const rule = COLLECTION_STREAMING_TYPES[collectionId];
  if (!rule || rule === "mylist") return false;
  if (rule === "all") return true;
  if (rule === "capsula") return streamingInCapsula(preview);
  if (collectionId === "cartoni") {
    return isCartoniStreamingPreview(preview);
  }
  return rule.includes(preview.mediaType as LibraryMediaType);
}

function padHomeRowItems(
  items: BrowseItem[],
  collectionId: string,
  catalog: StremioMetaPreview[],
  usedStreamingIds: Set<string>,
): BrowseItem[] {
  const ordered = stableBrowseItems(items);
  if (ordered.length >= MIN_HOME_ROW_ITEMS) {
    return ordered.slice(0, HOME_ROW_DISPLAY_LIMIT);
  }

  const seen = new Set(ordered.map(browseItemId));
  const padded = [...ordered];
  const pool = [...catalog]
    .filter((preview) => {
      const key = streamingPreviewDedupeKey(preview);
      if (usedStreamingIds.has(key)) return false;
      return (
        collectionId === "discover" ||
        previewMatchesCollection(collectionId, preview)
      );
    })
    .sort((a, b) =>
      `${a.type}:${a.id}`.localeCompare(`${b.type}:${b.id}`),
    );

  for (const preview of pool) {
    if (padded.length >= HOME_ROW_DISPLAY_LIMIT) break;
    const browse = streamingBrowseItem(preview);
    const id = browseItemId(browse);
    if (seen.has(id)) continue;
    seen.add(id);
    padded.push(browse);
    usedStreamingIds.add(streamingPreviewDedupeKey(preview));
  }

  return stableBrowseItems(padded).slice(0, HOME_ROW_DISPLAY_LIMIT);
}

function isGenreStreamingContext(context: {
  rowKey?: string;
  rowTitle?: string;
}): boolean {
  const text = `${context.rowKey ?? ""} ${context.rowTitle ?? ""}`.toLowerCase();
  return text.includes("sc-genre-") || /\bgenre\b/.test(text);
}

function buildStreamingContextByKey(
  streamingRows: StreamingRow[],
): Map<string, { rowKey: string; rowTitle: string }> {
  const contextByKey = new Map<string, { rowKey: string; rowTitle: string }>();
  for (const row of streamingRows) {
    const context = { rowKey: row.key, rowTitle: row.title };
    for (const item of row.items) {
      const key = `${item.type}:${item.id}`;
      const existing = contextByKey.get(key);
      if (!existing) {
        contextByKey.set(key, context);
        continue;
      }
      if (isGenreStreamingContext(context) && !isGenreStreamingContext(existing)) {
        contextByKey.set(key, context);
        continue;
      }
      if (isAnimationContext(context) && !isAnimationContext(existing)) {
        contextByKey.set(key, context);
      }
    }
  }
  return contextByKey;
}

function streamingPreviewContextKey(preview: StremioMetaPreview): string {
  return `${preview.type}:${preview.id}`;
}

function streamingForCartoniCatalog(
  previews: StremioMetaPreview[],
  contextByKey: Map<string, { rowKey: string; rowTitle: string }>,
  streamingRows: StreamingRow[],
): BrowseItem[] {
  const seen = new Set<string>();
  const result: BrowseItem[] = [];

  const push = (
    preview: StremioMetaPreview,
    context?: { rowKey: string; rowTitle: string },
  ) => {
    if (!isCartoniCatalogPreview(preview)) return;
    const key = streamingPreviewDedupeKey(preview);
    if (seen.has(key)) return;
    const resolved =
      context ?? contextByKey.get(streamingPreviewContextKey(preview));
    seen.add(key);
    result.push(
      streamingBrowseItem(enrichStreamingPreview(preview, resolved)),
    );
  };

  for (const preview of previews) {
    push(preview);
  }

  for (const row of streamingRows) {
    const context = { rowKey: row.key, rowTitle: row.title };
    for (const item of row.items) {
      push(item, context);
    }
  }

  return result;
}

function streamingForTypes(
  previews: StremioMetaPreview[],
  types: LibraryMediaType[],
): BrowseItem[] {
  return previews
    .filter((preview) => types.includes(preview.mediaType as LibraryMediaType))
    .map((preview) => streamingBrowseItem(preview));
}

function localBrowseForCollection(collection: MediaCollection): BrowseItem[] {
  const grouped =
    collection.id === "cartoni" ||
    collection.id === "serie" ||
    collection.id === "new-episodes" ||
    collection.id.startsWith("tag-");

  if (grouped) {
    return toBrowseItems(collection.items);
  }
  return collection.items.map((item) => ({ kind: "media" as const, item }));
}

function streamingForCollection(
  collectionId: string,
  previews: StremioMetaPreview[],
): BrowseItem[] {
  const rule = COLLECTION_STREAMING_TYPES[collectionId];
  if (!rule) {
    if (collectionId.startsWith("tag-")) {
      return streamingForTypes(previews, ["film", "serie", "cartone"]);
    }
    return [];
  }
  if (rule === "all") {
    return previews.map((preview) => streamingBrowseItem(preview));
  }
  if (rule === "capsula") {
    return previews.filter(streamingInCapsula).map(streamingBrowseItem);
  }
  if (rule === "mylist") {
    return [];
  }
  if (collectionId === "cartoni") {
    return previews
      .filter((preview) => isCartoniStreamingPreview(preview))
      .map(streamingBrowseItem);
  }
  return streamingForTypes(previews, rule);
}

export function mergeCollectionBrowseItems(
  collection: MediaCollection,
  streamingPreviews: StremioMetaPreview[],
  limit = HOME_ROW_DISPLAY_LIMIT,
): BrowseItem[] {
  const local = localBrowseForCollection(collection);
  const streaming = streamingForCollection(collection.id, streamingPreviews);
  return stableBrowseItems(dedupeBrowseItems([...local, ...streaming])).slice(
    0,
    limit,
  );
}

export function mergeContinueBrowseItems(
  localItems: MediaItem[],
  continueItems: StreamingContinueItem[],
): BrowseItem[] {
  const progressMap = buildStreamingProgressMap(continueItems);
  const streaming = continueItems
    .filter((item) => item.positionSecs > 5)
    .map((item) =>
      streamingBrowseItem(enrichStreamingPreview(continueToPreview(item))),
    );
  const local = toBrowseItems(localItems);
  const merged = dedupeContinueBrowseItems([...streaming, ...local]);
  return merged.sort((a, b) =>
    continueBrowseUpdatedAt(b, progressMap).localeCompare(
      continueBrowseUpdatedAt(a, progressMap),
    ),
  );
}

function continueBrowseUpdatedAt(
  item: BrowseItem,
  progressMap: Map<string, StreamingContinueItem>,
): string {
  if (item.kind === "streaming") {
    const key = streamingProgressKey(item.preview);
    return progressMap.get(key)?.updatedAt ?? "";
  }
  if (item.kind === "media") {
    return item.item.watchUpdatedAt ?? "";
  }
  return item.representative.watchUpdatedAt ?? "";
}

export function buildContinueBrowseItems(
  collections: MediaCollection[],
  continueItems: StreamingContinueItem[],
  allLocalItems: MediaItem[] = [],
): BrowseItem[] {
  return mergeContinueBrowseItems(
    getLocalContinueItems(collections, allLocalItems),
    continueItems,
  );
}

function continueItemScore(item: BrowseItem): number {
  if (item.kind === "streaming") {
    const pos = item.preview.watchPosition ?? 0;
    if (pos > 5) return 3;
    if (item.preview.resumeVideoId) return 2;
    return 1;
  }
  if (item.kind === "media" && isWatchInProgress(item.item)) return 2;
  if (item.kind === "series") {
    const rep = item.representative;
    if (isWatchInProgress(rep)) return 2;
  }
  return 0;
}

function dedupeContinueBrowseItems(items: BrowseItem[]): BrowseItem[] {
  const byId = new Map<string, BrowseItem>();
  for (const item of items) {
    const id = browseItemId(item);
    const existing = byId.get(id);
    if (!existing || continueItemScore(item) > continueItemScore(existing)) {
      byId.set(id, item);
    }
  }
  return [...byId.values()];
}

function compareContinueUpdated(a: MediaItem, b: MediaItem) {
  const aTs = a.watchUpdatedAt ?? "";
  const bTs = b.watchUpdatedAt ?? "";
  return bTs.localeCompare(aTs);
}

export function getLocalContinueItems(
  collections: MediaCollection[],
  allLocalItems: MediaItem[],
): MediaItem[] {
  const fromCollection =
    collections.find((collection) => collection.id === "continue")?.items ?? [];
  const fromScan = allLocalItems.filter(isWatchInProgress);
  const byId = new Map<string, MediaItem>();

  for (const item of [...fromCollection, ...fromScan]) {
    byId.set(item.id, item);
  }

  return [...byId.values()].sort(compareContinueUpdated);
}

export interface UnifiedHomeRow {
  key: string;
  title: string;
  subtitle: string;
  items: BrowseItem[];
}

function streamingCatalogHomeRows(
  streamingRows: StreamingRow[],
  usedStreamingIds: Set<string>,
  markUsed: (items: BrowseItem[]) => void,
  progressMap: Map<string, StreamingContinueItem>,
): UnifiedHomeRow[] {
  const rows: UnifiedHomeRow[] = [];
  const minItems = 4;

  for (const streamRow of streamingRows) {
    const items = streamRow.items
      .filter(
        (preview) =>
          !usedStreamingIds.has(streamingPreviewDedupeKey(preview)),
      )
      .map((preview) =>
        streamingBrowseItem(
          applyStreamingProgress(
            enrichStreamingPreview(preview, {
              rowKey: streamRow.key,
              rowTitle: streamRow.title,
            }),
            progressMap,
          ),
        ),
      )
      .slice(0, HOME_ROW_DISPLAY_LIMIT);

    if (items.length < minItems) continue;

    markUsed(items);
    rows.push({
      key: `streaming-row-${streamRow.key}`,
      title: streamRow.title,
      subtitle: streamRow.subtitle || "In streaming",
      items,
    });
  }

  return rows;
}

export function buildUnifiedHomeRows(
  collections: MediaCollection[],
  streamingRows: StreamingRow[],
  continueItems: StreamingContinueItem[],
  allLocalItems: MediaItem[] = [],
  streamingListPreviews: StremioMetaPreview[] = [],
  catalogIndex: StremioMetaPreview[] = [],
  options?: { mergeStreaming?: boolean; includeContinue?: boolean },
): UnifiedHomeRow[] {
  const mergeStreaming = options?.mergeStreaming ?? true;
  const includeContinue = options?.includeContinue ?? true;
  const progressMap = buildStreamingProgressMap(continueItems);
  const enriched = mergeStreaming
    ? flattenEnrichedStreaming(streamingRows, progressMap)
    : [];
  const catalog = catalogIndex.map((preview) =>
    applyStreamingProgress(enrichStreamingPreview(preview), progressMap),
  );
  const usedStreamingIds = new Set<string>();

  const markUsed = (items: BrowseItem[]) => {
    for (const item of items) {
      if (item.kind === "streaming") {
        usedStreamingIds.add(streamingPreviewDedupeKey(item.preview));
      }
    }
  };

  const rows: UnifiedHomeRow[] = [];
  const continueRowItems = includeContinue
    ? buildContinueBrowseItems(collections, continueItems, allLocalItems)
    : [];

  if (includeContinue && continueRowItems.length > 0) {
    markUsed(continueRowItems);
    rows.push({
      key: "continue",
      title: "Continua a guardare",
      subtitle: "Riprendi da dove eri rimasto · Locale e streaming",
      items: continueRowItems,
    });
  }

  if (mergeStreaming) {
    rows.push(
      ...streamingCatalogHomeRows(
        streamingRows,
        usedStreamingIds,
        markUsed,
        progressMap,
      ),
    );
  }

  for (const collection of collections) {
    if (collection.id === "continue") {
      continue;
    }

    const availableStreaming = enriched.filter(
      (preview) => !usedStreamingIds.has(streamingPreviewDedupeKey(preview)),
    );
    let items: BrowseItem[];
    if (mergeStreaming) {
      items =
        collection.id === "favorites"
          ? dedupeBrowseItems([
              ...localBrowseForCollection(collection),
              ...streamingListPreviews.map((preview) =>
                streamingBrowseItem(
                  applyStreamingProgress(
                    enrichStreamingPreview(preview),
                    progressMap,
                  ),
                ),
              ),
            ])
          : mergeCollectionBrowseItems(collection, availableStreaming);
    } else {
      items =
        collection.id === "favorites"
          ? dedupeBrowseItems([
              ...localBrowseForCollection(collection),
              ...streamingListPreviews.map((preview) =>
                streamingBrowseItem(
                  applyStreamingProgress(
                    enrichStreamingPreview(preview),
                    progressMap,
                  ),
                ),
              ),
            ])
          : localBrowseForCollection(collection);
    }

    if (items.length === 0 && catalog.length > 0 && mergeStreaming) {
      items = padHomeRowItems(
        [],
        collection.id,
        catalog,
        usedStreamingIds,
      );
    } else if (mergeStreaming && catalog.length > 0) {
      items = padHomeRowItems(
        items,
        collection.id,
        catalog,
        usedStreamingIds,
      );
    } else if (items.length > 1) {
      items = stableBrowseItems(items);
    }

    if (items.length === 0) continue;
    markUsed(items);
    rows.push({
      key: collection.id,
      title: collection.title,
      subtitle:
        collection.id === "favorites"
          ? "Titoli salvati con + per guardarli dopo"
          : mergeStreaming
            ? `${collection.subtitle} · Locale e streaming`
            : collection.subtitle,
      items,
    });
  }

  if (mergeStreaming) {
    const leftover = enriched.filter(
      (preview) => !usedStreamingIds.has(streamingPreviewDedupeKey(preview)),
    );
    const discoverItems = padHomeRowItems(
      leftover.map((preview) => streamingBrowseItem(preview)),
      "discover",
      catalog,
      usedStreamingIds,
    );
    if (discoverItems.length >= MIN_HOME_ROW_ITEMS) {
      rows.push({
        key: "streaming-discover",
        title: "Da scoprire",
        subtitle: "Locale e streaming · Titoli da esplorare",
        items: discoverItems,
      });
    }
  }

  return rows.filter((row) =>
    ROWS_SKIP_MIN.has(row.key)
      ? row.items.length > 0
      : row.items.length >= MIN_HOME_ROW_ITEMS,
  );
}

export function mergedSectionBrowseItems(
  section: string,
  localItems: MediaItem[],
  catalogPreviews: StremioMetaPreview[],
  scSearchResults: StremioMetaPreview[],
  streamingRows: StreamingRow[] = [],
): BrowseItem[] {
  const contextByKey = buildStreamingContextByKey(streamingRows);
  const enrich = (preview: StremioMetaPreview) => {
    const context = contextByKey.get(`${preview.type}:${preview.id}`);
    return enrichStreamingPreview(preview, context);
  };
  const enriched = catalogPreviews.map(enrich);
  const searchStreaming = scSearchResults.map(enrich);

  if (section === "film") {
    const local = localItems.map((item) => ({ kind: "media" as const, item }));
    const streaming = streamingForTypes(enriched, ["film"]);
    return dedupeBrowseItems([...local, ...streaming]);
  }

  if (section === "cartoni") {
    const streaming = streamingForCartoniCatalog(
      enriched,
      contextByKey,
      streamingRows,
    );
    return dedupeBrowseItems(streaming);
  }

  if (section === "serie") {
    const local = toBrowseItems(localItems);
    const streaming = streamingForTypes(enriched, ["serie"]);
    return dedupeBrowseItems([...local, ...streaming]);
  }

  if (section === "capsula") {
    const local = localItems.map((item) => ({ kind: "media" as const, item }));
    const streaming = enriched
      .filter(streamingInCapsula)
      .map(streamingBrowseItem);
    return dedupeBrowseItems([...local, ...streaming]);
  }

  if (section === "search") {
    const local = toBrowseItems(localItems);
    const streaming = searchStreaming.map(streamingBrowseItem);
    return dedupeBrowseItems([...local, ...streaming]);
  }

  return localItems.map((item) => ({ kind: "media" as const, item }));
}

const MIN_CARTONI_HOME_ROW_ITEMS = 4;

export function buildCartoniHomeRow(
  localItems: MediaItem[],
  catalogPreviews: StremioMetaPreview[],
  streamingRows: StreamingRow[] = [],
): UnifiedHomeRow | null {
  const items = mergedSectionBrowseItems(
    "cartoni",
    localItems,
    catalogPreviews,
    [],
    streamingRows,
  );
  if (items.length < MIN_CARTONI_HOME_ROW_ITEMS) {
    return null;
  }
  return {
    key: "home-cartoni",
    title: "Cartoni",
    subtitle: "Loonex e YouTube",
    items: items.slice(0, HOME_ROW_DISPLAY_LIMIT),
  };
}

export function insertCartoniHomeRow(
  rows: UnifiedHomeRow[],
  cartoniRow: UnifiedHomeRow,
  isDuplicateRow: (key: string, title: string) => boolean,
): UnifiedHomeRow[] {
  const filtered = rows.filter(
    (row) => !isDuplicateRow(row.key, row.title),
  );
  const cartoniSlot = rows.findIndex((row) => row.key === "cartoni");
  if (cartoniSlot < 0) {
    const mid = Math.max(0, Math.floor(filtered.length / 2));
    return [
      ...filtered.slice(0, mid),
      cartoniRow,
      ...filtered.slice(mid),
    ];
  }

  let insertAt = 0;
  for (let i = 0; i < cartoniSlot; i++) {
    if (!isDuplicateRow(rows[i].key, rows[i].title)) {
      insertAt += 1;
    }
  }

  const next = [...filtered];
  next.splice(insertAt, 0, cartoniRow);
  return next;
}
