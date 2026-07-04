import type { MangaReadProgress } from "../types/mangadex";

const STORAGE_PREFIX = "branchefy-manga-progress";

function storageKey(profileId: string) {
  return `${STORAGE_PREFIX}:${profileId}`;
}

export function readMangaProgress(profileId: string): Record<string, MangaReadProgress> {
  try {
    const raw = localStorage.getItem(storageKey(profileId));
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, MangaReadProgress>;
  } catch {
    return {};
  }
}

export function saveMangaProgress(
  profileId: string,
  progress: MangaReadProgress,
): void {
  const all = readMangaProgress(profileId);
  all[progress.mangaId] = progress;
  localStorage.setItem(storageKey(profileId), JSON.stringify(all));
}

export function getMangaProgress(
  profileId: string,
  mangaId: string,
): MangaReadProgress | null {
  return readMangaProgress(profileId)[mangaId] ?? null;
}
