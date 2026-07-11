import { isTauri } from "@tauri-apps/api/core";
import { runtimeInvoke as invoke } from "./runtimeInvoke";
import type {
  MangaBrowseItem,
  MangaChapterItem,
  MangaDexAtHomeResponse,
  MangaDexChapterAttributes,
  MangaDexCoverArtAttributes,
  MangaDexEntity,
  MangaDexListResponse,
  MangaDexMangaAttributes,
  MangaDexRelationship,
} from "../types/mangadex";
import { mangaDexCache } from "./mangadexCache";
import { dedupeMangaChapters } from "./mangadexChapters";
import packageJson from "../../package.json";

const API_BASE = "https://api.mangadex.org";
const UPLOADS_BASE = "https://uploads.mangadex.org/covers";
const MANGA_USER_AGENT = `Branchefy/${packageJson.version} (https://github.com/MichelBranche/progetto-infanzia)`;

const BASE_RATINGS = ["safe", "suggestive"] as const;
const ADULT_RATINGS = ["safe", "suggestive", "erotica", "pornographic"] as const;
const DEFAULT_LANGS = ["it", "en"] as const;

/** Rating consentiti: i contenuti 18+ solo per profili genitore. */
function ratingsFor(adult: boolean): readonly string[] {
  return adult ? ADULT_RATINGS : BASE_RATINGS;
}

class MangaDexApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "MangaDexApiError";
  }
}

function buildQuery(params: Record<string, string | number | readonly string[]>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) {
      for (const entry of value) search.append(key, entry);
    } else {
      search.set(key, String(value));
    }
  }
  return search.toString();
}

async function mdFetch<T>(path: string, query?: Record<string, string | number | readonly string[]>): Promise<T> {
  const qs = query ? buildQuery(query) : "";

  if (isTauri()) {
    const body = await invoke<string>("mangadex_fetch_cmd", {
      path,
      query: qs || null,
    });
    return JSON.parse(body) as T;
  }

  const suffix = qs ? `?${qs}` : "";
  const res = await fetch(`${API_BASE}${path}${suffix}`, {
    headers: {
      Accept: "application/json",
      "User-Agent": MANGA_USER_AGENT,
    },
  });
  if (!res.ok) {
    throw new MangaDexApiError(`MangaDex API ${res.status}`, res.status);
  }
  return res.json() as Promise<T>;
}

export function localizedText(
  map: Record<string, string | undefined> | undefined,
  fallback = "Senza titolo",
): string {
  if (!map) return fallback;
  return (
    map.it ??
    map["it-IT"] ??
    map.en ??
    map.ja ??
    map["ja-ro"] ??
    Object.values(map).find(Boolean) ??
    fallback
  );
}

export function coverArtFromRelationships(
  mangaId: string,
  relationships?: MangaDexRelationship[],
): string | null {
  const cover = relationships?.find((rel) => rel.type === "cover_art");
  const fileName = (cover?.attributes as MangaDexCoverArtAttributes | undefined)?.fileName;
  if (!fileName) return null;
  return `${UPLOADS_BASE}/${mangaId}/${fileName}`;
}

function mangaToBrowseItem(
  entity: MangaDexEntity<MangaDexMangaAttributes>,
  extra?: Partial<MangaBrowseItem>,
  options?: { includeDescription?: boolean },
): MangaBrowseItem {
  const includeDescription = options?.includeDescription ?? false;
  return {
    id: entity.id,
    title: localizedText(entity.attributes.title),
    coverUrl: coverArtFromRelationships(entity.id, entity.relationships),
    status: entity.attributes.status,
    year: entity.attributes.year,
    contentRating: entity.attributes.contentRating,
    description: includeDescription
      ? localizedText(entity.attributes.description, "")
      : undefined,
    ...extra,
  };
}

function browseCacheKey(kind: string, offset: number, limit: number, extra = "") {
  return `${kind}:${offset}:${limit}:${extra}`;
}

export interface MangaDexPage<T> {
  items: T[];
  offset: number;
  limit: number;
  total: number;
  hasMore: boolean;
}

