import {
  lazy,
  memo,
  Suspense,
  type ReactNode,
  type RefObject,
} from "react";
import { HeroBanner } from "./HeroBanner";
import { MediaRow } from "./MediaRow";
import { HeroSkeleton, RowSkeleton } from "./Skeleton";
import { MangaPromoBanner } from "./MangaPromoBanner";
import { PlatformPromoBanner } from "./PlatformPromoBanner";
import {
  ARCHIVIO_CARTONI_LOGO,
  isArchivioCartoniRow,
} from "../lib/brandAssets";
import type { BrowseItem } from "../lib/browse";
import type { PlatformPromoVariant } from "../lib/platformPromo";
import type { MediaItem } from "../types/media";
import type { StremioMetaPreview } from "../types/stremio";

const NetflixTop10Row = lazy(() =>
  import("./NetflixTop10Row").then((m) => ({ default: m.NetflixTop10Row })),
);

export interface HomeCatalogRow {
  key: string;
  title: string;
  subtitle: string;
  items: BrowseItem[];
}

export interface HomeContinueRow {
  key: string;
  title: string;
  subtitle: string;
  items: BrowseItem[];
}

export interface HomeTop10Row {
  title: string;
  items: StremioMetaPreview[];
}

interface HomeKeepAliveViewProps {
  show: boolean;
  heroItems: MediaItem[];
  homeStreamingPending: boolean;
  continueHomeRow: HomeContinueRow | null;
  top10Row: HomeTop10Row | null;
  homeCatalogRows: HomeCatalogRow[];
  homeCatalogRowsBeforeManga: HomeCatalogRow[];
  homeCatalogRowsAfterManga: HomeCatalogRow[];
  streamingError: string | null;
  hasStreaming: boolean;
  platformPromoVariant: PlatformPromoVariant;
  animateEntrance: boolean;
  scrollContainerRef: RefObject<HTMLElement | null>;
  onPlay: (id: string) => void;
  onPlayStreaming: (preview: StremioMetaPreview) => void;
  onOpenDetail: (browse: BrowseItem) => void;
  onOpenSeries: (seriesKey: string) => void;
  onToggleStreamingList: (preview: StremioMetaPreview) => void;
  onOpenMyList: () => void;
  onOpenCartoni: () => void;
  onOpenManga: () => void;
}

/**
 * Mantiene la home nel DOM quando si naviga altrove.
 * content-visibility (non display:none) cosi' al rientro non rifa' layout totale.
 */
function HomeKeepAliveSlot({
  show,
  children,
}: {
  show: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={
        show
          ? "relative z-[1] lf-home-keepalive"
          : "lf-home-keepalive lf-home-keepalive--parked"
      }
      aria-hidden={!show}
    >
      {children}
    </div>
  );
}

/**
 * Home congelata mentre e' parcheggiata: se show resta false, React salta
 * completamente il re-render dell'albero (righe/hero) anche se continue/catalog
 * cambiano in background. Al rientro (show true) applica i dati aggiornati.
 */
