import type { StremioMetaPreview, StreamingContinueItem, StreamingWatchProgressInput } from "../types/stremio";
import type { StreamingListInput } from "./myList";
import { streamingListKey } from "./myList";

const WATCH_KEY = "branchefy-dev-streaming-watch";
const LIST_KEY = "branchefy-dev-streaming-list";

type WatchStore = Record<string, StreamingContinueItem[]>;
type ListStore = Record<string, StremioMetaPreview[]>;

function readWatchStore(): WatchStore {
  try {
    const raw = localStorage.getItem(WATCH_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as WatchStore;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeWatchStore(store: WatchStore) {
  localStorage.setItem(WATCH_KEY, JSON.stringify(store));
}

function readListStore(): ListStore {
  try {
    const raw = localStorage.getItem(LIST_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as ListStore;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeListStore(store: ListStore) {
  localStorage.setItem(LIST_KEY, JSON.stringify(store));
}

function watchProgressKey(input: StreamingWatchProgressInput): string {
  return `${input.catalogPrefix}:${input.contentType}:${input.titleId}:${input.slug}:${input.videoId}`;
}

function toContinueItem(
  input: StreamingWatchProgressInput,
): StreamingContinueItem {
  const now = new Date().toISOString();
  return {
    catalogPrefix: input.catalogPrefix,
    contentType: input.contentType,
    titleId: input.titleId,
    slug: input.slug,
    videoId: input.videoId,
    titleName: input.titleName,
    episodeLabel: input.episodeLabel,
    poster: input.poster,
    positionSecs: input.positionSecs,
    durationSecs: input.durationSecs,
    updatedAt: now,
  };
}

function listInputToPreview(item: StreamingListInput): StremioMetaPreview {
  return {
    id: item.titleId,
    type: item.contentType,
    name: item.name,
    poster: item.poster,
    catalogPrefix: item.catalogPrefix,
    slug: item.slug,
    mediaType: item.mediaType,
    releaseInfo: item.releaseInfo,
    inMyList: true,
  };
}

export function saveDevStreamingWatchProgress(
  profileId: string,
  input: StreamingWatchProgressInput,
): void {
  const store = readWatchStore();
  const items = [...(store[profileId] ?? [])];
  const key = watchProgressKey(input);
  const next = toContinueItem(input);
  const index = items.findIndex(
    (item) =>
      `${item.catalogPrefix}:${item.contentType}:${item.titleId}:${item.slug}:${item.videoId}` ===
      key,
  );
  if (index >= 0) {
    items[index] = next;
  } else {
    items.push(next);
  }
  store[profileId] = items.sort(
    (a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt),
  );
  writeWatchStore(store);
}

export function listDevStreamingWatchHistory(
  profileId: string,
  limit = 50,
): StreamingContinueItem[] {
  const items = readWatchStore()[profileId] ?? [];
  return items
    .filter((item) => item.positionSecs > 5)
    .slice(0, limit);
}

export function listDevStreamingList(profileId: string): StremioMetaPreview[] {
  return readListStore()[profileId] ?? [];
}

export function toggleDevStreamingList(
  profileId: string,
  item: StreamingListInput,
): boolean {
  const store = readListStore();
  const items = [...(store[profileId] ?? [])];
  const preview = listInputToPreview(item);
  const key = streamingListKey(preview);
  const index = items.findIndex((entry) => streamingListKey(entry) === key);
  if (index >= 0) {
    items.splice(index, 1);
    store[profileId] = items;
    writeListStore(store);
    return false;
  }
  items.push(preview);
  store[profileId] = items;
  writeListStore(store);
  return true;
}
