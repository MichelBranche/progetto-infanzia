import type { MediaCollection, MediaItem } from "../types/media";
import type {
  StremioMetaPreview,
  StreamingContinueItem,
} from "../types/stremio";
import type { BrowseItem } from "./browse";
import { browseItemId, isWatchInProgress, toBrowseItems } from "./browse";
import type { StreamingRow } from "./useStreamingCatalogs";
import {
  continueToPreview,
  streamingBrowseItem,
} from "./streamingBrowse";

export type LibraryMediaType = "film" | "serie" | "cartone";

const ANIMATION_CONTEXT =
  /anim|cartoon|carton|anime|bambin|kid|family|disney|pixar|dreamworks|nickelodeon|miyazaki|sc-genre-animation|sc-genre-family|sc-genre-kids/i;

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

export function classifyStreamingMediaType(
  preview: StremioMetaPreview,
  context?: { rowKey?: string; rowTitle?: string },
): LibraryMediaType {
  const animated = isAnimationContext(context);
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
  const mediaType = classifyStreamingMediaType(preview, context);
  return {
    ...preview,
    mediaType,
    sourceRowKey: context?.rowKey ?? preview.sourceRowKey,
    sourceRowTitle: context?.rowTitle ?? preview.sourceRowTitle,
  };
}

