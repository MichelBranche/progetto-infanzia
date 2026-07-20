import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { ChevronDown, Shuffle } from "lucide-react";
import type { BrowseItem } from "../lib/browse";
import { browseItemId, browseItemMedia } from "../lib/browse";
import type { StremioMetaPreview } from "../types/stremio";
import type { StreamingRow } from "../lib/useStreamingCatalogs";
import {
  BROWSE_SORT_OPTIONS,
  DEFAULT_BROWSE_FILTERS,
  browseFilterChipLabel,
  collectProviderOptions,
  collectYearOptions,
  filterAndSortBrowseItems,
  genreFilterOptions,
  isBrowseFilterActive,
  type BrowseFilterOption,
  type BrowseFilterState,
  type BrowseSortId,
} from "../lib/browseFilters";
import { serviceById } from "../data/streaming";
import { VirtualizedDiscoveryGrid } from "../hooks/useVerticalGridWindow";
import { LordFlixPosterCard } from "./LordFlixPosterCard";
import { BrowseGridSkeleton } from "./Skeleton";

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

type FilterMenuId = "genre" | "year" | "sort" | "provider";

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

/** Testo bianco o nero a seconda della luminanza del colore del badge. */
function badgeTextColor(hex: string): string {
  const normalized = hex.replace("#", "");
  if (normalized.length !== 6) return "#fff";
  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? "#111" : "#fff";
}

function ProviderBadge({ serviceId }: { serviceId: string }) {
  const service = serviceById(serviceId);
  if (!service) return null;
  return (
    <span
      className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px] font-bold"
      style={{
        backgroundColor: service.color,
        color: badgeTextColor(service.color),
      }}
      aria-hidden
    >
      {service.shortLabel.charAt(0)}
    </span>
  );
}

