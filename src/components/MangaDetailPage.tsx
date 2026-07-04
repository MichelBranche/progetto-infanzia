import { memo, useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, BookOpen, Check, Loader2, Plus } from "lucide-react";
import type { MangaBrowseItem, MangaChapterItem } from "../types/mangadex";
import { fetchMangaChapters, fetchMangaDetail } from "../lib/mangadexApi";
import { isMangaSaved, toggleSavedManga } from "../lib/mangaLibrary";
import { getMangaProgress } from "../lib/mangaProgress";

const statusLabel: Record<string, string> = {
  ongoing: "In corso",
  completed: "Completato",
  hiatus: "In pausa",
  cancelled: "Cancellato",
};

function chapterDisplay(ch: MangaChapterItem): string {
  if (ch.chapter && ch.title) return `Cap. ${ch.chapter} — ${ch.title}`;
  if (ch.chapter) return `Capitolo ${ch.chapter}`;
  if (ch.title) return ch.title;
  return "Oneshot";
}

const ChapterRow = memo(function ChapterRow({
  chapter,
  mangaId,
  isCurrent,
  onReadChapter,
}: {
  chapter: MangaChapterItem;
  mangaId: string;
  isCurrent: boolean;
  onReadChapter: (mangaId: string, chapterId: string, chapterLabel: string | null) => void;
}) {
  return (
    <li className="[content-visibility:auto] [contain-intrinsic-size:48px]">
      <button
        type="button"
        onClick={() => onReadChapter(mangaId, chapter.id, chapter.chapter)}
        className={`flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-white/[0.04] ${
          isCurrent ? "bg-[#ff6740]/10" : ""
        }`}
      >
        <span className="text-[14px] text-text-primary">
          {chapterDisplay(chapter)}
        </span>
        <span className="shrink-0 text-[11px] uppercase tracking-wide text-text-muted">
          {chapter.language}
          {isCurrent ? " · in lettura" : ""}
        </span>
      </button>
    </li>
  );
});

interface MangaDetailPageProps {
  mangaId: string;
  profileId: string;
  initialItem?: MangaBrowseItem;
  /** Consente i capitoli 18+ (solo profili genitore). */
  allowAdult?: boolean;
  onBack: () => void;
  onReadChapter: (mangaId: string, chapterId: string, chapterLabel: string | null) => void;
}

