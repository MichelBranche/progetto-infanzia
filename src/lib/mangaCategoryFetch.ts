import type { MangaCategory, MangaCategoryPreset } from "./mangaCategories";
import {
  fetchCompletedManga,
  fetchLatestMangaUpdates,
  fetchMangaByTag,
  fetchNewManga,
  fetchPopularManga,
  type MangaDexPage,
} from "./mangadexApi";
import type { MangaBrowseItem } from "../types/mangadex";
import { readSavedManga } from "./mangaLibrary";

export async function fetchMangaCategoryPage(
  category: MangaCategory,
  profileId: string,
  offset: number,
  limit: number,
  adult: boolean,
): Promise<MangaDexPage<MangaBrowseItem>> {
  if (category.preset === "saved") {
    const all = readSavedManga(profileId);
    const items = all.slice(offset, offset + limit);
    return {
      items,
      offset,
      limit,
      total: all.length,
      hasMore: offset + items.length < all.length,
    };
  }

  const preset = category.preset as MangaCategoryPreset | undefined;
  switch (preset) {
    case "updates":
      return fetchLatestMangaUpdates(offset, limit, adult);
    case "popular":
      return fetchPopularManga(offset, limit, adult);
    case "new":
      return fetchNewManga(offset, limit, adult);
    case "completed":
      return fetchCompletedManga(offset, limit, adult);
    default:
      if (category.tagId) {
        return fetchMangaByTag(category.tagId, offset, limit, adult);
      }
      return { items: [], offset, limit, total: 0, hasMore: false };
  }
}
