import type { BrowseItem } from "./browse";
import { browseItemMedia, browseItemTitle } from "./browse";
import { isCartoniBrowseItem } from "./unifiedBrowse";
import type { StremioMetaPreview } from "../types/stremio";

export type CartoniGridFilter = "all" | "popular" | "local" | "streaming";

export interface CartoniCollection {
  label: string;
  items: BrowseItem[];
}

export interface CartoniBrowseLayout {
  heroPosters: string[];
  communityPick: BrowseItem | null;
  novita: BrowseItem[];
  collections: CartoniCollection[];
  popular: BrowseItem[];
  local: BrowseItem[];
  streaming: BrowseItem[];
  all: BrowseItem[];
}

const COLLECTION_SKIP = new Set([
  "Classici su YouTube",
  "Archivio Cartoni",
  "In streaming · Cartoni",
  "Altri titoli",
  "Animazione",
  "Animation",
]);

export interface CartoniBrowseStats {
  total: number;
  loonex: number;
  streaming: number;
  local: number;
}

export function cartoniBrowseStats(items: BrowseItem[]): CartoniBrowseStats {
  let loonex = 0;
  let youtube = 0;
  for (const item of items) {
    if (item.kind !== "streaming") continue;
    if (item.preview.catalogPrefix === "loonex") loonex += 1;
    if (item.preview.catalogPrefix === "youtube") youtube += 1;
  }
  return {
    total: items.length,
    loonex,
    streaming: loonex + youtube,
    local: 0,
  };
}

export const GRID_PAGE_SIZE = 20;

function onlyCartoni(items: BrowseItem[]): BrowseItem[] {
  return items.filter(isCartoniBrowseItem);
}

function hasPoster(item: BrowseItem): boolean {
  return Boolean(browseItemMedia(item).posterUrl?.trim());
}

function isLoonex(
  item: BrowseItem,
): item is Extract<BrowseItem, { kind: "streaming" }> {
  return item.kind === "streaming" && item.preview.catalogPrefix === "loonex";
}

function isYoutube(
  item: BrowseItem,
): item is Extract<BrowseItem, { kind: "streaming" }> {
  return item.kind === "streaming" && item.preview.catalogPrefix === "youtube";
}

function isCatalogStreaming(item: BrowseItem): boolean {
  return isLoonex(item) || isYoutube(item);
}

function withResume(item: BrowseItem): boolean {
  if (item.kind !== "streaming") {
    const media = browseItemMedia(item);
    return (media.watchPosition ?? 0) > 30;
  }
  return (item.preview.watchPosition ?? 0) > 30 || Boolean(item.preview.inMyList);
}

export function buildCartoniBrowseLayout(items: BrowseItem[]): CartoniBrowseLayout {
  const cartoniItems = onlyCartoni(items);
  const streaming = cartoniItems.filter(isCatalogStreaming);

  const loonex = streaming.filter(isLoonex);
  const youtube = streaming.filter(isYoutube);
  const withPoster = cartoniItems.filter(hasPoster);

  const heroPosters = withPoster
    .slice(0, 8)
    .map((item) => browseItemMedia(item).posterUrl!)
    .filter(Boolean);

  const communityPick =
    loonex.find((item) => item.preview.description?.trim()) ??
    loonex[0] ??
    youtube[0] ??
    withPoster[0] ??
    cartoniItems[0] ??
    null;

  const novita = (loonex.length > 0 ? loonex : youtube.length > 0 ? youtube : streaming).slice(
    0,
    14,
  );

  const popular = [...cartoniItems]
    .filter(withResume)
    .concat(streaming.filter((item) => !withResume(item)))
    .filter((item, index, arr) => arr.indexOf(item) === index)
    .slice(0, 14);

  const byRow = new Map<string, BrowseItem[]>();
  for (const item of streaming) {
    if (item.kind !== "streaming") continue;
    const row = item.preview.sourceRowTitle?.trim();
    if (!row || COLLECTION_SKIP.has(row)) continue;
    const list = byRow.get(row) ?? [];
    if (!list.includes(item)) list.push(item);
    byRow.set(row, list);
  }

  const collections = [...byRow.entries()]
    .filter(([, list]) => list.length >= 3)
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 6)
    .map(([label, list]) => ({ label, items: list.slice(0, 12) }));

  return {
    heroPosters,
    communityPick,
    novita,
    collections,
    popular: popular.length > 0 ? popular : streaming.slice(0, 14),
    local: [],
    streaming,
    all: cartoniItems,
  };
}

export function filterCartoniGrid(
  items: BrowseItem[],
  filter: CartoniGridFilter,
): BrowseItem[] {
  const cartoniItems = onlyCartoni(items);
  switch (filter) {
    case "local":
      return cartoniItems.filter(
        (item) => item.kind === "streaming" && item.preview.catalogPrefix === "youtube",
      );
    case "streaming":
      return cartoniItems.filter(
        (item) => item.kind === "streaming" && item.preview.catalogPrefix === "loonex",
      );
    case "popular":
      return cartoniItems.filter(withResume).length > 0
        ? cartoniItems.filter(withResume)
        : cartoniItems.slice(0, 40);
    default:
      return cartoniItems;
  }
}

export function paginateCartoniGrid<T>(items: T[], page: number, pageSize = GRID_PAGE_SIZE) {
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * pageSize;
  return {
    page: safePage,
    totalPages,
    items: items.slice(start, start + pageSize),
  };
}

export function cartoniItemSubtitle(item: BrowseItem): string | undefined {
  if (item.kind === "series") {
    return `${item.episodeCount} episodi`;
  }
  if (item.kind === "streaming") {
    return item.preview.releaseInfo?.trim() || item.preview.sourceRowTitle;
  }
  const media = browseItemMedia(item);
  if (media.seriesTitle) return media.seriesTitle;
  return undefined;
}

export function openBrowseItem(
  item: BrowseItem,
  handlers: {
    onPlay: (id: string) => void;
    onPlayStreaming?: (preview: StremioMetaPreview) => void;
    onOpenDetail?: (browse: BrowseItem) => void;
    onOpenSeries?: (seriesKey: string) => void;
  },
) {
  if (item.kind === "streaming") {
    if (handlers.onOpenDetail) handlers.onOpenDetail(item);
    else handlers.onPlayStreaming?.(item.preview);
    return;
  }
  if (item.kind === "series" && handlers.onOpenSeries) {
    handlers.onOpenSeries(`${item.series.mediaType}::${item.series.seriesTitle}`);
    return;
  }
  if (item.kind === "media") {
    handlers.onPlay(item.item.id);
  }
}

export { browseItemTitle };