export async function fetchPopularManga(
  offset = 0,
  limit = 48,
  adult = false,
): Promise<MangaDexPage<MangaBrowseItem>> {
  const cacheKey = browseCacheKey("popular", offset, limit, adult ? "18" : "");
  const cached = mangaDexCache.browse<MangaDexPage<MangaBrowseItem>>(cacheKey);
  if (cached) return cached;

  const data = await mdFetch<MangaDexListResponse<MangaDexMangaAttributes>>("/manga", {
    limit,
    offset,
    "includes[]": "cover_art",
    "order[followedCount]": "desc",
    "contentRating[]": ratingsFor(adult),
    "availableTranslatedLanguage[]": DEFAULT_LANGS,
    hasAvailableChapters: "true",
  });

  const page = {
    items: data.data.map((entity) => mangaToBrowseItem(entity)),
    offset: data.offset,
    limit: data.limit,
    total: data.total,
    hasMore: data.offset + data.data.length < data.total,
  };
  mangaDexCache.setBrowse(cacheKey, page);
  return page;
}

export async function searchManga(
  query: string,
  offset = 0,
  limit = 48,
  adult = false,
): Promise<MangaDexPage<MangaBrowseItem>> {
  const trimmed = query.trim();
  if (!trimmed) {
    return { items: [], offset: 0, limit, total: 0, hasMore: false };
  }

  const cacheKey = browseCacheKey(
    "search",
    offset,
    limit,
    `${trimmed.toLowerCase()}:${adult ? "18" : ""}`,
  );
  const cached = mangaDexCache.browse<MangaDexPage<MangaBrowseItem>>(cacheKey);
  if (cached) return cached;

  const data = await mdFetch<MangaDexListResponse<MangaDexMangaAttributes>>("/manga", {
    limit,
    offset,
    title: trimmed,
    "includes[]": "cover_art",
    "order[relevance]": "desc",
    "contentRating[]": ratingsFor(adult),
    "availableTranslatedLanguage[]": DEFAULT_LANGS,
    hasAvailableChapters: "true",
  });

  const page = {
    items: data.data.map((entity) => mangaToBrowseItem(entity)),
    offset: data.offset,
    limit: data.limit,
    total: data.total,
    hasMore: data.offset + data.data.length < data.total,
  };
  mangaDexCache.setBrowse(cacheKey, page);
  return page;
}

export async function fetchLatestMangaUpdates(
  offset = 0,
  limit = 32,
  adult = false,
): Promise<MangaDexPage<MangaBrowseItem>> {
  const cacheKey = browseCacheKey("updates", offset, limit, adult ? "18" : "");
  const cached = mangaDexCache.browse<MangaDexPage<MangaBrowseItem>>(cacheKey);
  if (cached) return cached;

  const data = await mdFetch<MangaDexListResponse<MangaDexMangaAttributes>>("/manga", {
    limit,
    offset,
    "includes[]": "cover_art",
    "order[updatedAt]": "desc",
    "contentRating[]": ratingsFor(adult),
    "availableTranslatedLanguage[]": DEFAULT_LANGS,
    hasAvailableChapters: "true",
  });

  const page = {
    items: data.data.map((entity) =>
      mangaToBrowseItem(entity, {
        latestChapter: entity.attributes.lastChapter
          ? `Cap. ${entity.attributes.lastChapter}`
          : undefined,
      }),
    ),
    offset: data.offset,
    limit: data.limit,
    total: data.total,
    hasMore: data.offset + data.data.length < data.total,
  };
  mangaDexCache.setBrowse(cacheKey, page);
  return page;
}

export async function fetchNewManga(
  offset = 0,
  limit = 32,
  adult = false,
): Promise<MangaDexPage<MangaBrowseItem>> {
  const cacheKey = browseCacheKey("new", offset, limit, adult ? "18" : "");
  const cached = mangaDexCache.browse<MangaDexPage<MangaBrowseItem>>(cacheKey);
  if (cached) return cached;

  const data = await mdFetch<MangaDexListResponse<MangaDexMangaAttributes>>("/manga", {
    limit,
    offset,
    "includes[]": "cover_art",
    "order[createdAt]": "desc",
    "contentRating[]": ratingsFor(adult),
    "availableTranslatedLanguage[]": DEFAULT_LANGS,
    hasAvailableChapters: "true",
  });

  const page = {
    items: data.data.map((entity) => mangaToBrowseItem(entity)),
    offset: data.offset,
    limit: data.limit,
    total: data.total,
    hasMore: data.offset + data.data.length < data.total,
  };
  mangaDexCache.setBrowse(cacheKey, page);
  return page;
}

