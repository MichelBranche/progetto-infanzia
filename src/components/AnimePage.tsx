import { memo, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { ChevronDown, Play } from "lucide-react";
import type { MediaItem } from "../types/media";
import type {
  SaturnGenre,
  StreamingContinueItem,
  StremioMetaPreview,
} from "../types/stremio";
import type { BrowseItem } from "../lib/browse";
import { fetchSaturnPoster } from "../lib/addonsApi";
import { useSaturnAnimeBrowse } from "../lib/useSaturnAnimeBrowse";
import { useSaturnAnimeHome } from "../lib/useSaturnAnimeHome";
import {
  buildContinueCatalogMap,
  enrichContinuePreviewWithMap,
  previewToMediaItem,
  streamingBrowseItem,
  streamingPreviewDisplayName,
} from "../lib/streamingBrowse";
import {
  buildAnimeHeroPreviews,
  enrichAnimeHeroPreviews,
} from "../lib/heroImage";
import { HeroBanner } from "./HeroBanner";
import { MediaRow } from "./MediaRow";
import { LoadingSpinner } from "./LoadingSpinner";
import { BrowseGridSkeleton, HeroSkeleton, RowSkeleton } from "./Skeleton";
import { VirtualizedDiscoveryGrid } from "../hooks/useVerticalGridWindow";

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
  streamingRows?: {
    key: string;
    title: string;
    subtitle: string;
    items: StremioMetaPreview[];
  }[];
  continueItems?: StreamingContinueItem[];
  myListPreviews?: StremioMetaPreview[];
  catalogIndex?: StremioMetaPreview[];
  onPlay: (id: string) => void;
  onPlayStreaming: (preview: StremioMetaPreview) => void;
  onOpenDetail?: (browse: BrowseItem) => void;
  onToggleStreamingList?: (preview: StremioMetaPreview) => void;
  enrichStreamingPreview: (preview: StremioMetaPreview) => StremioMetaPreview;
}

const STAGGER_CAP = 24;
const DERIVED_ROW_LIMIT = 30;

type AnimeAudio = "all" | "dub" | "sub";
type AnimeSort = "az" | "za";

interface AnimeFilterState {
  audio: AnimeAudio;
  sort: AnimeSort;
  genreId: string;
}

const DEFAULT_ANIME_FILTERS: AnimeFilterState = {
  audio: "all",
  sort: "az",
  genreId: "",
};

interface AnimeFilterOption<T extends string> {
  id: T;
  label: string;
}

const AUDIO_OPTIONS: AnimeFilterOption<AnimeAudio>[] = [
  { id: "all", label: "Tutti gli audio" },
  { id: "dub", label: "Doppiato ITA" },
  { id: "sub", label: "Sub ITA" },
];

const SORT_OPTIONS: AnimeFilterOption<AnimeSort>[] = [
  { id: "az", label: "A–Z" },
  { id: "za", label: "Z–A" },
];

/** Deriva l'audio dal `releaseInfo` prodotto dal backend (badge AnimeSaturn). */
function animeAudioKind(preview: StremioMetaPreview): "dub" | "sub" {
  const info = (preview.releaseInfo ?? "").toLowerCase();
  return info.includes("dub") ? "dub" : "sub";
}