export function flattenEnrichedStreaming(
  rows: StreamingRow[],
): StremioMetaPreview[] {
  const seen = new Set<string>();
  const result: StremioMetaPreview[] = [];

  for (const row of rows) {
    for (const item of row.items) {
      const key = `${item.type}:${item.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(
        enrichStreamingPreview(item, {
          rowKey: row.key,
          rowTitle: row.title,
        }),
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
export const HOME_ROW_DISPLAY_LIMIT = 32;
const ROWS_SKIP_MIN = new Set(["continue", "favorites"]);

export function shuffleArray<T>(items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function buildRandomHeroItems(
  localItems: MediaItem[],
  streamingPreviews: StremioMetaPreview[],
  toMediaItem: (preview: StremioMetaPreview) => MediaItem,
  count = 8,
): MediaItem[] {
  const byId = new Map<string, MediaItem>();
  for (const item of localItems) {
    byId.set(item.id, item);
  }
  for (const preview of streamingPreviews) {
    const item = toMediaItem(preview);
    byId.set(item.id, item);
  }
  return shuffleArray([...byId.values()]).slice(0, count);
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
  return rule.includes(preview.mediaType as LibraryMediaType);
}

function padHomeRowItems(
  items: BrowseItem[],
  collectionId: string,
  catalog: StremioMetaPreview[],
  usedStreamingIds: Set<string>,
): BrowseItem[] {
  const shuffled = shuffleArray(items);
  if (shuffled.length >= MIN_HOME_ROW_ITEMS) {
    return shuffled.slice(0, HOME_ROW_DISPLAY_LIMIT);
  }

  const seen = new Set(shuffled.map(browseItemId));
  const padded = [...shuffled];
  const pool = shuffleArray(
    catalog.filter((preview) => {
      const key = `${preview.type}:${preview.id}`;
      if (usedStreamingIds.has(key)) return false;
      return (
        collectionId === "discover" ||
        previewMatchesCollection(collectionId, preview)
      );
    }),
  );

  for (const preview of pool) {
    if (padded.length >= HOME_ROW_DISPLAY_LIMIT) break;
    const browse = streamingBrowseItem(preview);
    const id = browseItemId(browse);
    if (seen.has(id)) continue;
    seen.add(id);
    padded.push(browse);
    usedStreamingIds.add(`${preview.type}:${preview.id}`);
  }

  return shuffleArray(padded).slice(0, HOME_ROW_DISPLAY_LIMIT);
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
  return streamingForTypes(previews, rule);
}

export function mergeCollectionBrowseItems(
  collection: MediaCollection,
  streamingPreviews: StremioMetaPreview[],
  limit = HOME_ROW_DISPLAY_LIMIT,
): BrowseItem[] {
  const local = localBrowseForCollection(collection);
  const streaming = streamingForCollection(collection.id, streamingPreviews);
  return shuffleArray(dedupeBrowseItems([...local, ...streaming])).slice(0, limit);
}

export function mergeContinueBrowseItems(
  localItems: MediaItem[],
  continueItems: StreamingContinueItem[],
): BrowseItem[] {
  const streaming = continueItems.map((item) =>
    streamingBrowseItem(enrichStreamingPreview(continueToPreview(item))),
  );
  const local = toBrowseItems(localItems);
  return dedupeContinueBrowseItems([...streaming, ...local]);
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
): UnifiedHomeRow[] {
  const rows: UnifiedHomeRow[] = [];

  for (const streamRow of streamingRows) {
    const items = streamRow.items
      .filter(
        (preview) =>
          !usedStreamingIds.has(`${preview.type}:${preview.id}`),
      )
      .map((preview) =>
        streamingBrowseItem(
          enrichStreamingPreview(preview, {
            rowKey: streamRow.key,
            rowTitle: streamRow.title,
          }),
        ),
      )
      .slice(0, HOME_ROW_DISPLAY_LIMIT);

    if (items.length < MIN_HOME_ROW_ITEMS) continue;

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
  options?: { mergeStreaming?: boolean },
): UnifiedHomeRow[] {
  const mergeStreaming = options?.mergeStreaming ?? true;
  const enriched = mergeStreaming ? flattenEnrichedStreaming(streamingRows) : [];
  const catalog = catalogIndex.map((preview) => enrichStreamingPreview(preview));
  const usedStreamingIds = new Set<string>();

  const markUsed = (items: BrowseItem[]) => {
    for (const item of items) {
      if (item.kind === "streaming") {
        usedStreamingIds.add(`${item.preview.type}:${item.preview.id}`);
      }
    }
  };

  const rows: UnifiedHomeRow[] = [];
  const localContinue = getLocalContinueItems(collections, allLocalItems);
  const continueRowItems = mergeContinueBrowseItems(
    localContinue,
    continueItems,
  );

  if (continueRowItems.length > 0) {
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
      ...streamingCatalogHomeRows(streamingRows, usedStreamingIds, markUsed),
    );
  }

  for (const collection of collections) {
    if (collection.id === "continue") {
      continue;
    }

    const availableStreaming = enriched.filter(
      (preview) => !usedStreamingIds.has(`${preview.type}:${preview.id}`),
    );
    let items: BrowseItem[];
    if (mergeStreaming) {
      items =
        collection.id === "favorites"
          ? dedupeBrowseItems([
              ...localBrowseForCollection(collection),
              ...streamingListPreviews.map((preview) =>
                streamingBrowseItem(enrichStreamingPreview(preview)),
              ),
            ])
          : mergeCollectionBrowseItems(collection, availableStreaming);
    } else {
      items =
        collection.id === "favorites"
          ? dedupeBrowseItems([
              ...localBrowseForCollection(collection),
              ...streamingListPreviews.map((preview) =>
                streamingBrowseItem(enrichStreamingPreview(preview)),
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
      items = shuffleArray(items);
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
      (preview) => !usedStreamingIds.has(`${preview.type}:${preview.id}`),
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
): BrowseItem[] {
  const enriched = catalogPreviews.map((preview) => enrichStreamingPreview(preview));
  const searchStreaming = scSearchResults.map((preview) =>
    enrichStreamingPreview(preview),
  );

  if (section === "film") {
    const local = localItems.map((item) => ({ kind: "media" as const, item }));
    const streaming = streamingForTypes(enriched, ["film"]);
    return dedupeBrowseItems([...local, ...streaming]);
  }

  if (section === "serie" || section === "cartoni") {
    const mediaType: LibraryMediaType =
      section === "cartoni" ? "cartone" : "serie";
    const local = toBrowseItems(localItems);
    const streaming = streamingForTypes(enriched, [mediaType]);
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