export async function fetchCompletedManga(
  offset = 0,
  limit = 32,
  adult = false,
): Promise<MangaDexPage<MangaBrowseItem>> {
  const cacheKey = browseCacheKey("completed", offset, limit, adult ? "18" : "");
  const cached = mangaDexCache.browse<MangaDexPage<MangaBrowseItem>>(cacheKey);
  if (cached) return cached;

  const data = await mdFetch<MangaDexListResponse<MangaDexMangaAttributes>>("/manga", {
    limit,
    offset,
    "includes[]": "cover_art",
    status: ["completed"],
    "order[followedCount]": "desc",
    "contentRating[]": ratingsFor(adult),
    "availableTranslatedLanguage[]": DEFAULT_LANGS,
    hasAvailableChapters: "true",
  });

  const page = {
    items: data.data.map((entity) => mangaToBrowseItem(entity)),
    offset: data.offset,
    limit: data.limit,
    total: data.total,
    hasMore: data.offset + data.data.length < data.total,
  };
  mangaDexCache.setBrowse(cacheKey, page);
  return page;
}

export async function fetchMangaByTag(
  tagId: string,
  offset = 0,
  limit = 32,
  adult = false,
): Promise<MangaDexPage<MangaBrowseItem>> {
  const cacheKey = browseCacheKey(`tag:${tagId}`, offset, limit, adult ? "18" : "");
  const cached = mangaDexCache.browse<MangaDexPage<MangaBrowseItem>>(cacheKey);
  if (cached) return cached;

  const data = await mdFetch<MangaDexListResponse<MangaDexMangaAttributes>>("/manga", {
    limit,
    offset,
    "includes[]": "cover_art",
    "includedTags[]": tagId,
    "order[followedCount]": "desc",
    "contentRating[]": ratingsFor(adult),
    "availableTranslatedLanguage[]": DEFAULT_LANGS,
    hasAvailableChapters: "true",
  });

  const page = {
    items: data.data.map((entity) => mangaToBrowseItem(entity)),
    offset: data.offset,
    limit: data.limit,
    total: data.total,
    hasMore: data.offset + data.data.length < data.total,
  };
  mangaDexCache.setBrowse(cacheKey, page);
  return page;
}

export async function fetchMangaDetail(mangaId: string): Promise<MangaBrowseItem> {
  const cached = mangaDexCache.detail<MangaBrowseItem>(mangaId);
  if (cached) return cached;

  const data = await mdFetch<{ data: MangaDexEntity<MangaDexMangaAttributes> }>(
    `/manga/${mangaId}`,
    { "includes[]": "cover_art" },
  );
  const item = mangaToBrowseItem(data.data, undefined, { includeDescription: true });
  mangaDexCache.setDetail(mangaId, item);
  return item;
}

export async function fetchMangaChapters(
  mangaId: string,
  adult = false,
): Promise<MangaChapterItem[]> {
  const cacheKey = `${mangaId}:${adult ? "18" : ""}`;
  const cached = mangaDexCache.chapters<MangaChapterItem[]>(cacheKey);
  if (cached) return cached;

  const data = await mdFetch<MangaDexListResponse<MangaDexChapterAttributes>>(
    `/manga/${mangaId}/feed`,
    {
      limit: 500,
      offset: 0,
      "translatedLanguage[]": DEFAULT_LANGS,
      "contentRating[]": ratingsFor(adult),
      "order[chapter]": "asc",
    },
  );

  const chapters = dedupeMangaChapters(
    data.data.map((chapter) => ({
      id: chapter.id,
      mangaId,
      title: chapter.attributes.title,
      chapter: chapter.attributes.chapter,
      volume: chapter.attributes.volume,
      pages: chapter.attributes.pages,
      language: chapter.attributes.translatedLanguage,
      publishAt: chapter.attributes.publishAt,
    })),
  );
  mangaDexCache.setChapters(cacheKey, chapters);
  return chapters;
}

export async function fetchChapterAtHome(
  chapterId: string,
  quality: "data" | "dataSaver" = "dataSaver",
): Promise<{
  pages: string[];
  baseUrl: string;
}> {
  const cacheKey = `${chapterId}:${quality}`;
  const cached = mangaDexCache.atHome<{ pages: string[]; baseUrl: string }>(cacheKey);
  if (cached) return cached;

  const data = await mdFetch<MangaDexAtHomeResponse>(`/at-home/server/${chapterId}`);
  const { baseUrl, chapter } = data;
  const folder = quality === "dataSaver" ? "data-saver" : "data";
  const files = quality === "dataSaver" ? chapter.dataSaver : chapter.data;
  const pages = files.map((file) => `${baseUrl}/${folder}/${chapter.hash}/${file}`);
  const result = { pages, baseUrl };
  mangaDexCache.setAtHome(cacheKey, result);
  return result;
}
