import { memo, useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Loader2,
  ScrollText,
  X,
} from "lucide-react";
import {
  fetchChapterAtHome,
  fetchMangaChapters,
} from "../lib/mangadexApi";
import { saveMangaProgress } from "../lib/mangaProgress";
import { MangaBookReader } from "./MangaBookReader";
import type { MangaChapterItem } from "../types/mangadex";

const PROGRESS_THROTTLE_MS = 2000;
const PAGE_PRELOAD_MARGIN = "1200px";
const READER_MODE_KEY = "branchefy-manga-reader-mode";

type ReaderMode = "scroll" | "book";

function readSavedMode(): ReaderMode {
  return localStorage.getItem(READER_MODE_KEY) === "book" ? "book" : "scroll";
}

const ReaderPageImage = memo(function ReaderPageImage({
  src,
  index,
}: {
  src: string;
  index: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [shouldLoad, setShouldLoad] = useState(index < 2);

  useEffect(() => {
    if (shouldLoad) return;
    const node = ref.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setShouldLoad(true);
          observer.disconnect();
        }
      },
      { rootMargin: PAGE_PRELOAD_MARGIN },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [shouldLoad]);

  return (
    <div
      ref={ref}
      className="w-full min-h-[70vh] bg-[#14141c] [content-visibility:auto] [contain-intrinsic-size:900px]"
    >
      {shouldLoad ? (
        <img
          src={src}
          alt={`Pagina ${index + 1}`}
          loading={index < 2 ? "eager" : "lazy"}
          decoding="async"
          className="mx-auto block w-full max-w-full"
        />
      ) : null}
    </div>
  );
});

interface MangaReaderPageProps {
  mangaId: string;
  chapterId: string;
  mangaTitle: string;
  profileId: string;
  initialPage?: number;
  /** Consente i capitoli 18+ (solo profili genitore). */
  allowAdult?: boolean;
  onBack: () => void;
  onChapterChange: (chapterId: string, initialPage?: number) => void;
}

