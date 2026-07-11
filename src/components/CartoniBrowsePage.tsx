import { memo, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  Play,
  RefreshCw,
  Search,
  Sparkles,
} from "lucide-react";
import type { BrowseItem } from "../lib/browse";
import { browseItemMedia, browseItemTitle } from "../lib/browse";
import {
  buildCartoniBrowseLayout,
  cartoniBrowseStats,
  filterCartoniGrid,
  openBrowseItem,
  paginateCartoniGrid,
  type CartoniGridFilter,
} from "../lib/cartoniBrowse";
import { ARCHIVIO_CARTONI_LOGO } from "../lib/brandAssets";
import { cleanStreamingSynopsis } from "../lib/htmlText";
import type { StremioMetaPreview } from "../types/stremio";
import { MediaRow } from "./MediaRow";
import { LordFlixPosterCard } from "./LordFlixPosterCard";
import { PosterImage } from "./PosterImage";
import { StreamingProviderBadge } from "./StreamingProviderBadge";
import {
  SettingsButton,
  SettingsCard,
  SettingsInset,
} from "./settings/SettingsUi";

interface CartoniBrowsePageProps {
  title: string;
  subtitle?: string;
  syncing?: boolean;
  loading?: boolean;
  items: BrowseItem[];
  onPlay: (id: string) => void;
  onPlayStreaming?: (preview: StremioMetaPreview) => void;
  onOpenDetail?: (browse: BrowseItem) => void;
  onOpenSeries?: (seriesKey: string) => void;
  onRefreshCatalog?: () => void;
}

const FILTERS: { id: CartoniGridFilter; label: string }[] = [
  { id: "all", label: "Tutti" },
  { id: "popular", label: "Popolari" },
  { id: "streaming", label: "Loonex" },
  { id: "local", label: "YouTube" },
];

const CARTONI_WARM = "#e63946";

function useRowScroll() {
  const ref = useRef<HTMLDivElement>(null);
  const scroll = (dir: "left" | "right") => {
    ref.current?.scrollBy({ left: dir === "left" ? -520 : 520, behavior: "smooth" });
  };
  return { ref, scroll };
}

