import { memo, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2, Play, RefreshCw, Search } from "lucide-react";
import type { BrowseItem } from "../lib/browse";
import { browseItemMedia } from "../lib/browse";
import {
  browseItemTitle,
  buildCartoniBrowseLayout,
  cartoniBrowseStats,
  cartoniItemSubtitle,
  filterCartoniGrid,
  openBrowseItem,
  paginateCartoniGrid,
  type CartoniGridFilter,
} from "../lib/cartoniBrowse";
import { ARCHIVIO_CARTONI_LOGO } from "../lib/brandAssets";
import { cleanStreamingSynopsis } from "../lib/htmlText";
import type { StremioMetaPreview } from "../types/stremio";
import { PosterImage } from "./PosterImage";
import { StreamingProviderBadge } from "./StreamingProviderBadge";

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
  { id: "streaming", label: "In streaming" },
  { id: "local", label: "In locale" },
];

const ACCENT = "#e63946";

function useRowScroll() {
  const ref = useRef<HTMLDivElement>(null);
  const scroll = (dir: "left" | "right") => {
    ref.current?.scrollBy({ left: dir === "left" ? -520 : 520, behavior: "smooth" });
  };
  return { ref, scroll };
}

const CartoniCard = memo(function CartoniCard({
  item,
  onClick,
  compact,
  wide,
}: {
  item: BrowseItem;
  onClick: () => void;
  compact?: boolean;
  wide?: boolean;
}) {
  const media = browseItemMedia(item);
  const subtitle = cartoniItemSubtitle(item);
  const widthClass = wide
    ? "w-[220px] sm:w-[260px]"
    : compact
      ? "w-[168px] sm:w-[188px]"
      : "w-full";

  return (
    <button
      type="button"
      onClick={onClick}
      className={`group shrink-0 text-left ${widthClass}`}
    >
      <div
        className={`relative overflow-hidden rounded-xl bg-[#14141c] ring-1 ring-white/[0.08] transition duration-300 group-hover:-translate-y-0.5 group-hover:ring-[#e63946]/45 ${
          wide ? "aspect-[21/9]" : "aspect-[16/10]"
        }`}
      >
        <PosterImage item={media} variant="browse" className="transition duration-500 group-hover:scale-[1.04]" />
        {item.kind === "streaming" && (
          <div className="absolute right-2 top-2">
            <StreamingProviderBadge catalogPrefix={item.preview.catalogPrefix} />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/10 to-transparent" />
        {wide && (
          <div className="absolute inset-0 flex items-center justify-center px-4">
            <p className="text-center font-display text-[15px] font-semibold tracking-[-0.02em] text-white drop-shadow-lg sm:text-[17px]">
              {browseItemTitle(item)}
            </p>
          </div>
        )}
      </div>
      {!wide && (
        <>
          <p className="mt-2 line-clamp-2 text-[13px] font-semibold leading-snug text-text-primary group-hover:text-white">
            {browseItemTitle(item)}
          </p>
          {subtitle && (
            <p className="mt-0.5 line-clamp-1 text-[11px] text-text-muted">{subtitle}</p>
          )}
        </>
      )}
    </button>
  );
});

function CartoniRow({
  title,
  items,
  onOpen,
  wide,
}: {
  title: string;
  items: BrowseItem[];
  onOpen: (item: BrowseItem) => void;
  wide?: boolean;
}) {
  const { ref, scroll } = useRowScroll();
  if (items.length === 0) return null;

  return (
    <section className="page-px py-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="font-display text-xl font-semibold tracking-[-0.02em] text-text-primary sm:text-2xl">
          <span className="mr-2" style={{ color: ACCENT }}>
            ▸
          </span>
          {title}
        </h2>
        <div className="hidden items-center gap-1 sm:flex">
          <button
            type="button"
            onClick={() => scroll("left")}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-black/40 text-text-secondary hover:text-white"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => scroll("right")}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-black/40 text-text-secondary hover:text-white"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div ref={ref} className="hide-scrollbar flex gap-3 overflow-x-auto pb-1 sm:gap-4">
        {items.map((item) => (
          <CartoniCard
            key={browseItemTitle(item) + item.kind}
            item={item}
            compact={!wide}
            wide={wide}
            onClick={() => onOpen(item)}
          />
        ))}
      </div>
    </section>
  );
}

function CartoniHero({
  posters,
  title,
  subtitle,
  stats,
  syncing,
}: {
  posters: string[];
  title: string;
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
              className="h-full flex-1 bg-cover bg-center opacity-30"
              style={{ backgroundImage: `url(${url})` }}
              aria-hidden
            />
          ))
        ) : (
          <div className="h-full w-full bg-gradient-to-br from-[#1a0505] via-void to-black" />
        )}
      </div>
      <div className="absolute inset-0 bg-gradient-to-t from-void via-void/90 to-void/25" />
      <div className="hero-vignette absolute inset-0" />
      <div className="page-px relative z-10 flex h-full flex-col items-center justify-center py-16 text-center sm:py-20">
        <img
          src={ARCHIVIO_CARTONI_LOGO}
          alt={title}
          className="w-full max-w-[min(92vw,520px)] object-contain drop-shadow-lg"
        />
        <p className="mt-4 max-w-xl text-[14px] text-text-secondary sm:text-[15px]">
          {subtitle ?? "Animazione, avventure e streaming"}
          {syncing && " · Aggiornamento catalogo…"}
        </p>
        <p className="mt-3 text-[12px] text-text-muted">
          {stats.total.toLocaleString("it-IT")} titoli
          {stats.loonex > 0 && ` · ${stats.loonex.toLocaleString("it-IT")} Loonex`}
          {stats.streaming > stats.loonex &&
            ` · ${(stats.streaming - stats.loonex).toLocaleString("it-IT")} altri streaming`}
          {stats.local > 0 && ` · ${stats.local.toLocaleString("it-IT")} in locale`}
        </p>
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
    <section className="page-px py-6">
      <h2 className="mb-4 font-display text-xl font-semibold tracking-[-0.02em] text-text-primary sm:text-2xl">
        <span className="mr-2" style={{ color: ACCENT }}>
          ▸
        </span>
        Consigliato dalla Community
      </h2>
      <div className="grid gap-5 overflow-hidden rounded-2xl border border-white/[0.08] bg-gradient-to-br from-white/[0.04] to-white/[0.01] p-4 sm:grid-cols-[220px_1fr] sm:p-6">
        <button
          type="button"
          onClick={onOpen}
          className="relative aspect-[2/3] overflow-hidden rounded-xl ring-1 ring-white/10"
        >
          <PosterImage item={media} variant="browse" />
        </button>
        <div className="flex min-w-0 flex-col justify-center">
          <h3 className="font-display text-2xl font-semibold tracking-[-0.03em] text-text-primary sm:text-3xl">
            {browseItemTitle(item)}
          </h3>
          {description && (
            <p className="mt-3 line-clamp-4 text-[14px] leading-relaxed text-text-secondary">
              {description}
            </p>
          )}
          <button
            type="button"
            onClick={onPlay}
            className="mt-5 inline-flex w-fit items-center gap-2 rounded-full px-6 py-2.5 text-[14px] font-semibold text-white transition hover:brightness-110"
            style={{ backgroundColor: ACCENT }}
          >
            <Play className="h-4 w-4 fill-current" />
            Guarda ora
          </button>
        </div>
      </div>
    </section>
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
    return (
      <div className="flex min-h-[50vh] items-center justify-center pt-8">
        <Loader2 className="h-8 w-8 animate-spin" style={{ color: ACCENT }} />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="flex min-h-[55vh] flex-col items-center justify-center page-px pt-8 text-center">
        <h2 className="font-display text-2xl font-semibold text-text-primary">{title}</h2>
        <p className="mt-3 max-w-md text-[14px] text-text-muted">
          Nessun cartone trovato. {syncing ? "Il catalogo si sta aggiornando." : "Prova ad aggiornare il catalogo."}
        </p>
        {onRefreshCatalog && (
          <button
            type="button"
            onClick={onRefreshCatalog}
            className="mt-5 inline-flex items-center gap-2 rounded-full border border-white/10 px-5 py-2 text-[13px] text-text-secondary hover:text-white"
          >
            <RefreshCw className="h-4 w-4" />
            Aggiorna catalogo
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="relative z-0 pb-20">
      <CartoniHero
        posters={layout.heroPosters}
        title="Archivio Cartoni"
        subtitle={subtitle}
        stats={stats}
        syncing={syncing}
      />

      <div className="relative z-10 -mt-4 sm:-mt-6">
        {(syncing || showCatalogHint) && (
          <div className="page-px pb-3">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3">
              <p className="text-[13px] text-text-secondary">
                {syncing
                  ? "Sincronizzazione archivio Loonex in corso…"
                  : `Archivio parziale (${stats.loonex} titoli Loonex). Aggiorna per scaricare l'archivio completo.`}
              </p>
              {onRefreshCatalog && !syncing && (
                <button
                  type="button"
                  onClick={onRefreshCatalog}
                  className="inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-[12px] font-medium text-white"
                  style={{ backgroundColor: ACCENT }}
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Aggiorna
                </button>
              )}
              {syncing && <Loader2 className="h-4 w-4 animate-spin text-text-muted" />}
            </div>
          </div>
        )}

        <div className="page-px flex flex-wrap items-center justify-center gap-2 pb-3">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => {
                setFilter(f.id);
                setPage(1);
              }}
              className={`rounded-full px-4 py-2 text-[12px] font-medium transition ${
                filter === f.id
                  ? "text-white"
                  : "border border-white/10 bg-white/[0.04] text-text-secondary hover:text-text-primary"
              }`}
              style={filter === f.id ? { backgroundColor: ACCENT } : undefined}
            >
              {f.label}
            </button>
          ))}
        </div>

        {layout.local.length > 0 && (
          <CartoniRow title="Dalla tua libreria" items={layout.local.slice(0, 14)} onOpen={openItem} />
        )}

        <CartoniRow title="Novità" items={layout.novita} onOpen={openItem} />

        {layout.communityPick && (
          <CommunityFeatured
            item={layout.communityPick}
            onOpen={() => openItem(layout.communityPick!)}
            onPlay={() => openItem(layout.communityPick!)}
          />
        )}

        {layout.collections.map((collection) => (
          <CartoniRow
            key={collection.label}
            title={collection.label}
            items={collection.items}
            onOpen={openItem}
            wide
          />
        ))}

        <CartoniRow title="I più visti" items={layout.popular} onOpen={openItem} />

        <section className="page-px py-8">
          <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <h2 className="font-display text-xl font-semibold tracking-[-0.02em] text-text-primary sm:text-2xl">
              <span className="mr-2" style={{ color: ACCENT }}>
                ▸
              </span>
              Tutti i cartoni
            </h2>
            <label className="relative w-full max-w-xs">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
              <input
                type="search"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                placeholder="Cerca nel catalogo…"
                className="w-full rounded-full border border-white/10 bg-white/[0.04] py-2 pl-9 pr-4 text-[13px] text-text-primary outline-none ring-0 placeholder:text-text-muted focus:border-white/20"
              />
            </label>
          </div>

          {paged.items.length === 0 ? (
            <p className="rounded-xl border border-white/10 bg-white/[0.02] px-4 py-10 text-center text-[14px] text-text-muted">
              Nessun risultato per questa ricerca o filtro.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {paged.items.map((item) => (
                <CartoniCard
                  key={`grid-${browseItemTitle(item)}`}
                  item={item}
                  onClick={() => openItem(item)}
                />
              ))}
            </div>
          )}

          {paged.totalPages > 1 && (
            <div className="mt-8 flex flex-wrap items-center justify-center gap-2">
              <button
                type="button"
                disabled={paged.page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 text-text-secondary disabled:opacity-40"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
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
                    className={`min-w-9 rounded-lg px-3 py-1.5 text-[13px] font-medium ${
                      n === paged.page
                        ? "text-white"
                        : "border border-white/10 text-text-secondary hover:text-text-primary"
                    }`}
                    style={n === paged.page ? { backgroundColor: ACCENT } : undefined}
                  >
                    {n}
                  </button>
                ))}
              <button
                type="button"
                disabled={paged.page >= paged.totalPages}
                onClick={() => setPage((p) => Math.min(paged.totalPages, p + 1))}
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 text-text-secondary disabled:opacity-40"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          )}
          <p className="mt-3 text-center text-[11px] text-text-muted">
            Pagina {paged.page} di {paged.totalPages} · {filteredGrid.length} titoli
            {filter !== "all" ? " · filtro attivo" : ""}
            {search.trim() ? " · ricerca attiva" : ""}
          </p>
        </section>
      </div>
    </div>
  );
}
