import { ArrowLeft, BookOpen, Headphones } from "lucide-react";
import type { WelibBook } from "../types/welib";
import { bookAuthorsLabel, bookFormatLabel, welibCoverProxyUrl } from "../lib/welibApi";

interface BookDetailPageProps {
  book: WelibBook;
  onBack: () => void;
  onRead: (book: WelibBook) => void;
  onListen: (book: WelibBook) => void;
}

export function BookDetailPage({
  book,
  onBack,
  onRead,
  onListen,
}: BookDetailPageProps) {
  const coverSrc = book.coverUrl ? welibCoverProxyUrl(book.coverUrl) : null;

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
      <button
        type="button"
        onClick={onBack}
        className="mb-6 flex items-center gap-2 text-[13px] text-text-secondary hover:text-text-primary"
      >
        <ArrowLeft className="h-4 w-4" />
        Torna al catalogo
      </button>

      <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-6">
        <div className="mb-4 overflow-hidden rounded-xl bg-gradient-to-br from-amber-950 via-orange-950 to-rose-950">
          {coverSrc ? (
            <img
              src={coverSrc}
              alt=""
              className="mx-auto block max-h-56 w-full object-contain"
            />
          ) : (
            <div className="flex min-h-40 items-center justify-center px-6 text-center">
              <h1 className="line-clamp-4 text-2xl font-semibold leading-snug text-amber-50">
                {book.title}
              </h1>
            </div>
          )}
        </div>

        <h1 className="text-xl font-semibold text-text-primary">{book.title}</h1>

        <p className="text-[14px] text-text-secondary">{bookAuthorsLabel(book)}</p>

        <div className="mt-3 flex flex-wrap gap-2 text-[12px] text-text-muted">
          <span className="rounded bg-white/10 px-2 py-1 font-semibold uppercase">
            {bookFormatLabel(book.format)}
          </span>
          {book.language && <span>{book.language}</span>}
          {book.year && <span>{book.year}</span>}
          {book.size && <span>{book.size}</span>}
        </div>

        <p className="mt-4 text-[12px] text-text-muted">
          Lettura e ascolto solo online: il file resta in memoria e non viene salvato sul dispositivo.
        </p>

        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => onRead(book)}
            className="inline-flex items-center gap-2 rounded-xl bg-amber-500 px-5 py-3 text-[13px] font-semibold text-black transition hover:bg-amber-400"
          >
            <BookOpen className="h-4 w-4" />
            Leggi online
          </button>
          {book.hasAudiobook && (
            <button
              type="button"
              onClick={() => onListen(book)}
              className="inline-flex items-center gap-2 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-5 py-3 text-[13px] font-semibold text-emerald-200 transition hover:bg-emerald-500/20"
            >
              <Headphones className="h-4 w-4" />
              Ascolta
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
