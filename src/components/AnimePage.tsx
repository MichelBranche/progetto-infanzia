import { memo, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Play, Sparkles } from "lucide-react";
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

const FILTER_LABELS = [
  "Tutti",
  "AnimeSaturn",
  "Popolari",
  "Sub ITA",
] as const;

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
      initial={stagger ? { opacity: 0, y: 14 } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={
        stagger
          ? { delay: Math.min(index * 0.02, 0.4), duration: 0.35, ease: [0.22, 1, 0.36, 1] }
          : { duration: 0 }
      }
      onClick={() => onPlay(preview)}
      className="lf-browse-card lf-browse-card--grid group/card"
      aria-label={title}
    >
      <div className="lf-browse-card__stage">
        <div className="lf-browse-card__frame">
          {poster ? (
            <img
              src={poster}
              alt={title}
              loading="lazy"
              decoding="async"
              className="lf-browse-card__img"
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-indigo-950/90 via-violet-950/80 to-[#0a0a0c] px-3 text-center text-[12px] leading-snug text-white/65">
              {title}
            </div>
          )}
          <div className="lf-browse-card__sheen" aria-hidden />
          <div className="lf-browse-card__hover" aria-hidden>
            <span className="lf-browse-card__play">
              <Play className="h-6 w-6 fill-current" />
            </span>
            <div className="lf-browse-card__hover-body">
              <h3 className="lf-browse-card__hover-title">{title}</h3>
              {meta && (
                <div className="lf-browse-card__hover-meta">
                  <span>{meta}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      <div className="lf-browse-card__body">
        <p className="lf-browse-card__title">{title}</p>
        {meta && <p className="lf-browse-card__sub">{meta}</p>}
      </div>
    </motion.button>
  );
});

function AnimeLoadingSkeleton() {
  return (
    <div className="page-px pb-16 pt-6">
      <div className="lf-discovery-header lf-discovery-header--browse">
        <div className="h-10 w-48 shimmer rounded-lg" />
        <div className="mt-3 h-4 w-72 shimmer rounded" />
      </div>
      <div className="lf-discovery-grid lf-discovery-grid--browse mt-4">
        {Array.from({ length: 18 }).map((_, i) => (
          <div key={i} className="space-y-2">
            <div className="aspect-[2/3] shimmer rounded-2xl" />
            <div className="h-3 w-4/5 shimmer rounded" />
            <div className="h-2.5 w-1/2 shimmer rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}

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

  if (loading && items.length === 0) {
    return <AnimeLoadingSkeleton />;
  }

  if (items.length === 0) {
    return (
      <div className="flex min-h-[55vh] flex-col items-center justify-center page-px pt-24">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md text-center"
        >
          <p className="lf-discovery-header__title">Anime</p>
          <p className="mt-3 text-[14px] text-text-muted">
            {error ?? "Nessun anime disponibile al momento."}
          </p>
        </motion.div>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.35 }}
      className="page-px pb-[max(5rem,var(--mobile-nav-height))] lf-discovery-page sm:pb-20"
    >
      <header className="lf-discovery-header lf-discovery-header--browse">
        <div className="lf-discovery-header__row">
          <div className="lf-discovery-header__copy">
            <h1 className="lf-discovery-header__title">Anime</h1>
            <p className="lf-discovery-header__subtitle">
              {displayTotal > 0
                ? `${displayTotal.toLocaleString("it-IT")}+ titoli · Catalogo AnimeSaturn · Sub ITA e ITA`
                : "Catalogo AnimeSaturn · Scorri per esplorare"}
            </p>
          </div>

          <div className="lf-filter-bar" role="toolbar" aria-label="Filtri anime">
            {FILTER_LABELS.map((label) => {
              const active = label === "Tutti";
              return (
                <button
                  key={label}
                  type="button"
                  className={`lf-filter-chip ${active ? "lf-filter-chip--active" : ""}`}
                >
                  {active && <Sparkles className="h-3.5 w-3.5" strokeWidth={2} />}
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      </header>

      {error && (
        <p className="mb-4 text-center text-[12px] text-text-muted">{error}</p>
      )}

      <div className="lf-discovery-grid lf-discovery-grid--browse">
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
    </motion.div>
  );
}
