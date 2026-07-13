import { memo, useCallback } from "react";
import { Headphones } from "lucide-react";
import type { WelibBook } from "../types/welib";
import { bookAuthorsLabel, bookFormatLabel, welibCoverProxyUrl } from "../lib/welibApi";

interface BookCardProps {
  item: WelibBook;
  onOpen: (item: WelibBook) => void;
}

export const BookCard = memo(function BookCard({ item, onOpen }: BookCardProps) {
  const handleOpen = useCallback(() => onOpen(item), [item, onOpen]);
  const coverSrc = item.coverUrl ? welibCoverProxyUrl(item.coverUrl) : null;

  return (
    <button
      type="button"
      onClick={handleOpen}
      className="group flex w-full gap-4 rounded-xl border border-white/[0.06] bg-white/[0.03] p-4 text-left transition hover:border-amber-500/30 hover:bg-white/[0.05]"
    >
      <div className="relative flex h-28 w-20 shrink-0 overflow-hidden rounded-lg bg-gradient-to-br from-amber-950 to-orange-950 ring-1 ring-white/[0.08]">
        {coverSrc ? (
          <img
            src={coverSrc}
            alt=""
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center px-2 text-center">
            <span className="line-clamp-4 text-[10px] font-semibold leading-snug text-amber-100/90">
              {item.title}
            </span>
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <h3 className="line-clamp-2 text-[15px] font-semibold text-text-primary group-hover:text-amber-200">
          {item.title}
        </h3>
        <p className="mt-1 line-clamp-1 text-[12px] text-text-muted">
          {bookAuthorsLabel(item)}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="rounded bg-white/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-text-secondary">
            {bookFormatLabel(item.format)}
          </span>
          {item.language && (
            <span className="text-[11px] text-text-muted">{item.language}</span>
          )}
          {item.year && (
            <span className="text-[11px] text-text-muted">{item.year}</span>
          )}
          {item.hasAudiobook && (
            <span className="inline-flex items-center gap-1 rounded bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium text-emerald-300">
              <Headphones className="h-3 w-3" />
              Audio
            </span>
          )}
        </div>
      </div>
    </button>
  );
});
