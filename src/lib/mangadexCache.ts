type CacheEntry<T> = { value: T; expiresAt: number };

function get<T>(map: Map<string, CacheEntry<T>>, key: string): T | null {
  const entry = map.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    map.delete(key);
    return null;
  }
  return entry.value;
}

function set<T>(map: Map<string, CacheEntry<T>>, key: string, value: T, ttlMs: number) {
  map.set(key, { value, expiresAt: Date.now() + ttlMs });
}

const TTL = {
  browse: 5 * 60_000,
  detail: 15 * 60_000,
  chapters: 15 * 60_000,
  atHome: 60 * 60_000,
} as const;

const browseCache = new Map<string, CacheEntry<unknown>>();
const detailCache = new Map<string, CacheEntry<unknown>>();
const chaptersCache = new Map<string, CacheEntry<unknown>>();
const atHomeCache = new Map<string, CacheEntry<unknown>>();

export const mangaDexCache = {
  browse<T>(key: string): T | null {
    return get(browseCache, key) as T | null;
  },
  setBrowse<T>(key: string, value: T) {
    set(browseCache, key, value, TTL.browse);
  },

  detail<T>(mangaId: string): T | null {
    return get(detailCache, mangaId) as T | null;
  },
  setDetail<T>(mangaId: string, value: T) {
    set(detailCache, mangaId, value, TTL.detail);
  },

  chapters<T>(mangaId: string): T | null {
    return get(chaptersCache, mangaId) as T | null;
  },
  setChapters<T>(mangaId: string, value: T) {
    set(chaptersCache, mangaId, value, TTL.chapters);
  },

  atHome<T>(chapterId: string): T | null {
    return get(atHomeCache, chapterId) as T | null;
  },
  setAtHome<T>(chapterId: string, value: T) {
    set(atHomeCache, chapterId, value, TTL.atHome);
  },
};

/** Cache risultati per tab nel catalogo (evita refetch al cambio scheda). */
export type MangaTabCacheState = {
  items: import("../types/mangadex").MangaBrowseItem[];
  total: number;
  offset: number;
  hasMore: boolean;
};

const tabStateCache = new Map<string, MangaTabCacheState>();

export function getMangaTabCache(key: string): MangaTabCacheState | null {
  return tabStateCache.get(key) ?? null;
}

export function setMangaTabCache(key: string, state: MangaTabCacheState) {
  tabStateCache.set(key, state);
}
