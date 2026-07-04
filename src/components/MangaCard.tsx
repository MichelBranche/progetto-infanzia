import { memo, useCallback, useEffect, useRef, useState } from "react";
import { Check, Plus } from "lucide-react";
import type { MangaBrowseItem } from "../types/mangadex";
import { mangaCoverThumbUrl } from "../lib/mangadexCovers";

function isAdultRating(rating?: string) {
  return rating === "erotica" || rating === "pornographic";
}

const statusLabel: Record<string, string> = {
  ongoing: "In corso",
  completed: "Completato",
  hiatus: "In pausa",
  cancelled: "Cancellato",
};

interface MangaCardProps {
  item: MangaBrowseItem;
  saved: boolean;
  variant?: "row" | "grid";
  eagerImage?: boolean;
  onOpen: (item: MangaBrowseItem) => void;
  onToggleSave: (item: MangaBrowseItem) => void;
}

export const MangaCard = memo(function MangaCard({
  item,
  saved,
  variant = "row",
  eagerImage = false,
  onOpen,
  onToggleSave,
}: MangaCardProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [imageSrc, setImageSrc] = useState<string | null>(() =>
    mangaCoverThumbUrl(item.coverUrl, 256),
  );
  const [showImage, setShowImage] = useState(
    eagerImage || variant === "row",
  );

  useEffect(() => {
    setImageSrc(mangaCoverThumbUrl(item.coverUrl, 256));
    setShowImage(eagerImage || variant === "row");
  }, [item.coverUrl, eagerImage, variant]);

  useEffect(() => {
    if (showImage || variant === "row") return;
    const node = ref.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setShowImage(true);
          observer.disconnect();
        }
      },
      { rootMargin: "100px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [showImage, variant]);

  const handleOpen = useCallback(() => onOpen(item), [onOpen, item]);
  const handleSave = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onToggleSave(item);
    },
    [onToggleSave, item],
  );

  const wrapperClass =
    variant === "row"
      ? "w-[148px] shrink-0 snap-start sm:w-[168px]"
      : "w-full max-w-[190px]";

  return (
    <div
      ref={ref}
      role="button"
      tabIndex={0}
      onClick={handleOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleOpen();
        }
      }}
      className={`group cursor-pointer text-left ${wrapperClass}`}
    >
      <div className="relative aspect-[2/3] overflow-hidden rounded-lg bg-[#14141c] ring-1 ring-white/[0.06] transition group-hover:ring-[#ff6740]/40">
        {imageSrc && showImage ? (
          <img
            src={imageSrc}
            alt={item.title}
            loading={eagerImage ? "eager" : "lazy"}
            decoding="async"
            fetchPriority={eagerImage ? "high" : "low"}
            onError={() => {
              if (item.coverUrl && imageSrc !== item.coverUrl) {
                setImageSrc(item.coverUrl);
              }
            }}
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-orange-950 to-rose-950 px-2 text-center text-[11px] text-white/70">
            {item.title}
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent" />
        {item.latestChapter && (
          <span className="absolute left-1.5 top-1.5 z-[2] max-w-[calc(100%-0.75rem)] truncate rounded bg-[#ff6740]/90 px-1.5 py-0.5 text-[9px] font-semibold text-white">
            {item.latestChapter}
          </span>
        )}
        {item.status && !item.latestChapter && (
          <span className="absolute left-1.5 top-1.5 z-[2] rounded bg-black/70 px-1.5 py-0.5 text-[9px] text-white/85">
            {statusLabel[item.status] ?? item.status}
          </span>
        )}
        {isAdultRating(item.contentRating) && (
          <span className="absolute right-1.5 top-1.5 z-[2] rounded bg-red-600/90 px-1 py-0.5 text-[9px] font-bold text-white">
            18+
          </span>
        )}
        <button
          type="button"
          onClick={handleSave}
          aria-label={saved ? "Rimuovi" : "Salva"}

          className={`absolute bottom-1.5 right-1.5 z-[3] flex h-7 w-7 items-center justify-center rounded-full ring-1 backdrop-blur-sm transition ${
            saved
              ? "bg-[#ff6740] text-white ring-[#ff6740]/60"
              : "bg-black/60 text-white/85 ring-white/25 opacity-0 group-hover:opacity-100"
          }`}
        >
          {saved ? <Check className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
        </button>
        <div className="absolute inset-x-0 bottom-0 z-[2] p-2 pr-9">
          <p className="line-clamp-2 text-[12px] font-semibold leading-snug text-white">
            {item.title}
          </p>
        </div>
      </div>
    </div>
  );
});