const CartoniWideCard = memo(function CartoniWideCard({
  item,
  onClick,
}: {
  item: BrowseItem;
  onClick: () => void;
}) {
  const media = browseItemMedia(item);
  const title = browseItemTitle(item);

  return (
    <button
      type="button"
      onClick={onClick}
      className="group shrink-0 w-[220px] text-left sm:w-[260px]"
      aria-label={title}
    >
      <div className="lf-glass-card relative aspect-[21/9] overflow-hidden transition-transform duration-300 group-hover:scale-[1.02]">
        <PosterImage
          item={media}
          variant="browse"
          className="object-cover transition duration-500 group-hover:scale-[1.04]"
        />
        {item.kind === "streaming" && (
          <div className="absolute right-2 top-2 z-[2]">
            <StreamingProviderBadge catalogPrefix={item.preview.catalogPrefix} />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 z-[2] p-3">
          <p className="line-clamp-2 font-display text-[14px] font-semibold tracking-[-0.02em] text-white drop-shadow-md sm:text-[15px]">
            {title}
          </p>
        </div>
      </div>
    </button>
  );
});

function CartoniCollectionRow({
  title,
  items,
  onOpen,
}: {
  title: string;
  items: BrowseItem[];
  onOpen: (item: BrowseItem) => void;
}) {
  const { ref, scroll } = useRowScroll();
  if (items.length === 0) return null;

  return (
    <section className="group/row lf-home-row relative overflow-visible">
      <div className="page-px mb-1 flex items-center justify-between gap-3">
        <h2 className="lf-home-row__title title-safe">{title}</h2>
        <div className="hidden items-center gap-1 sm:flex">
          <button
            type="button"
            onClick={() => scroll("left")}
            aria-label="Scorri a sinistra"
            className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-black/40 text-text-secondary opacity-0 transition-all hover:text-white group-hover/row:opacity-100"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => scroll("right")}
            aria-label="Scorri a destra"
            className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-black/40 text-text-secondary opacity-0 transition-all hover:text-white group-hover/row:opacity-100"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div className="lf-row-scroll relative">
        <div
          ref={ref}
          className="scrollbar-hide page-px lf-row-scroll__track lf-row-scroll__track--trailers"
        >
          {items.map((item) => (
            <CartoniWideCard
              key={browseItemTitle(item) + item.kind}
              item={item}
              onClick={() => onOpen(item)}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

function CartoniHero({
  posters,
  subtitle,
  stats,
  syncing,
}: {
  posters: string[];
  subtitle?: string;
  stats: ReturnType<typeof cartoniBrowseStats>;
  syncing?: boolean;
}) {
  return (
    <div className="relative h-[38vh] min-h-[260px] max-h-[440px] w-full shrink-0 overflow-hidden sm:h-[42vh] sm:min-h-[300px]">
      <div className="absolute inset-0 flex">
        {posters.length > 0 ? (
          posters.map((url) => (
            <div
              key={url}
              className="h-full flex-1 bg-cover bg-center opacity-35"
              style={{ backgroundImage: `url(${url})` }}
              aria-hidden
            />
          ))
        ) : (
          <div className="h-full w-full bg-gradient-to-br from-[#1a0505] via-void to-black" />
        )}
      </div>
      <div
        className="absolute inset-0 opacity-60"
        style={{
          background: `radial-gradient(ellipse 80% 60% at 50% 100%, ${CARTONI_WARM}22, transparent 70%)`,
        }}
        aria-hidden
      />
      <div className="absolute inset-0 bg-gradient-to-t from-void via-void/92 to-void/30" />
      <div className="hero-vignette absolute inset-0" />

      <div className="page-px relative z-10 flex h-full flex-col items-center justify-center py-16 text-center sm:py-20">
        <motion.img
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
          src={ARCHIVIO_CARTONI_LOGO}
          alt="Archivio Cartoni"
          className="w-full max-w-[min(92vw,520px)] object-contain drop-shadow-[0_12px_40px_rgba(0,0,0,0.45)]"
        />
        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08, duration: 0.45 }}
          className="mt-4 max-w-xl text-[14px] leading-relaxed text-text-secondary sm:text-[15px]"
        >
          {subtitle ?? "Animazione, avventure e streaming"}
          {syncing && " · Aggiornamento catalogo…"}
        </motion.p>
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.14, duration: 0.45 }}
          className="mt-4 flex flex-wrap items-center justify-center gap-2"
        >
          <span className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1 text-[11px] font-medium text-text-secondary backdrop-blur-md">
            {stats.total.toLocaleString("it-IT")} titoli
          </span>
          {stats.loonex > 0 && (
            <span className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1 text-[11px] font-medium text-text-secondary backdrop-blur-md">
              {stats.loonex.toLocaleString("it-IT")} Loonex
            </span>
          )}
          {stats.streaming - stats.loonex > 0 && (
            <span className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1 text-[11px] font-medium text-text-secondary backdrop-blur-md">
              {(stats.streaming - stats.loonex).toLocaleString("it-IT")} YouTube
            </span>
          )}
        </motion.div>
      </div>
    </div>
  );
}

function CommunityFeatured({
  item,
  onOpen,
  onPlay,
}: {
  item: BrowseItem;
  onOpen: () => void;
  onPlay: () => void;
}) {
  const media = browseItemMedia(item);
  const description =
    item.kind === "streaming"
      ? cleanStreamingSynopsis(item.preview.description, browseItemTitle(item))
      : media.description;

  return (
    <section className="page-px py-2">
      <h2 className="lf-home-row__title title-safe mb-4">Consigliato dalla Community</h2>
      <SettingsCard
        className="border-[#e63946]/20 shadow-[0_16px_48px_rgba(0,0,0,0.35),0_0_36px_rgba(230,57,70,0.08)]"
      >
        <div className="grid gap-5 sm:grid-cols-[180px_1fr] sm:items-center">
          <button
            type="button"
            onClick={onOpen}
            className="lf-browse-card lf-browse-card--grid group/card mx-auto w-full max-w-[180px] sm:mx-0"
          >
            <div className="lf-browse-card__stage">
              <div className="lf-browse-card__frame">
                <PosterImage item={media} variant="browse" className="lf-browse-card__img" />
                <div className="lf-browse-card__sheen" aria-hidden />
              </div>
            </div>
          </button>
          <div className="min-w-0 text-center sm:text-left">
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#e63946]">
              In evidenza
            </p>
            <h3 className="font-display mt-2 text-[clamp(1.35rem,3vw,2rem)] font-semibold tracking-[-0.03em] text-text-primary">
              {browseItemTitle(item)}
            </h3>
            {description && (
              <p className="mt-3 line-clamp-4 text-[13px] leading-relaxed text-text-muted">
                {description}
              </p>
            )}
            <SettingsButton
              variant="primary"
              onClick={onPlay}
              className="mt-5"
              style={{ backgroundColor: CARTONI_WARM, color: "#fff" }}
            >
              <Play className="h-4 w-4 fill-current" />
              Guarda ora
            </SettingsButton>
          </div>
        </div>
      </SettingsCard>
    </section>
  );
}

function CartoniLoadingSkeleton() {
  return (
    <div className="pb-[max(5rem,var(--mobile-nav-height))] sm:pb-20">
      <div className="h-[38vh] min-h-[260px] shimmer" />
      <div className="page-px mt-8 space-y-8">
        <div className="flex gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-9 w-24 shimmer rounded-full" />
          ))}
        </div>
        <div>
          <div className="mb-4 h-6 w-40 shimmer rounded" />
          <div className="flex gap-4 overflow-hidden">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-[210px] w-[140px] shrink-0 shimmer rounded-2xl" />
            ))}
          </div>
        </div>
        <div className="lf-discovery-grid lf-discovery-grid--browse">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="aspect-[2/3] shimmer rounded-2xl" />
          ))}
        </div>
      </div>
    </div>
  );
}