export function MangaDetailPage({
  mangaId,
  profileId,
  initialItem,
  allowAdult = false,
  onBack,
  onReadChapter,
}: MangaDetailPageProps) {
  const initialRef = useRef(initialItem);
  const [manga, setManga] = useState<MangaBrowseItem | null>(initialItem ?? null);
  const [chapters, setChapters] = useState<MangaChapterItem[]>([]);
  const [detailLoading, setDetailLoading] = useState(!initialItem);
  const [chaptersLoading, setChaptersLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(() => isMangaSaved(profileId, mangaId));
  const progress = getMangaProgress(profileId, mangaId);

  const handleToggleSave = useCallback(() => {
    if (!manga) return;
    setSaved(toggleSavedManga(profileId, manga));
  }, [profileId, manga]);

  useEffect(() => {
    let cancelled = false;

    const seed = initialRef.current;
    if (!seed?.description) {
      setDetailLoading(true);
      void fetchMangaDetail(mangaId)
        .then((detail) => {
          if (!cancelled) setManga(detail);
        })
        .catch((err) => {
          if (!cancelled && !seed) {
            setError(err instanceof Error ? err.message : String(err));
          }
        })
        .finally(() => {
          if (!cancelled) setDetailLoading(false);
        });
    }

    setChaptersLoading(true);
    void fetchMangaChapters(mangaId, allowAdult)
      .then((list) => {
        if (!cancelled) setChapters(list);
      })
      .catch((err) => {
        if (!cancelled) {
          setError((prev) => prev ?? (err instanceof Error ? err.message : String(err)));
        }
      })
      .finally(() => {
        if (!cancelled) setChaptersLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [mangaId, allowAdult]);

  const resumeChapter = progress
    ? chapters.find((ch) => ch.id === progress.chapterId)
    : null;

  if (detailLoading && !manga) {
    return (
      <div className="flex justify-center py-32">
        <Loader2 className="h-8 w-8 animate-spin text-[#ff6740]" />
      </div>
    );
  }

  if (error && !manga) {
    return (
      <div className="page-px pb-16 pt-24 sm:pt-28">
        <p className="text-center text-[13px] text-red-400/90">{error}</p>
      </div>
    );
  }

  if (!manga) return null;

  return (
    <div className="page-px pb-16 pt-24 text-center sm:pt-28">
      <div className="mx-auto w-full max-w-3xl">
        <button
          type="button"
          onClick={onBack}
          className="mx-auto mb-6 flex items-center gap-2 text-[13px] text-text-secondary transition hover:text-text-primary"
        >
          <ArrowLeft className="h-4 w-4" />
          Torna al catalogo
        </button>

        <div className="flex flex-col items-center gap-6">
          <div className="w-40 shrink-0 sm:w-48">
            <div className="aspect-[2/3] overflow-hidden rounded-xl ring-1 ring-white/10">
              {manga.coverUrl ? (
                <img
                  src={manga.coverUrl}
                  alt={manga.title}
                  loading="eager"
                  decoding="async"
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full items-center justify-center bg-gradient-to-br from-orange-950 to-rose-950 p-4 text-center text-sm text-white/70">
                  {manga.title}
                </div>
              )}
            </div>
          </div>

          <div className="min-w-0 w-full">
            <h1 className="font-display text-2xl font-semibold tracking-[-0.03em] text-text-primary sm:text-3xl">
              {manga.title}
            </h1>
            <div className="mt-2 flex flex-wrap justify-center gap-2 text-[12px] text-text-muted">
            {manga.status && (
              <span className="rounded-full bg-white/[0.06] px-2.5 py-0.5">
                {statusLabel[manga.status] ?? manga.status}
              </span>
            )}
            {manga.year && (
              <span className="rounded-full bg-white/[0.06] px-2.5 py-0.5">
                {manga.year}
              </span>
            )}
            <span className="rounded-full bg-white/[0.06] px-2.5 py-0.5">
              {chaptersLoading ? "…" : chapters.length} capitoli
            </span>
          </div>

          {manga.description && (
            <p className="mt-4 line-clamp-6 text-[14px] leading-relaxed text-text-secondary">
              {manga.description}
            </p>
          )}

          <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
            {resumeChapter && (
              <button
                type="button"
                onClick={() =>
                  onReadChapter(mangaId, resumeChapter.id, resumeChapter.chapter)
                }
                className="flex items-center gap-2 rounded-xl bg-[#ff6740] px-5 py-2.5 text-[14px] font-semibold text-white transition hover:bg-[#ff7a55]"
              >
                <BookOpen className="h-4 w-4" />
                Continua da {chapterDisplay(resumeChapter)}
              </button>
            )}
            <button
              type="button"
              onClick={handleToggleSave}
              className={`flex items-center gap-2 rounded-xl px-5 py-2.5 text-[14px] font-semibold transition ${
                saved
                  ? "bg-white/10 text-text-primary ring-1 ring-[#ff6740]/50"
                  : "bg-white/[0.06] text-text-secondary ring-1 ring-white/10 hover:bg-white/10 hover:text-text-primary"
              }`}
            >
              {saved ? (
                <Check className="h-4 w-4 text-[#ff6740]" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              {saved ? "Nella tua lista" : "Salva nella lista"}
            </button>
          </div>
        </div>
        </div>

        <div className="mt-10">
          <h2 className="font-display text-lg font-semibold text-text-primary">
            Capitoli
          </h2>
          {chaptersLoading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-[#ff6740]" />
            </div>
          ) : chapters.length === 0 ? (
            <p className="mt-4 text-[13px] text-text-muted">
              Nessun capitolo disponibile in italiano o inglese.
            </p>
          ) : (
            <ul className="mt-4 divide-y divide-white/[0.06] rounded-xl border border-white/[0.06] bg-white/[0.02] text-left">
              {chapters.map((ch) => (
                <ChapterRow
                  key={ch.id}
                  chapter={ch}
                  mangaId={mangaId}
                  isCurrent={progress?.chapterId === ch.id}
                  onReadChapter={onReadChapter}
                />
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