function FilterChipMenu({
  id,
  label,
  active,
  open,
  options,
  selectedId,
  onToggle,
  onSelect,
}: {
  id: FilterMenuId;
  label: string;
  active: boolean;
  open: boolean;
  options: BrowseFilterOption[];
  selectedId: string;
  onToggle: () => void;
  onSelect: (optionId: string) => void;
}) {
  return (
    <div className="lf-filter-chip-wrap">
      <button
        type="button"
        className={`lf-filter-chip ${active || open ? "lf-filter-chip--active" : ""}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={`lf-filter-menu-${id}`}
        onClick={onToggle}
      >
        {id === "sort" && active && (
          <Shuffle className="h-3.5 w-3.5" strokeWidth={2} />
        )}
        {label}
        <ChevronDown
          className={`h-3.5 w-3.5 opacity-70 transition-transform ${open ? "rotate-180" : ""}`}
          strokeWidth={2}
        />
      </button>
      {open && (
        <div
          id={`lf-filter-menu-${id}`}
          className="lf-filter-menu"
          role="listbox"
          aria-label={label}
        >
          {options.map((option) => {
            const selected = option.id === selectedId;
            const showProviderBadge = id === "provider" && option.id !== "";
            return (
              <button
                key={option.id || `${id}-all`}
                type="button"
                role="option"
                aria-selected={selected}
                className={`lf-filter-menu__item ${selected ? "lf-filter-menu__item--active" : ""}`}
                onClick={() => onSelect(option.id)}
              >
                {showProviderBadge ? (
                  <span className="flex items-center gap-2">
                    <ProviderBadge serviceId={option.id} />
                    <span className="min-w-0 flex-1 truncate">
                      {option.label}
                    </span>
                  </span>
                ) : (
                  option.label
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function SectionBrowsePage(props: SectionBrowsePageProps) {
  const {
    title,
    subtitle,
    syncing,
    loading,
    items,
    sectionId,
    streamingRows = [],
    catalogIndex = [],
    onPlay,
    onPlayStreaming,
    onOpenDetail,
    onOpenSeries,
  } = props;

  const lordFlixBrowse = isLordFlixBrowseSection(sectionId);
  const [filters, setFilters] = useState<BrowseFilterState>(DEFAULT_BROWSE_FILTERS);
  const [openMenu, setOpenMenu] = useState<FilterMenuId | null>(null);
  const filterBarRef = useRef<HTMLDivElement | null>(null);

  const baseItems = useMemo(() => {
    if (lordFlixBrowse) return items;
    return [...items].sort((a, b) =>
      browseItemMedia(a).title.localeCompare(browseItemMedia(b).title, "it"),
    );
  }, [items, lordFlixBrowse]);

  const filteredItems = useMemo(() => {
    if (!lordFlixBrowse) return baseItems;
    return filterAndSortBrowseItems(
      baseItems,
      filters,
      streamingRows,
      catalogIndex,
    );
  }, [baseItems, catalogIndex, filters, lordFlixBrowse, streamingRows]);

  const genreOptions = useMemo(
    () => genreFilterOptions(baseItems),
    [baseItems],
  );
  const yearOptions = useMemo(
    () => collectYearOptions(baseItems),
    [baseItems],
  );
  const providerOptions = useMemo(
    () => collectProviderOptions(baseItems),
    [baseItems],
  );

  useEffect(() => {
    setFilters(DEFAULT_BROWSE_FILTERS);
    setOpenMenu(null);
  }, [sectionId]);

  useEffect(() => {
    if (!openMenu) return;

    const onPointerDown = (event: MouseEvent) => {
      const root = filterBarRef.current;
      if (!root) return;
      if (event.target instanceof Node && !root.contains(event.target)) {
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

  const handleOpen = (browse: BrowseItem) => {
    openBrowseItem(browse, {
      onPlay,
      onPlayStreaming,
      onOpenDetail,
      onOpenSeries,
    });
  };

  const toggleMenu = (id: FilterMenuId) => {
    setOpenMenu((current) => (current === id ? null : id));
  };

  const applyFilter = (patch: Partial<BrowseFilterState>) => {
    setFilters((current) => ({ ...current, ...patch }));
    setOpenMenu(null);
  };

  if (loading && items.length === 0) {
    return (
      <BrowseGridSkeleton
        className={lordFlixBrowse ? "" : "pt-24"}
        count={18}
      />
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
          {syncing ? (
            <>
              <BrowseGridSkeleton withHeader={false} count={12} className="!pt-0 !pb-0" />
              <p className="mt-6 text-[14px] text-text-muted">
                Sto preparando il catalogo…
              </p>
            </>
          ) : (
            <p className="mt-3 text-[14px] text-text-muted">
              Nessun contenuto trovato in questa sezione.
            </p>
          )}
        </motion.div>
      </div>
    );
  }

  const catalogCountLabel = `${filteredItems.length.toLocaleString("it-IT")} titoli`;
  const filtersActive =
    filters.genre != null ||
    filters.year != null ||
    filters.provider != null ||
    filters.sort !== "popular";

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.35 }}
      className={`page-px pb-[max(5rem,var(--mobile-nav-height))] sm:pb-20 ${lordFlixBrowse ? "lf-discovery-page" : ""}`}
    >
      <header
        className={`lf-discovery-header ${lordFlixBrowse ? "lf-discovery-header--browse" : ""}`}
      >
        <div className="lf-discovery-header__row">
          <div className="lf-discovery-header__copy">
            <h1 className="lf-discovery-header__title">{title}</h1>
            <p className="lf-discovery-header__subtitle">
              {lordFlixBrowse
                ? `${catalogCountLabel} · ${subtitle ?? `Scopri ${title.toLowerCase()} da guardare`}`
                : (subtitle ?? `Scopri ${title.toLowerCase()} da guardare`)}
              {syncing && !lordFlixBrowse && (
                <span className="text-white/40"> · Aggiornamento catalogo…</span>
              )}
            </p>
            {syncing && lordFlixBrowse && (
              <p className="lf-discovery-header__sync">Aggiornamento catalogo…</p>
            )}
          </div>

          {lordFlixBrowse && (
            <div
              ref={filterBarRef}
              className="lf-filter-bar"
              role="toolbar"
              aria-label="Filtri catalogo"
            >
              <FilterChipMenu
                id="genre"
                label={browseFilterChipLabel("genre", filters)}
                active={isBrowseFilterActive("genre", filters)}
                open={openMenu === "genre"}
                options={genreOptions}
                selectedId={filters.genre ?? ""}
                onToggle={() => toggleMenu("genre")}
                onSelect={(optionId) =>
                  applyFilter({ genre: optionId || null })
                }
              />
              <FilterChipMenu
                id="year"
                label={browseFilterChipLabel("year", filters)}
                active={isBrowseFilterActive("year", filters)}
                open={openMenu === "year"}
                options={yearOptions}
                selectedId={filters.year != null ? String(filters.year) : ""}
                onToggle={() => toggleMenu("year")}
                onSelect={(optionId) => {
                  const year = optionId ? Number.parseInt(optionId, 10) : null;
                  applyFilter({
                    year: year != null && Number.isFinite(year) ? year : null,
                  });
                }}
              />
              <FilterChipMenu
                id="sort"
                label={browseFilterChipLabel("sort", filters)}
                active={
                  isBrowseFilterActive("sort", filters) ||
                  filters.sort === "popular"
                }
                open={openMenu === "sort"}
                options={BROWSE_SORT_OPTIONS}
                selectedId={filters.sort}
                onToggle={() => toggleMenu("sort")}
                onSelect={(optionId) =>
                  applyFilter({ sort: optionId as BrowseSortId })
                }
              />
              <FilterChipMenu
                id="provider"
                label={browseFilterChipLabel("provider", filters)}
                active={isBrowseFilterActive("provider", filters)}
                open={openMenu === "provider"}
                options={providerOptions}
                selectedId={filters.provider ?? ""}
                onToggle={() => toggleMenu("provider")}
                onSelect={(optionId) =>
                  applyFilter({ provider: optionId || null })
                }
              />
            </div>
          )}
        </div>

        {!lordFlixBrowse && (
          <p className="mt-4 text-[12px] text-white/40">{catalogCountLabel}</p>
        )}
      </header>

      {lordFlixBrowse && filteredItems.length === 0 ? (
        <div className="flex min-h-[40vh] flex-col items-center justify-center py-16 text-center">
          <p className="text-[15px] font-medium text-white/85">
            Nessun titolo con questi filtri
          </p>
          <p className="mt-2 max-w-sm text-[13px] text-white/45">
            Prova a cambiare genere, anno o provider
            {filtersActive ? ", oppure ripristina i filtri." : "."}
          </p>
          {filtersActive && (
            <button
              type="button"
              className="lf-filter-chip mt-5 lf-filter-chip--active"
              onClick={() => {
                setFilters(DEFAULT_BROWSE_FILTERS);
                setOpenMenu(null);
              }}
            >
              Ripristina filtri
            </button>
          )}
        </div>
      ) : (
        <>
          <VirtualizedDiscoveryGrid
            items={filteredItems}
            className={`lf-discovery-grid ${lordFlixBrowse ? "lf-discovery-grid--browse" : ""}`}
            getKey={(browse) => browseItemId(browse)}
            renderItem={(browse) => (
              <LordFlixPosterCard
                browse={browse}
                layout="grid"
                onOpen={handleOpen}
              />
            )}
          />
        </>
      )}
    </motion.div>
  );
}
