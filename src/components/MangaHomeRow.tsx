import { memo, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { MangaCategory } from "../lib/mangaCategories";
import type { MangaBrowseItem } from "../types/mangadex";
import { fetchMangaCategoryPage } from "../lib/mangaCategoryFetch";
import { enqueueMangaRowFetch } from "../lib/mangaRowQueue";
import { MangaCard } from "./MangaCard";

const ROW_PREVIEW = 6;

interface MangaHomeRowProps {
  index: string;
  category: MangaCategory;
  profileId: string;
  adult: boolean;
  savedIds: Set<string>;
  onOpen: (item: MangaBrowseItem) => void;
  onToggleSave: (item: MangaBrowseItem) => void;
  onSeeAll: (categoryId: string) => void;
}

export const MangaHomeRow = memo(function MangaHomeRow({
  index,
  category,
  profileId,
  adult,
  savedIds,
  onOpen,
  onToggleSave,
  onSeeAll,
}: MangaHomeRowProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [items, setItems] = useState<MangaBrowseItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void enqueueMangaRowFetch(() =>
      fetchMangaCategoryPage(category, profileId, 0, ROW_PREVIEW, adult),
    )
      .then((page) => {
        if (cancelled) return;
        setItems(page.items);
        setLoaded(true);
      })
      .catch(() => {
        if (!cancelled) setItems([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [category.id, profileId, adult]);

  const scroll = (dir: "left" | "right") => {
    scrollRef.current?.scrollBy({
      left: dir === "left" ? -400 : 400,
      behavior: "smooth",
    });
  };

  if (loaded && items.length === 0) return null;

  return (
    <section className="group/row relative py-4 sm:py-5">
      <div className="mb-4 flex flex-col items-center text-center sm:mb-5">
        <span className="font-display text-[11px] tabular-nums text-text-muted/80 sm:text-xs">
          {index}
        </span>
        <h2 className="title-safe font-display mt-1 text-xl font-semibold tracking-[-0.025em] text-text-primary sm:text-[1.65rem]">
          {category.label}
        </h2>
        {category.subtitle && (
          <p className="title-clip mt-1 max-w-prose text-[12px] text-text-muted sm:text-[13px]">
            {category.subtitle}
          </p>
        )}
        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            onClick={() => onSeeAll(category.id)}
            className="shrink-0 text-[12px] font-medium text-text-muted transition-colors hover:text-text-primary sm:text-[13px]"
          >
            Vedi tutti
          </button>
          <div className="hidden items-center gap-1 opacity-0 transition-opacity group-hover/row:opacity-100 sm:flex">
            <button
              type="button"
              onClick={() => scroll("left")}
              className="flex h-8 w-8 items-center justify-center rounded-full border border-white/[0.08] bg-void/90 text-text-secondary hover:text-text-primary"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => scroll("right")}
              className="flex h-8 w-8 items-center justify-center rounded-full border border-white/[0.08] bg-void/90 text-text-secondary hover:text-text-primary"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center gap-3 overflow-hidden sm:gap-4">
          {Array.from({ length: ROW_PREVIEW }).map((_, i) => (
            <div
              key={i}
              className="aspect-[2/3] w-[148px] shrink-0 shimmer rounded-lg sm:w-[168px]"
              style={{ animationDelay: `${i * 80}ms` }}
            />
          ))}
        </div>
      ) : (
        <div
          ref={scrollRef}
          className="hide-scrollbar flex snap-x snap-mandatory justify-center gap-3 overflow-x-auto pb-1 sm:gap-4"
        >
          {items.map((item, cardIndex) => (
            <MangaCard
              key={item.id}
              item={item}
              saved={savedIds.has(item.id)}
              variant="row"
              eagerImage={cardIndex < 3}
              onOpen={onOpen}
              onToggleSave={onToggleSave}
            />
          ))}
        </div>
      )}
    </section>
  );
});