export function MangaReaderPage({
  mangaId,
  chapterId,
  mangaTitle,
  profileId,
  initialPage = 0,
  allowAdult = false,
  onBack,
  onChapterChange,
}: MangaReaderPageProps) {
  const [pages, setPages] = useState<string[]>([]);
  const [chapters, setChapters] = useState<MangaChapterItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(initialPage);
  const [mode, setMode] = useState<ReaderMode>(readSavedMode);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef<(HTMLDivElement | null)[]>([]);
  const lastProgressSaveRef = useRef(0);
  const chaptersLoadedRef = useRef(false);

  const chapterIndex = chapters.findIndex((ch) => ch.id === chapterId);
  const chapter = chapterIndex >= 0 ? chapters[chapterIndex] : null;
  const prevChapter = chapterIndex > 0 ? chapters[chapterIndex - 1] : null;
  const nextChapter =
    chapterIndex >= 0 && chapterIndex < chapters.length - 1
      ? chapters[chapterIndex + 1]
      : null;

  useEffect(() => {
    if (chaptersLoadedRef.current) return;
    let cancelled = false;
    void fetchMangaChapters(mangaId, allowAdult).then((list) => {
      if (!cancelled) {
        setChapters(list);
        chaptersLoadedRef.current = true;
      }
    });
    return () => {
      cancelled = true;
    };
  }, [mangaId, allowAdult]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setPages([]);
    setCurrentPage(initialPage);
    pageRefs.current = [];

    void fetchChapterAtHome(chapterId, "dataSaver")
      .then((atHome) => {
        if (cancelled) return;
        setPages(atHome.pages);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [chapterId, initialPage]);

  useEffect(() => {
    const next = chapters[chapterIndex + 1];
    if (!next) return;
    void fetchChapterAtHome(next.id, "dataSaver");
  }, [chapters, chapterIndex]);

  const persistProgress = useCallback(
    (page: number) => {
      const now = Date.now();
      if (now - lastProgressSaveRef.current < PROGRESS_THROTTLE_MS) return;
      lastProgressSaveRef.current = now;
      saveMangaProgress(profileId, {
        mangaId,
        chapterId,
        chapterLabel: chapter?.chapter ?? null,
        page,
        updatedAt: new Date().toISOString(),
      });
    },
    [profileId, mangaId, chapterId, chapter?.chapter],
  );

  const toggleMode = useCallback(() => {
    setMode((prev) => {
      const next = prev === "scroll" ? "book" : "scroll";
      localStorage.setItem(READER_MODE_KEY, next);
      return next;
    });
  }, []);

  const handleBookPageChange = useCallback(
    (page: number) => {
      setCurrentPage(page);
      persistProgress(page);
    },
    [persistProgress],
  );

  useEffect(() => {
    if (pages.length === 0 || mode !== "scroll") return;
    const node = scrollRef.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      (entries) => {
        let bestIdx = -1;
        let bestRatio = 0;
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const idx = pageRefs.current.indexOf(entry.target as HTMLDivElement);
          if (idx >= 0 && entry.intersectionRatio >= bestRatio) {
            bestRatio = entry.intersectionRatio;
            bestIdx = idx;
          }
        }
        if (bestIdx >= 0) {
          setCurrentPage(bestIdx);
          persistProgress(bestIdx);
        }
      },
      { root: node, threshold: [0.35, 0.55, 0.75] },
    );

    for (const el of pageRefs.current) {
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [pages.length, persistProgress, mode]);

  useEffect(() => {
    if (initialPage <= 0 || pages.length === 0 || mode !== "scroll") return;
    const target = pageRefs.current[initialPage];
    if (target) {
      target.scrollIntoView({ block: "start" });
    }
  }, [pages.length, initialPage, mode]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onBack();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onBack]);

  const chapterLabel = chapter
    ? chapter.chapter
      ? `Cap. ${chapter.chapter}`
      : chapter.title ?? "Oneshot"
    : "";

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-void">
        <Loader2 className="h-10 w-10 animate-spin text-[#ff6740]" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-void px-6">
        <p className="text-center text-[14px] text-red-400/90">{error}</p>
        <button
          type="button"
          onClick={onBack}
          className="rounded-lg bg-white/10 px-4 py-2 text-[13px] text-text-primary"
        >
          Indietro
        </button>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#1a1a1a]">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-white/10 bg-void/95 px-4 py-3 backdrop-blur-md">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-2 text-[13px] text-text-secondary hover:text-text-primary"
        >
          <ArrowLeft className="h-4 w-4" />
          <span className="hidden sm:inline">{mangaTitle}</span>
        </button>
        <div className="min-w-0 flex-1 text-center">
          <p className="truncate text-[13px] font-medium text-text-primary">
            {chapterLabel}
          </p>
          <p className="text-[11px] text-text-muted">
            Pagina {currentPage + 1} / {pages.length}
          </p>
        </div>
        <button
          type="button"
          onClick={toggleMode}
          className={`rounded-lg p-2 transition hover:bg-white/10 ${
            mode === "book" ? "text-[#ff6740]" : "text-text-muted hover:text-text-primary"
          }`}
          aria-label={
            mode === "book" ? "Passa allo scorrimento" : "Passa alla modalità libro"
          }
          title={mode === "book" ? "Modalità scorrimento" : "Modalità libro"}
        >
          {mode === "book" ? (
            <ScrollText className="h-5 w-5" />
          ) : (
            <BookOpen className="h-5 w-5" />
          )}
        </button>
        <button
          type="button"
          onClick={onBack}
          className="rounded-lg p-2 text-text-muted hover:bg-white/10 hover:text-text-primary"
          aria-label="Chiudi lettore"
        >
          <X className="h-5 w-5" />
        </button>
      </header>

      {mode === "book" ? (
        <MangaBookReader
          key={chapterId}
          pages={pages}
          title={mangaTitle}
          initialPage={currentPage}
          onPageChange={handleBookPageChange}
        />
      ) : (
        <div
          ref={scrollRef}
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
        >
          <div className="mx-auto flex max-w-3xl flex-col">
            {pages.map((src, index) => (
              <div
                key={`${chapterId}-${index}`}
                ref={(el) => {
                  pageRefs.current[index] = el;
                }}
              >
                <ReaderPageImage src={src} index={index} />
              </div>
            ))}
          </div>
        </div>
      )}

      <footer className="flex shrink-0 items-center justify-between gap-2 border-t border-white/10 bg-void/95 px-4 py-3 backdrop-blur-md">
        <button
          type="button"
          disabled={!prevChapter}
          onClick={() => {
            if (prevChapter) onChapterChange(prevChapter.id, 0);
          }}
          className="flex items-center gap-1 rounded-lg px-3 py-2 text-[12px] text-text-secondary transition hover:bg-white/10 hover:text-text-primary disabled:opacity-30"
        >
          <ChevronLeft className="h-4 w-4" />
          Prec.
        </button>
        <span className="text-[11px] text-text-muted">
          {mode === "book"
            ? "Clicca la pagina o usa le frecce per sfogliare"
            : "Scorri per leggere"}
        </span>
        <button
          type="button"
          disabled={!nextChapter}
          onClick={() => {
            if (nextChapter) onChapterChange(nextChapter.id, 0);
          }}
          className="flex items-center gap-1 rounded-lg px-3 py-2 text-[12px] text-text-secondary transition hover:bg-white/10 hover:text-text-primary disabled:opacity-30"
        >
          Succ.
          <ChevronRight className="h-4 w-4" />
        </button>
      </footer>
    </div>
  );
}