export function CartoniBrowsePage({
  title,
  subtitle,
  syncing,
  loading,
  items,
  onPlay,
  onPlayStreaming,
  onOpenDetail,
  onOpenSeries,
  onRefreshCatalog,
}: CartoniBrowsePageProps) {
  const [filter, setFilter] = useState<CartoniGridFilter>("all");
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");

  const stats = useMemo(() => cartoniBrowseStats(items), [items]);
  const layout = useMemo(() => buildCartoniBrowseLayout(items), [items]);
  const filteredGrid = useMemo(() => {
    const base = filterCartoniGrid(layout.all, filter);
    const q = search.trim().toLowerCase();
    if (!q) return base;
    return base.filter((item) => browseItemTitle(item).toLowerCase().includes(q));
  }, [layout.all, filter, search]);
  const paged = useMemo(
    () => paginateCartoniGrid(filteredGrid, page),
    [filteredGrid, page],
  );

  const handlers = { onPlay, onPlayStreaming, onOpenDetail, onOpenSeries };
  const openItem = (item: BrowseItem) => openBrowseItem(item, handlers);

  const showCatalogHint = stats.loonex < 120 && !syncing;

  if (loading && items.length === 0) {
    return <CartoniLoadingSkeleton />;
  }

  if (items.length === 0) {
    return (
      <div className="flex min-h-[55vh] flex-col items-center justify-center page-px pt-24 text-center">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md"
        >
          <p className="lf-discovery-header__title">{title}</p>
          <p className="mt-3 text-[14px] text-text-muted">
            Nessun cartone trovato.{" "}
            {syncing ? "Il catalogo si sta aggiornando." : "Prova ad aggiornare il catalogo."}
          </p>
          {onRefreshCatalog && (
            <SettingsButton
              variant="secondary"
              onClick={onRefreshCatalog}
              className="mt-5"
            >
              <RefreshCw className="h-4 w-4" />
              Aggiorna catalogo
            </SettingsButton>
          )}
        </motion.div>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.35 }}
      className="relative z-0 pb-[max(5rem,var(--mobile-nav-height))] sm:pb-20"
    >
      <CartoniHero
        posters={layout.heroPosters}
        subtitle={subtitle}
        stats={stats}
        syncing={syncing}
      />

      <div className="relative z-10 -mt-2 space-y-2 sm:-mt-4">
        {(syncing || showCatalogHint) && (
          <div className="page-px pb-1 pt-3">
            <SettingsInset className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-[13px] leading-relaxed text-text-secondary">
                {syncing
                  ? "Sincronizzazione archivio Loonex in corso…"
                  : `Archivio parziale (${stats.loonex} titoli Loonex). Aggiorna per scaricare l'archivio completo.`}
              </p>
              {onRefreshCatalog && !syncing && (
                <SettingsButton
                  variant="primary"
                  onClick={onRefreshCatalog}
                  className="shrink-0 py-2"
                  style={{ backgroundColor: CARTONI_WARM, color: "#fff" }}
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Aggiorna
                </SettingsButton>
              )}
              {syncing && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-text-muted" />}
            </SettingsInset>
          </div>
        )}

        <div className="page-px pb-2 pt-2">
          <div className="lf-filter-bar !mt-0" role="toolbar" aria-label="Filtri cartoni">
            {FILTERS.map((f) => {
              const active = filter === f.id;
              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => {
                    setFilter(f.id);
                    setPage(1);
                  }}
                  className={`lf-filter-chip ${active ? "lf-filter-chip--active" : ""}`}
                >
                  {active && f.id === "all" && (
                    <Sparkles className="h-3.5 w-3.5" strokeWidth={2} />
                  )}
                  {f.label}
                </button>
              );
            })}
          </div>
        </div>

        {layout.novita.length > 0 && (
          <MediaRow
            title="Novità"
            items={layout.novita}
            onPlay={onPlay}
            onPlayStreaming={onPlayStreaming}
            onOpenDetail={onOpenDetail}
            onOpenSeries={onOpenSeries}
          />
        )}

        {layout.communityPick && (
          <CommunityFeatured
            item={layout.communityPick}
            onOpen={() => openItem(layout.communityPick!)}
            onPlay={() => openItem(layout.communityPick!)}
          />
        )}

        {layout.collections.map((collection) => (
          <CartoniCollectionRow
            key={collection.label}
            title={collection.label}
            items={collection.items}
            onOpen={openItem}
          />
        ))}

        <MediaRow
          title="I più visti"
          items={layout.popular}
          onPlay={onPlay}
          onPlayStreaming={onPlayStreaming}
          onOpenDetail={onOpenDetail}
          onOpenSeries={onOpenSeries}
        />

        <section className="page-px py-8">
          <header className="lf-discovery-header lf-discovery-header--browse !px-0 !pt-2">
            <div className="lf-discovery-header__row">
              <div className="lf-discovery-header__copy">
                <h2 className="lf-discovery-header__title">Tutti i cartoni</h2>
                <p className="lf-discovery-header__subtitle">
                  {filteredGrid.length.toLocaleString("it-IT")} titoli nel catalogo
                  {filter !== "all" ? " · filtro attivo" : ""}
                  {search.trim() ? " · ricerca attiva" : ""}
                </p>
              </div>
              <label className="relative w-full max-w-xs lg:max-w-sm">
                <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
                <input
                  type="search"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(1);
                  }}
                  placeholder="Cerca nel catalogo…"
                  className="w-full rounded-full border border-white/[0.08] bg-white/[0.03] py-2.5 pl-10 pr-4 text-[13px] text-text-primary outline-none transition-colors placeholder:text-text-muted/60 focus:border-white/18 focus:bg-white/[0.05]"
                />
              </label>
            </div>
          </header>

          {paged.items.length === 0 ? (
            <SettingsInset className="py-10 text-center text-[14px] text-text-muted">
              Nessun risultato per questa ricerca o filtro.
            </SettingsInset>
          ) : (
            <div className="lf-discovery-grid lf-discovery-grid--browse">
              {paged.items.map((item) => (
                <LordFlixPosterCard
                  key={`grid-${browseItemTitle(item)}`}
                  browse={item}
                  layout="grid"
                  onPlay={onPlay}
                  onPlayStreaming={onPlayStreaming}
                  onOpenDetail={onOpenDetail}
                  onOpenSeries={onOpenSeries}
                />
              ))}
            </div>
          )}

          {paged.totalPages > 1 && (
            <div className="mt-8 flex flex-wrap items-center justify-center gap-2">
              <SettingsButton
                variant="secondary"
                disabled={paged.page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="h-9 w-9 p-0"
              >
                <ChevronLeft className="h-4 w-4" />
              </SettingsButton>
              {Array.from({ length: paged.totalPages }, (_, i) => i + 1)
                .filter((n) => {
                  const dist = Math.abs(n - paged.page);
                  return dist <= 2 || n === 1 || n === paged.totalPages;
                })
                .map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setPage(n)}
                    className={`min-w-9 rounded-full px-3 py-1.5 text-[13px] font-medium transition-colors ${
                      n === paged.page
                        ? "bg-white text-void shadow-[0_2px_12px_rgba(0,0,0,0.25)]"
                        : "border border-white/10 text-text-secondary hover:border-white/18 hover:text-text-primary"
                    }`}
                  >
                    {n}
                  </button>
                ))}
              <SettingsButton
                variant="secondary"
                disabled={paged.page >= paged.totalPages}
                onClick={() => setPage((p) => Math.min(paged.totalPages, p + 1))}
                className="h-9 w-9 p-0"
              >
                <ChevronRight className="h-4 w-4" />
              </SettingsButton>
            </div>
          )}
          {paged.totalPages > 1 && (
            <p className="mt-3 text-center text-[11px] text-text-muted">
              Pagina {paged.page} di {paged.totalPages}
            </p>
          )}
        </section>
      </div>
    </motion.div>
  );
}