function AnimeFilterMenu<T extends string>({
  label,
  menuId,
  options,
  selectedId,
  open,
  onToggle,
  onSelect,
}: {
  label: string;
  menuId: string;
  options: AnimeFilterOption<T>[];
  selectedId: T;
  open: boolean;
  onToggle: () => void;
  onSelect: (id: T) => void;
}) {
  const active = selectedId !== options[0]?.id;
  return (
    <div className="lf-filter-chip-wrap">
      <button
        type="button"
        className={`lf-filter-chip ${active || open ? "lf-filter-chip--active" : ""}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={onToggle}
      >
        {label}
        <ChevronDown
          className={`h-3.5 w-3.5 opacity-70 transition-transform ${open ? "rotate-180" : ""}`}
          strokeWidth={2}
        />
      </button>
      {open && (
        <div id={menuId} className="lf-filter-menu" role="listbox" aria-label={label}>
          {options.map((option) => {
            const selected = option.id === selectedId;
            return (
              <button
                key={option.id}
                type="button"
                role="option"
                aria-selected={selected}
                className={`lf-filter-menu__item ${selected ? "lf-filter-menu__item--active" : ""}`}
                onClick={() => onSelect(option.id)}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

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

export function AnimePage({
  seedPreviews = [],
  streamingRows = [],
  continueItems = [],
  myListPreviews = [],
  catalogIndex = [],
  onPlay,
  onPlayStreaming,
  onOpenDetail,
  onToggleStreamingList,
  enrichStreamingPreview,
}: AnimePageProps) {
  const {
    rows: homeRows,
    genres,
    loading: homeLoading,
  } = useSaturnAnimeHome(streamingRows);

  const [filters, setFilters] = useState<AnimeFilterState>(
    DEFAULT_ANIME_FILTERS,
  );
  const [openMenu, setOpenMenu] = useState<
    "audio" | "sort" | "genre" | null
  >(null);

  const { items, total, loading, loadingMore, hasMore, error, loadMore } =
    useSaturnAnimeBrowse(seedPreviews, filters.genreId || null);

  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const filterBarRef = useRef<HTMLDivElement | null>(null);

  const [heroItems, setHeroItems] = useState<MediaItem[]>([]);

  useEffect(() => {
    const previews = buildAnimeHeroPreviews(homeRows, 8);
    if (previews.length === 0) return;
    let cancelled = false;
    const toMedia = (preview: StremioMetaPreview) =>
      previewToMediaItem(enrichStreamingPreview(preview));
    setHeroItems(previews.map(toMedia));
    void (async () => {
      const enriched = await enrichAnimeHeroPreviews(previews, 6);
      if (cancelled) return;
      setHeroItems(enriched.map(toMedia));
    })();
    return () => {
      cancelled = true;
    };
  }, [homeRows, enrichStreamingPreview]);

  const continueRow = useMemo(() => {
    const saturn = continueItems.filter(
      (item) => item.catalogPrefix === "saturn",
    );
    if (saturn.length === 0) return null;
    const map = buildContinueCatalogMap(catalogIndex);
    return saturn.map((item) =>
      streamingBrowseItem(
        enrichStreamingPreview(enrichContinuePreviewWithMap(item, map)),
      ),
    );
  }, [continueItems, catalogIndex, enrichStreamingPreview]);

  const myListRow = useMemo(() => {
    const saturn = myListPreviews.filter(
      (preview) => (preview.catalogPrefix?.toLowerCase() ?? "") === "saturn",
    );
    if (saturn.length === 0) return null;
    return saturn.map((preview) =>
      streamingBrowseItem(enrichStreamingPreview(preview)),
    );
  }, [myListPreviews, enrichStreamingPreview]);

  const curatedRows = useMemo(
    () =>
      homeRows
        .filter((row) => row.items.length > 0)
        .map((row) => ({
          key: row.key,
          title: row.title,
          subtitle: row.subtitle,
          browse: row.items.map((preview) =>
            streamingBrowseItem(enrichStreamingPreview(preview)),
          ),
        })),
    [homeRows, enrichStreamingPreview],
  );

  const dubRow = useMemo(
    () =>
      seedPreviews
        .filter((preview) => animeAudioKind(preview) === "dub")
        .slice(0, DERIVED_ROW_LIMIT)
        .map((preview) =>
          streamingBrowseItem(enrichStreamingPreview(preview)),
        ),
    [seedPreviews, enrichStreamingPreview],
  );

  const subRow = useMemo(
    () =>
      seedPreviews
        .filter((preview) => animeAudioKind(preview) === "sub")
        .slice(0, DERIVED_ROW_LIMIT)
        .map((preview) =>
          streamingBrowseItem(enrichStreamingPreview(preview)),
        ),
    [seedPreviews, enrichStreamingPreview],
  );

  const genreOptions = useMemo<AnimeFilterOption<string>[]>(
    () => [
      { id: "", label: "Tutti i generi" },
      ...genres.map((genre: SaturnGenre) => ({
        id: genre.id,
        label: genre.name,
      })),
    ],
    [genres],
  );

  const filteredItems = useMemo(() => {
    const base =
      filters.audio === "all"
        ? items
        : items.filter((preview) => animeAudioKind(preview) === filters.audio);
    const sorted = [...base].sort((a, b) => {
      const cmp = streamingPreviewDisplayName(a).localeCompare(
        streamingPreviewDisplayName(b),
        "it",
      );
      return filters.sort === "az" ? cmp : -cmp;
    });
    return sorted;
  }, [items, filters.audio, filters.sort]);

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

  useEffect(() => {
    if (!openMenu) return;
    const onPointerDown = (event: MouseEvent) => {
      const root = filterBarRef.current;
      if (root && event.target instanceof Node && !root.contains(event.target)) {
        setOpenMenu(null);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpenMenu(null);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [openMenu]);

  const displayTotal = Math.max(total, items.length);
  const selectedGenreLabel =
    genreOptions.find((option) => option.id === filters.genreId)?.label ??
    "Genere";

  const bootLoading =
    homeLoading && curatedRows.length === 0 && loading && items.length === 0;

  if (bootLoading) {
    return (
      <div className="lf-discovery-page">
        <HeroSkeleton />
        <div className="page-px pb-6 pt-2">
          <RowSkeleton />
          <RowSkeleton />
          <RowSkeleton />
        </div>
      </div>
    );
  }

  const nothingToShow =
    curatedRows.length === 0 &&
    !continueRow &&
    !myListRow &&
    items.length === 0 &&
    !loading &&
    !homeLoading;

  if (nothingToShow) {
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
    >
      {heroItems.length > 0 ? (
        <HeroBanner
          fullPage
          items={heroItems}
          onPlay={onPlay}
          onOpenDetail={onOpenDetail}
          onToggleStreamingList={onToggleStreamingList}
        />
      ) : homeLoading ? (
        <HeroSkeleton />
      ) : null}

      <div className="lf-home-content relative">
        {continueRow && (
          <div className="lf-home-continue-slot relative">
            <MediaRow
              key="saturn-continue"
              index="01"
              title="Continua a guardare"
              subtitle="I tuoi anime AnimeSaturn"
              items={continueRow}
              layout="continue"
              animateEntrance
              onPlay={onPlay}
              onPlayStreaming={onPlayStreaming}
              onOpenDetail={onOpenDetail}
              onToggleStreamingList={onToggleStreamingList}
            />
          </div>
        )}

        {myListRow && (
          <MediaRow
            key="saturn-mylist"
            title="La mia lista"
            subtitle="Anime salvati"
            items={myListRow}
            animateEntrance
            onPlay={onPlay}
            onPlayStreaming={onPlayStreaming}
            onOpenDetail={onOpenDetail}
            onToggleStreamingList={onToggleStreamingList}
          />
        )}

        {curatedRows.map((row, i) => (
          <MediaRow
            key={row.key}
            index={String(i + 1).padStart(2, "0")}
            title={row.title}
            subtitle={row.subtitle}
            items={row.browse}
            animateEntrance
            onPlay={onPlay}
            onPlayStreaming={onPlayStreaming}
            onOpenDetail={onOpenDetail}
            onToggleStreamingList={onToggleStreamingList}
          />
        ))}

        {dubRow.length > 0 && (
          <MediaRow
            key="saturn-dub"
            title="Doppiato ITA"
            subtitle="Anime con audio italiano"
            items={dubRow}
            animateEntrance
            onPlay={onPlay}
            onPlayStreaming={onPlayStreaming}
            onOpenDetail={onOpenDetail}
            onToggleStreamingList={onToggleStreamingList}
          />
        )}

        {subRow.length > 0 && (
          <MediaRow
            key="saturn-sub"
            title="Sub ITA"
            subtitle="Anime sottotitolati in italiano"
            items={subRow}
            animateEntrance
            onPlay={onPlay}
            onPlayStreaming={onPlayStreaming}
            onOpenDetail={onOpenDetail}
            onToggleStreamingList={onToggleStreamingList}
          />
        )}

        <section className="page-px pb-[max(5rem,var(--mobile-nav-height))] lf-discovery-page sm:pb-20">
          <header className="lf-discovery-header lf-discovery-header--browse">
            <div className="lf-discovery-header__row">
              <div className="lf-discovery-header__copy">
                <h2 className="lf-discovery-header__title">Esplora tutto</h2>
                <p className="lf-discovery-header__subtitle">
                  {displayTotal > 0
                    ? `${displayTotal.toLocaleString("it-IT")}+ titoli · Catalogo AnimeSaturn`
                    : "Catalogo AnimeSaturn · Scorri per esplorare"}
                </p>
              </div>

              <div
                ref={filterBarRef}
                className="lf-filter-bar"
                role="toolbar"
                aria-label="Filtri anime"
              >
                <AnimeFilterMenu
                  label={
                    AUDIO_OPTIONS.find((o) => o.id === filters.audio)?.label ??
                    "Audio"
                  }
                  menuId="lf-anime-filter-audio"
                  options={AUDIO_OPTIONS}
                  selectedId={filters.audio}
                  open={openMenu === "audio"}
                  onToggle={() =>
                    setOpenMenu((current) =>
                      current === "audio" ? null : "audio",
                    )
                  }
                  onSelect={(audio) => {
                    setFilters((current) => ({ ...current, audio }));
                    setOpenMenu(null);
                  }}
                />
                {genres.length > 0 && (
                  <AnimeFilterMenu
                    label={selectedGenreLabel}
                    menuId="lf-anime-filter-genre"
                    options={genreOptions}
                    selectedId={filters.genreId}
                    open={openMenu === "genre"}
                    onToggle={() =>
                      setOpenMenu((current) =>
                        current === "genre" ? null : "genre",
                      )
                    }
                    onSelect={(genreId) => {
                      setFilters((current) => ({ ...current, genreId }));
                      setOpenMenu(null);
                    }}
                  />
                )}
                <AnimeFilterMenu
                  label={
                    SORT_OPTIONS.find((o) => o.id === filters.sort)?.label ??
                    "Ordina"
                  }
                  menuId="lf-anime-filter-sort"
                  options={SORT_OPTIONS}
                  selectedId={filters.sort}
                  open={openMenu === "sort"}
                  onToggle={() =>
                    setOpenMenu((current) =>
                      current === "sort" ? null : "sort",
                    )
                  }
                  onSelect={(sort) => {
                    setFilters((current) => ({ ...current, sort }));
                    setOpenMenu(null);
                  }}
                />
              </div>
            </div>
          </header>

          {error && (
            <p className="mb-4 text-center text-[12px] text-text-muted">
              {error}
            </p>
          )}

          {loading && items.length === 0 ? (
            <BrowseGridSkeleton count={18} />
          ) : filteredItems.length === 0 && !hasMore ? (
            <div className="flex min-h-[30vh] flex-col items-center justify-center py-12 text-center">
              <p className="text-[15px] font-medium text-white/85">
                Nessun anime con questo filtro
              </p>
              <p className="mt-2 text-[13px] text-white/45">
                Prova a cambiare audio, genere od ordinamento.
              </p>
            </div>
          ) : (
            <VirtualizedDiscoveryGrid
              items={filteredItems}
              className="lf-discovery-grid lf-discovery-grid--browse"
              getKey={(raw) => {
                const preview = enrichStreamingPreview(raw);
                return `${preview.type}:${preview.id}`;
              }}
              renderItem={(raw, index) => {
                const preview = enrichStreamingPreview(raw);
                return (
                  <AnimeTile
                    preview={preview}
                    index={index}
                    onPlay={onPlayStreaming}
                  />
                );
              }}
            />
          )}

          {hasMore && (
            <div ref={loadMoreRef} className="flex justify-center py-10">
              <LoadingSpinner size="sm" className="border-t-accent" />
            </div>
          )}
        </section>
      </div>
    </motion.div>
  );
}
