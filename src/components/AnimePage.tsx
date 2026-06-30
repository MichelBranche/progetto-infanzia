import { memo, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import type { StremioMetaPreview } from "../types/stremio";
import { fetchSaturnPoster } from "../lib/addonsApi";
import { useSaturnAnimeBrowse } from "../lib/useSaturnAnimeBrowse";
import { streamingPreviewDisplayName } from "../lib/streamingBrowse";
import { LoadingSpinner } from "./LoadingSpinner";

const posterCache = new Map<string, string | null>();
const posterInflight = new Map<string, Promise<string | null>>();
const POSTER_MAX_CONCURRENT = 3;
let posterActive = 0;
const posterQueue: Array<() => void> = [];

function runPosterTask(slug: string): Promise<string | null> {
  return new Promise((resolve) => {
    const start = () => {
      posterActive += 1;
      fetchSaturnPoster(slug)
        .then((url) => {
          posterCache.set(slug, url);
          resolve(url);
        })
        .catch(() => {
          posterCache.set(slug, null);
          resolve(null);
        })
        .finally(() => {
          posterInflight.delete(slug);
          posterActive -= 1;
          const next = posterQueue.shift();
          if (next) next();
        });
    };

    if (posterActive < POSTER_MAX_CONCURRENT) {
      start();
    } else {
      posterQueue.push(start);
    }
  });
}

function loadSaturnPoster(slug: string): Promise<string | null> {
  if (posterCache.has(slug)) {
    return Promise.resolve(posterCache.get(slug) ?? null);
  }
  const pending = posterInflight.get(slug);
  if (pending) return pending;
  const task = runPosterTask(slug);
  posterInflight.set(slug, task);
  return task;
}

interface AnimePageProps {
  seedPreviews?: StremioMetaPreview[];
  onPlayStreaming: (preview: StremioMetaPreview) => void;
  enrichStreamingPreview: (preview: StremioMetaPreview) => StremioMetaPreview;
}

const STAGGER_CAP = 24;

const AnimeTile = memo(function AnimeTile({
  preview,
  index,
  onPlay,
}: {
  preview: StremioMetaPreview;
  index: number;
  onPlay: (preview: StremioMetaPreview) => void;
}) {
  const title = streamingPreviewDisplayName(preview);
  const meta = preview.releaseInfo?.trim();
  const stagger = index < STAGGER_CAP;
  const slug = preview.slug ?? preview.id;
  const tileRef = useRef<HTMLButtonElement>(null);
  const [inView, setInView] = useState(false);
  const [poster, setPoster] = useState(preview.poster ?? null);

  useEffect(() => {
    setPoster(preview.poster ?? null);
  }, [preview.poster]);

  useEffect(() => {
    const node = tileRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setInView(true);
          observer.disconnect();
        }
      },
      { rootMargin: "120px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!inView || poster || !slug) return;
    let cancelled = false;
    void loadSaturnPoster(slug).then((url) => {
      if (!cancelled && url) setPoster(url);
    });
    return () => {
      cancelled = true;
    };
  }, [inView, poster, slug]);

  return (
    <motion.button
      ref={tileRef}
      type="button"
      initial={stagger ? { opacity: 0, y: 12 } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={
        stagger
          ? { delay: Math.min(index * 0.02, 0.4) }
          : { duration: 0 }
      }
      onClick={() => onPlay(preview)}
      className="group w-full cursor-pointer text-left"
    >
      <div className="relative aspect-[2/3] overflow-hidden rounded-lg bg-[#14141c] ring-1 ring-white/[0.06] transition group-hover:ring-white/15">
        {poster ? (
          <img
            src={poster}
            alt={title}
            loading="lazy"
            decoding="async"
            className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-indigo-950 to-violet-950 px-3 text-center text-[12px] text-white/70">
            {title}
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/25 to-transparent" />
        {meta && (
          <span className="absolute left-2 top-2 z-[2] max-w-[calc(100%-1rem)] truncate rounded bg-black/70 px-2 py-0.5 text-[10px] font-medium text-white/85 backdrop-blur-sm">
            {meta}
          </span>
        )}
        <div className="absolute inset-x-0 bottom-0 z-[2] p-2.5">
          <p className="line-clamp-2 text-[13px] font-semibold leading-snug text-white drop-shadow-sm">
            {title}
          </p>
        </div>
      </div>
    </motion.button>
  );
});

export function AnimePage({
  seedPreviews = [],
  onPlayStreaming,
  enrichStreamingPreview,
}: AnimePageProps) {
  const { items, total, loading, loadingMore, hasMore, error, loadMore } =
    useSaturnAnimeBrowse(seedPreviews);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const node = loadMoreRef.current;
    if (!node || !hasMore || loadingMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          loadMore();
        }
      },
      { rootMargin: "400px" },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, loadingMore, loadMore, items.length]);

  const displayTotal = Math.max(total, items.length);

  return (
    <div className="page-px pb-16 pt-24 sm:pt-28">
      <span className="font-display text-[11px] tabular-nums text-text-muted sm:text-xs">
        —
      </span>
      <h1 className="font-display mt-2 text-3xl font-semibold tracking-[-0.03em] text-text-primary sm:text-4xl">
        Anime
      </h1>
      <p className="mt-2 max-w-prose text-[14px] text-text-secondary sm:text-[15px]">
        {displayTotal > 0
          ? `${displayTotal.toLocaleString("it-IT")}+ anime · Scorri per caricare altri titoli`
          : "Catalogo AnimeSaturn · Scorri per esplorare"}
      </p>

      {error && items.length === 0 && (
        <p className="mt-6 text-center text-[13px] text-red-400/90">{error}</p>
      )}

      {error && items.length > 0 && (
        <p className="mt-4 text-center text-[12px] text-text-muted">{error}</p>
      )}

      {loading && items.length === 0 ? (
        <div className="flex justify-center py-20">
          <LoadingSpinner size="md" className="border-t-accent" />
        </div>
      ) : items.length === 0 ? (
        <p className="mt-10 text-center text-[13px] text-text-muted">
          Nessun anime disponibile al momento.
        </p>
      ) : (
        <>
          <div className="mt-8 page-px browse-grid">
            {items.map((raw, index) => {
              const preview = enrichStreamingPreview(raw);
              return (
                <AnimeTile
                  key={`${preview.type}:${preview.id}`}
                  preview={preview}
                  index={index}
                  onPlay={onPlayStreaming}
                />
              );
            })}
          </div>
          {hasMore && (
            <div ref={loadMoreRef} className="flex justify-center py-10">
              <LoadingSpinner size="sm" className="border-t-accent" />
            </div>
          )}
        </>
      )}
    </div>
  );
}
