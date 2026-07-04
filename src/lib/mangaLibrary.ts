import type { MangaBrowseItem } from "../types/mangadex";

const STORAGE_PREFIX = "branchefy-manga-saved";

function storageKey(profileId: string) {
  return `${STORAGE_PREFIX}:${profileId}`;
}

export function readSavedManga(profileId: string): MangaBrowseItem[] {
  try {
    const raw = localStorage.getItem(storageKey(profileId));
    if (!raw) return [];
    return JSON.parse(raw) as MangaBrowseItem[];
  } catch {
    return [];
  }
}

export function isMangaSaved(profileId: string, mangaId: string): boolean {
  return readSavedManga(profileId).some((item) => item.id === mangaId);
}

/** Aggiunge o rimuove un manga dalla lista. Ritorna true se ora è salvato. */
export function toggleSavedManga(
  profileId: string,
  item: MangaBrowseItem,
): boolean {
  const list = readSavedManga(profileId);
  const index = list.findIndex((entry) => entry.id === item.id);
  if (index >= 0) {
    list.splice(index, 1);
    localStorage.setItem(storageKey(profileId), JSON.stringify(list));
    return false;
  }
  // In cima alla lista, senza descrizione per non gonfiare lo storage.
  list.unshift({ ...item, description: undefined });
  localStorage.setItem(storageKey(profileId), JSON.stringify(list));
  return true;
}
