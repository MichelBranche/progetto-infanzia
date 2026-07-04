import type { MangaChapterItem } from "../types/mangadex";

const LANG_PRIORITY: Record<string, number> = { it: 0, en: 1 };

function chapterSortKey(chapter: string | null): number {
  if (chapter == null || chapter === "") return Number.POSITIVE_INFINITY;
  const n = Number.parseFloat(chapter);
  return Number.isFinite(n) ? n : Number.POSITIVE_INFINITY;
}

/** Un capitolo per numero, preferendo IT rispetto a EN. */
export function dedupeMangaChapters(chapters: MangaChapterItem[]): MangaChapterItem[] {
  const byNumber = new Map<string, MangaChapterItem>();

  for (const ch of chapters) {
    const key = ch.chapter ?? `__oneshot_${ch.id}`;
    const existing = byNumber.get(key);
    if (!existing) {
      byNumber.set(key, ch);
      continue;
    }
    const existingPri = LANG_PRIORITY[existing.language] ?? 9;
    const nextPri = LANG_PRIORITY[ch.language] ?? 9;
    if (nextPri < existingPri) byNumber.set(key, ch);
  }

  return Array.from(byNumber.values()).sort(
    (a, b) => chapterSortKey(a.chapter) - chapterSortKey(b.chapter),
  );
}
