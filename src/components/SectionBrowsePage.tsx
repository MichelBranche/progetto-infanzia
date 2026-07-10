import { useMemo } from "react";
import { motion } from "framer-motion";
import { Shuffle } from "lucide-react";
import type { BrowseItem } from "../lib/browse";
import { browseItemMedia } from "../lib/browse";
import type { StremioMetaPreview } from "../types/stremio";
import type { StreamingRow } from "../lib/useStreamingCatalogs";
import { LordFlixPosterCard } from "./LordFlixPosterCard";

interface SectionBrowsePageProps {
  sectionId: string;
  title: string;
  subtitle?: string;
  syncing?: boolean;
  loading?: boolean;
  cardVariant?: "default" | "premium" | "portrait";
  items: BrowseItem[];
  streamingRows?: StreamingRow[];
  catalogIndex?: StremioMetaPreview[];
  onPlay: (id: string) => void;
  onPlayStreaming?: (preview: StremioMetaPreview) => void;
  onOpenDetail?: (browse: BrowseItem) => void;
  onOpenSeries?: (seriesKey: string) => void;
  onToggleFavorite?: (id: string) => void;
  onToggleStreamingList?: (preview: StremioMetaPreview) => void;
  onEdit?: (id: string) => void;
}

const FILTER_LABELS = [
  "Tutti i generi",
  "Tutti gli anni",
  "Popolari",
  "Tutti i provider",
] as const;

function isLordFlixBrowseSection(sectionId: string): boolean {
  return sectionId === "film" || sectionId === "serie";
}

function openBrowseItem(
  browse: BrowseItem,
  handlers: Pick<
    SectionBrowsePageProps,
    "onPlay" | "onPlayStreaming" | "onOpenDetail" | "onOpenSeries"
  >,
) {
  if (handlers.onOpenDetail) {
    handlers.onOpenDetail(browse);
    return;
  }
  if (browse.kind === "streaming") {
    handlers.onPlayStreaming?.(browse.preview);
    return;
  }
  if (browse.kind === "series" && handlers.onOpenSeries) {
    handlers.onOpenSeries(`${browse.series.mediaType}::${browse.series.seriesTitle}`);
    return;
  }
  if (browse.kind === "media") {
    handlers.onPlay(browse.item.id);
  }
}

export function SectionBrowsePage(props: SectionBrowsePageProps) {
  const {
    title,
    subtitle,
    syncing,
    loading,
    items,
    sectionId,
    onPlay,
    onPlayStreaming,
    onOpenDetail,
    onOpenSeries,
  } = props;

  const lordFlixBrowse = isLordFlixBrowseSection(sectionId);

  const sortedItems = useMemo(() => {
    if (lordFlixBrowse) return items;
    return [...items].sort((a, b) =>
      browseItemMedia(a).title.localeCompare(browseItemMedia(b).title, "it"),
    );
  }, [items, lordFlixBrowse]);

  const handleOpen = (browse: BrowseItem) => {
    openBrowseItem(browse, {
      onPlay,
      onPlayStreaming,
      onOpenDetail,
      onOpenSeries,
    });
  };

  if (loading && items.length === 0) {
    const lordFlixBrowse = isLordFlixBrowseSection(sectionId);
    return (
      <div className={`page-px pb-16 ${lordFlixBrowse ? "pt-6" : "pt-24"}`}>
        <div
          className={`lf-discovery-header ${lordFlixBrowse ? "lf-discovery-header--browse" : ""}`}
        >
          <div className="h-9 w-40 shimmer rounded-lg" />
          <div className="mt-3 h-4 w-64 shimmer rounded" />
        </div>
        <div className="lf-discovery-grid mt-4">
          {Array.from({ length: 18 }).map((_, i) => (
            <div key={i} className="aspect-[2/3] shimmer rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="flex min-h-[55vh] flex-col items-center justify-center page-px pt-24">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md text-center"
        >
          <p className="lf-discovery-header__title">{title}</p>
          <p className="mt-3 text-[14px] text-text-muted">
            Nessun contenuto trovato in questa sezione.
            {syncing ? " Il catalogo si sta ancora aggiornando." : ""}
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
      className={`page-px pb-20 ${lordFlixBrowse ? "lf-discovery-page" : ""}`}
    >
      <header
        className={`lf-discovery-header ${lordFlixBrowse ? "lf-discovery-header--browse" : ""}`}
      >
        <div className="lf-discovery-header__row">
          <div className="lf-discovery-header__copy">
            <h1 className="lf-discovery-header__title">{title}</h1>
            <p className="lf-discovery-header__subtitle">
              {subtitle ?? `Scopri ${title.toLowerCase()} da guardare`}
              {syncing && !lordFlixBrowse && (
                <span className="text-white/40"> · Aggiornamento catalogo…</span>
              )}
            </p>
            {syncing && lordFlixBrowse && (
              <p className="lf-discovery-header__sync">Aggiornamento catalogo…</p>
            )}
          </div>

          <div className="lf-filter-bar" role="toolbar" aria-label="Filtri catalogo">
            {FILTER_LABELS.map((label) => {
              const active = label === "Popolari";
              return (
                <button
                  key={label}
                  type="button"
                  className={`lf-filter-chip ${active ? "lf-filter-chip--active" : ""}`}
                >
                  {active && <Shuffle className="h-3.5 w-3.5" strokeWidth={2} />}
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        {!lordFlixBrowse && (
          <p className="mt-4 text-[12px] text-white/40">
            {items.length.toLocaleString("it-IT")} titoli
          </p>
        )}
      </header>

      <div className={`lf-discovery-grid ${lordFlixBrowse ? "lf-discovery-grid--browse" : ""}`}>
        {sortedItems.map((browse) => (
          <LordFlixPosterCard
            key={browseItemMedia(browse).id}
            browse={browse}
            layout="grid"
            onOpen={handleOpen}
          />
        ))}
      </div>
    </motion.div>
  );
}
