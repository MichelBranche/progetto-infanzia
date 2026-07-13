import { useCallback, useEffect, useState } from "react";
import {
  ArrowLeft,
  BookOpen,
  Headphones,
  Loader2,
  ScrollText,
  X,
} from "lucide-react";
import type { WelibBook } from "../types/welib";
import {
  detectBookRenderKind,
  renderPdfPagesFromArrayBuffer,
  sniffBookKind,
} from "../lib/bookPageRenderer";
import { welibAudioStreamUrl, welibBookStreamUrl } from "../lib/welibApi";
import { MangaBookReader } from "./MangaBookReader";
import { EpubPaginatedReader } from "./EpubPaginatedReader";

const READER_MODE_KEY = "branchefy-book-reader-mode";

type ReaderMode = "scroll" | "book";
type ReaderKind = "read" | "listen";

function readSavedMode(): ReaderMode {
  return localStorage.getItem(READER_MODE_KEY) === "scroll" ? "scroll" : "book";
}

interface BookReaderPageProps {
  book: WelibBook;
  kind: ReaderKind;
  onBack: () => void;
}

export function BookReaderPage({ book, kind, onBack }: BookReaderPageProps) {
  const [mode, setMode] = useState<ReaderMode>(readSavedMode);
  const [loading, setLoading] = useState(kind === "read");
  const [error, setError] = useState<string | null>(null);
  const [pages, setPages] = useState<string[]>([]);
  const [renderKind, setRenderKind] = useState<"pdf" | "epub" | "unknown">("unknown");
  const [progressLabel, setProgressLabel] = useState("");
  const [epubBlobUrl, setEpubBlobUrl] = useState<string | null>(null);

  const bookUrl = welibBookStreamUrl(book.md5, book.format);
  const audioUrl = welibAudioStreamUrl(book.md5);

  useEffect(() => {
    if (kind !== "read") return;
    let cancelled = false;
    let blobUrl: string | null = null;
    setLoading(true);
    setError(null);
    setPages([]);
    setEpubBlobUrl(null);

    void (async () => {
      try {
        setProgressLabel("Download libro in memoria…");
        const response = await fetch(bookUrl);
        if (!response.ok) {
          throw new Error(`Libro non disponibile (${response.status})`);
        }
        const buffer = await response.arrayBuffer();
        if (cancelled) return;

        const sniffed = sniffBookKind(buffer);
        const contentType = response.headers.get("content-type");
        const resolved =
          sniffed !== "unknown"
            ? sniffed
            : detectBookRenderKind(book.format, contentType);

        if (resolved === "epub") {
          blobUrl = URL.createObjectURL(
            new Blob([buffer], { type: "application/epub+zip" }),
          );
          setEpubBlobUrl(blobUrl);
          setRenderKind("epub");
          setLoading(false);
          return;
        }

        if (resolved !== "pdf") {
          throw new Error("Formato non supportato in anteprima. Prova un PDF o EPUB.");
        }

        setRenderKind("pdf");
        const rendered = await renderPdfPagesFromArrayBuffer(buffer, (current, total) => {
          if (!cancelled) setProgressLabel(`Pagina ${current} / ${total}`);
        });
        if (!cancelled) {
          setPages(rendered);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      if (blobUrl) URL.revokeObjectURL(blobUrl);
      setEpubBlobUrl((prev) => {
        if (prev && prev !== blobUrl) URL.revokeObjectURL(prev);
        return null;
      });
    };
  }, [book.format, book.md5, bookUrl, kind]);

  const toggleMode = useCallback(() => {
    setMode((prev) => {
      const next = prev === "scroll" ? "book" : "scroll";
      localStorage.setItem(READER_MODE_KEY, next);
      return next;
    });
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onBack();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onBack]);

  if (kind === "listen") {
    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-[#1a1a1a]">
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-white/10 bg-void/95 px-4 py-3 backdrop-blur-md">
          <button
            type="button"
            onClick={onBack}
            className="flex items-center gap-2 text-[13px] text-text-secondary hover:text-text-primary"
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden sm:inline">{book.title}</span>
          </button>
          <div className="min-w-0 flex-1 text-center">
            <p className="truncate text-[13px] font-medium text-text-primary">Audiolibro</p>
            <p className="text-[11px] text-text-muted">Streaming online</p>
          </div>
          <button
            type="button"
            onClick={onBack}
            className="rounded-lg p-2 text-text-muted hover:bg-white/10 hover:text-text-primary"
            aria-label="Chiudi"
          >
            <X className="h-5 w-5" />
          </button>
        </header>
        <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6">
          <div className="flex h-32 w-24 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-950 to-teal-950">
            <Headphones className="h-10 w-10 text-emerald-300" />
          </div>
          <div className="max-w-lg text-center">
            <h2 className="text-lg font-semibold text-text-primary">{book.title}</h2>
            <p className="mt-2 text-[13px] text-text-muted">
              Ascolto in streaming: nessun file viene scaricato sul dispositivo.
            </p>
          </div>
          <audio
            controls
            autoPlay
            preload="metadata"
            src={audioUrl}
            className="w-full max-w-xl"
          />
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-void">
        <Loader2 className="h-10 w-10 animate-spin text-amber-400" />
        <p className="text-[13px] text-text-muted">
          {progressLabel || "Preparazione lettura online…"}
        </p>
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

  const canToggleMode = renderKind === "pdf" && pages.length > 0;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#1a1a1a]">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-white/10 bg-void/95 px-4 py-3 backdrop-blur-md">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-2 text-[13px] text-text-secondary hover:text-text-primary"
        >
          <ArrowLeft className="h-4 w-4" />
          <span className="hidden sm:inline">{book.title}</span>
        </button>
        <div className="min-w-0 flex-1 text-center">
          <p className="truncate text-[13px] font-medium text-text-primary">Lettura online</p>
          <p className="text-[11px] text-text-muted">
            {renderKind === "epub" ? "EPUB" : "PDF"} · solo streaming
          </p>
        </div>
        {canToggleMode && (
          <button
            type="button"
            onClick={toggleMode}
            className={`rounded-lg p-2 transition hover:bg-white/10 ${
              mode === "book" ? "text-amber-400" : "text-text-muted hover:text-text-primary"
            }`}
            aria-label={mode === "book" ? "Modalità scorrimento" : "Modalità libro"}
          >
            {mode === "book" ? (
              <ScrollText className="h-5 w-5" />
            ) : (
              <BookOpen className="h-5 w-5" />
            )}
          </button>
        )}
        <button
          type="button"
          onClick={onBack}
          className="rounded-lg p-2 text-text-muted hover:bg-white/10 hover:text-text-primary"
          aria-label="Chiudi lettore"
        >
          <X className="h-5 w-5" />
        </button>
      </header>

      {renderKind === "epub" && epubBlobUrl ? (
        <EpubPaginatedReader bookUrl={epubBlobUrl} title={book.title} />
      ) : mode === "book" ? (
        <MangaBookReader
          pages={pages}
          title={book.title}
          readingDirection="ltr"
        />
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <div className="mx-auto flex max-w-3xl flex-col gap-2 py-2">
            {pages.map((src, index) => (
              <img
                key={`${book.md5}-${index}`}
                src={src}
                alt={`Pagina ${index + 1}`}
                loading={index < 2 ? "eager" : "lazy"}
                decoding="async"
                className="mx-auto block w-full max-w-full"
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