export const HomeKeepAliveView = memo(
  function HomeKeepAliveView({
    show,
    heroItems,
    homeStreamingPending,
    continueHomeRow,
    top10Row,
    homeCatalogRows,
    homeCatalogRowsBeforeManga,
    homeCatalogRowsAfterManga,
    streamingError,
    hasStreaming,
    platformPromoVariant,
    animateEntrance,
    scrollContainerRef,
    onPlay,
    onPlayStreaming,
    onOpenDetail,
    onOpenSeries,
    onToggleStreamingList,
    onOpenMyList,
    onOpenCartoni,
    onOpenManga,
  }: HomeKeepAliveViewProps) {
    return (
      <HomeKeepAliveSlot show={show}>
        {heroItems.length > 0 ? (
          <HeroBanner
            fullPage
            items={heroItems}
            scrollContainerRef={scrollContainerRef}
            onPlay={onPlay}
            onOpenDetail={onOpenDetail}
            onOpenSeries={(media) => {
              if (media.seriesTitle) {
                onOpenSeries(`${media.mediaType}::${media.seriesTitle}`);
              }
            }}
            onToggleStreamingList={onToggleStreamingList}
          />
        ) : (
          <HeroSkeleton />
        )}
        {homeStreamingPending && (
          <div className="page-px pb-2 pt-4">
            <RowSkeleton />
            <RowSkeleton />
          </div>
        )}
        {continueHomeRow && (
          <div className="lf-home-continue-slot relative">
            <MediaRow
              key={continueHomeRow.key}
              index="01"
              title={continueHomeRow.title}
              subtitle={continueHomeRow.subtitle}
              items={continueHomeRow.items}
              layout="continue"
              animateEntrance={animateEntrance}
              onPlay={onPlay}
              onPlayStreaming={onPlayStreaming}
              onOpenSeries={onOpenSeries}
              onToggleStreamingList={onToggleStreamingList}
            />
          </div>
        )}
        <PlatformPromoBanner variant={platformPromoVariant} />
        {top10Row && (
          <div className="lf-home-top10-slot relative">
            <Suspense fallback={null}>
              <NetflixTop10Row
                title={top10Row.title}
                items={top10Row.items}
                onPlayStreaming={onPlayStreaming}
                onOpenDetail={onOpenDetail}
              />
            </Suspense>
          </div>
        )}
        <div className="lf-home-content relative">
          {(homeCatalogRows.length > 0 || streamingError) && (
            <div className="relative space-y-1 overflow-visible">
              {homeCatalogRowsBeforeManga.map((row, i) => (
                <MediaRow
                  key={row.key}
                  index={String(i + 1).padStart(2, "0")}
                  title={row.title}
                  titleLogo={
                    isArchivioCartoniRow(row.key, row.title)
                      ? ARCHIVIO_CARTONI_LOGO
                      : undefined
                  }
                  subtitle={row.subtitle}
                  items={row.items}
                  animateEntrance={animateEntrance}
                  onPlay={onPlay}
                  onPlayStreaming={onPlayStreaming}
                  onOpenDetail={onOpenDetail}
                  onOpenSeries={onOpenSeries}
                  onToggleStreamingList={onToggleStreamingList}
                  actionLabel={
                    row.key === "favorites"
                      ? "Vedi tutto"
                      : row.key === "home-cartoni"
                        ? "Esplora"
                        : undefined
                  }
                  onActionClick={
                    row.key === "favorites"
                      ? onOpenMyList
                      : row.key === "home-cartoni"
                        ? onOpenCartoni
                        : undefined
                  }
                />
              ))}
              <MangaPromoBanner onExplore={onOpenManga} />
              {homeCatalogRowsAfterManga.map((row, i) => (
                <MediaRow
                  key={row.key}
                  index={String(
                    homeCatalogRowsBeforeManga.length + i + 1,
                  ).padStart(2, "0")}
                  title={row.title}
                  titleLogo={
                    isArchivioCartoniRow(row.key, row.title)
                      ? ARCHIVIO_CARTONI_LOGO
                      : undefined
                  }
                  subtitle={row.subtitle}
                  items={row.items}
                  animateEntrance={animateEntrance}
                  onPlay={onPlay}
                  onPlayStreaming={onPlayStreaming}
                  onOpenDetail={onOpenDetail}
                  onOpenSeries={onOpenSeries}
                  onToggleStreamingList={onToggleStreamingList}
                  actionLabel={
                    row.key === "favorites"
                      ? "Vedi tutto"
                      : row.key === "home-cartoni"
                        ? "Esplora"
                        : undefined
                  }
                  onActionClick={
                    row.key === "favorites"
                      ? onOpenMyList
                      : row.key === "home-cartoni"
                        ? onOpenCartoni
                        : undefined
                  }
                />
              ))}
            </div>
          )}

          {hasStreaming && streamingError && homeCatalogRows.length === 0 && (
            <p className="page-px py-8 text-center text-[13px] text-text-muted">
              {streamingError}
            </p>
          )}
        </div>
        <footer className="lf-home-footer page-px">
          <span className="chromatic-logo chromatic-logo--skew lf-home-footer__logo">
            B
          </span>
          <p className="lf-home-footer__text">
            I contenuti sono forniti da cataloghi di terze parti. L&apos;app non
            ospita né distribuisce alcun file multimediale.
          </p>
        </footer>
      </HomeKeepAliveSlot>
    );
  },
  (prev, next) => {
    // Parcheggiata: ignora qualsiasi aggiornamento props (continue/catalog/hero).
    if (!prev.show && !next.show) return true;
    // Qualsiasi altro caso (rientro, dati mentre visibile): re-render.
    return false;
  },
);
