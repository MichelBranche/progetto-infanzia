import { memo, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Play } from "lucide-react";
import type { BrowseItem } from "../lib/browse";
import { browseItemId } from "../lib/browse";
import { fetchRaiplayOnAir, fetchMediasetOnAir } from "../lib/addonsApi";
import { adaptPosterUrl } from "../lib/posterUrl";
import { streamingBrowseItem } from "../lib/streamingBrowse";
import { usePosterQuality } from "../context/PosterQualityContext";
import {
  RowInteractionContext,
  useRowScrollContainer,
  isRowDragging,
} from "../hooks/useRowScrollContainer";
import type { StremioMetaPreview } from "../types/stremio";

const CARD_WIDTH = 216;
const CARD_GAP = 12;

/** Colori brand canale (footer card), allineati alla UI RaiPlay. */
const CHANNEL_COLORS: Record<string, string> = {
  rai1: "#9a7bb8",
  rai2: "#e31c23",
  rai3: "#1a7a4c",
  rai4: "#5c2d91",
  rai5: "#e87722",
  raimovie: "#c45c26",
  raipremium: "#8b3a62",
  raiyoyo: "#f5a623",
  raigulp: "#00a3e0",
  raistoria: "#8b6914",
  raiscuola: "#4a90a4",
  rainews24: "#0096d6",
  raisport: "#003087",
  raisportpiuhd: "#003087",
  raisporthd: "#003087",
  c5: "#00a0e0",
  i1: "#e31c23",
  r4: "#5c2d91",
  ka: "#e87722",
  ki: "#8b3a62",
  kq: "#3d4f66",
  lb: "#1a7a4c",
  b6: "#c45c26",
  lt: "#7a1f2b",
  fu: "#4a90a4",
  i2: "#e31c23",
  kb: "#f5a623",
  la: "#00a3e0",
};

function channelIdFromPreview(preview: StremioMetaPreview): string {
  const slug = (preview.slug ?? preview.id ?? "").toLowerCase();
  return slug.replace(/^live-/, "").replace(/\.json$/, "");
}

function channelColor(preview: StremioMetaPreview): string {
  const id = channelIdFromPreview(preview);
  return CHANNEL_COLORS[id] ?? "#3d4f66";
}

function channelLabel(preview: StremioMetaPreview): string {
  const name = preview.name?.trim();
  if (name) return name;
  const id = channelIdFromPreview(preview);
  if (!id) return "Canale";
  if (id.startsWith("rai")) {
    return id.replace(/^rai/, "Rai ").replace(/\b\w/g, (c) => c.toUpperCase());
  }
  return id.toUpperCase();
}

/** Parsa `live|HH:MM|mins` → orario inizio + progresso 0–1. */
function parseLiveSchedule(releaseInfo?: string): {
  startHour: string | null;
  progress: number;
} {
  const raw = releaseInfo?.trim() ?? "";
  const match = /^live\|(\d{1,2}:\d{2})\|(\d+)$/i.exec(raw);
  if (!match) {
    return { startHour: null, progress: 0.15 };
  }
  const startHour = match[1];
  const durationMins = Math.max(1, Number(match[2]) || 60);
  const [hh, mm] = startHour.split(":").map((n) => Number(n));
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) {
    return { startHour, progress: 0.15 };
  }
  const now = new Date();
  const start = new Date(now);
  start.setHours(hh, mm, 0, 0);
  // Programmi dopo mezzanotte: se start è >6h nel futuro, era ieri.
  if (start.getTime() - now.getTime() > 6 * 60 * 60 * 1000) {
    start.setDate(start.getDate() - 1);
  }
  const elapsed = (now.getTime() - start.getTime()) / 60_000;
  const progress = Math.min(0.98, Math.max(0.02, elapsed / durationMins));
  return { startHour, progress };
}

function programTitle(preview: StremioMetaPreview): string {
  const desc = preview.description?.trim() ?? "";
  const stripped = desc.replace(/^in\s+onda:\s*/i, "").trim();
  if (stripped) return stripped;
  return "In diretta";
}

function BroadcastIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
    >
      <circle cx="12" cy="12" r="2.4" fill="currentColor" />
      <path
        d="M7.2 8.2a6.8 6.8 0 0 0 0 7.6"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M16.8 8.2a6.8 6.8 0 0 1 0 7.6"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M4.2 5.6a11 11 0 0 0 0 12.8"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        opacity="0.75"
      />
      <path
        d="M19.8 5.6a11 11 0 0 1 0 12.8"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        opacity="0.75"
      />
    </svg>
  );
}

function LiveCard({
  preview,
  onPlay,
}: {
  preview: StremioMetaPreview;
  onPlay: (preview: StremioMetaPreview) => void;
}) {
  const { tier } = usePosterQuality();
  const { startHour, progress } = parseLiveSchedule(preview.releaseInfo);
  const thumb = preview.poster || preview.background;
  const adapted = thumb ? adaptPosterUrl(thumb, tier) : undefined;
  const [brokenSrc, setBrokenSrc] = useState<string | null>(null);
  const src =
    adapted && brokenSrc !== adapted ? adapted : undefined;

  return (
    <button
      type="button"
      className="lf-live-card group/live"
      style={{ width: CARD_WIDTH }}
      onClick={() => {
        if (isRowDragging()) return;
        onPlay(preview);
      }}
    >
      <div className="lf-live-card__media">
        {src ? (
          <img
            src={src}
            alt=""
            loading="lazy"
            decoding="async"
            className="lf-live-card__img"
            onError={() => setBrokenSrc(src)}
          />
        ) : (
          <div className="lf-live-card__img lf-live-card__img--empty" />
        )}
        <span className="lf-live-card__badge">{channelLabel(preview)}</span>
        <span className="lf-live-card__play" aria-hidden>
          <Play className="h-5 w-5 fill-white text-white" />
        </span>
      </div>
      <div className="lf-live-card__progress" aria-hidden>
        <div
          className="lf-live-card__progress-fill"
          style={{ width: `${Math.round(progress * 100)}%` }}
        />
      </div>
      <div
        className="lf-live-card__footer"
        style={{ backgroundColor: channelColor(preview) }}
      >
        {startHour ? (
          <p className="lf-live-card__time">{startHour}</p>
        ) : (
          <p className="lf-live-card__time">Live</p>
        )}
        <p className="lf-live-card__title title-safe">{programTitle(preview)}</p>
      </div>
    </button>
  );
}

interface RaiplayLiveHomeRowProps {
  items: BrowseItem[];
  animateEntrance?: boolean;
  onPlayStreaming: (preview: StremioMetaPreview) => void;
  title?: string;
  /** Quale on-air refresh usare. `all` = Rai + Mediaset nella stessa riga. */
  catalog?: "raiplay" | "mediaset" | "all";
}

export const RaiplayLiveHomeRow = memo(function RaiplayLiveHomeRow({
  items,
  animateEntrance = false,
  onPlayStreaming,
  title = "In Diretta",
  catalog = "raiplay",
}: RaiplayLiveHomeRowProps) {
  const { scrollRef, collapseEpoch, scrollProps } = useRowScrollContainer();
  const [fresh, setFresh] = useState<StremioMetaPreview[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        let next: StremioMetaPreview[] = [];
        if (catalog === "all") {
          const [rai, mediaset] = await Promise.all([
            fetchRaiplayOnAir().catch(() => [] as StremioMetaPreview[]),
            fetchMediasetOnAir().catch(() => [] as StremioMetaPreview[]),
          ]);
          next = [...rai, ...mediaset];
        } else if (catalog === "mediaset") {
          next = await fetchMediasetOnAir();
        } else {
          next = await fetchRaiplayOnAir();
        }
        if (!cancelled && next.length > 0) setFresh(next);
      } catch {
        /* catalogo già in riga */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [catalog]);

  const previews = useMemo(() => {
    if (fresh?.length) {
      // Se il refresh torna solo un catalogo, non cancellare l’altro già in `items`.
      if (catalog !== "all") return fresh;
      const freshKeys = new Set(
        fresh.map(
          (p) =>
            `${p.catalogPrefix ?? ""}:${(p.slug ?? p.id ?? "").toLowerCase()}`,
        ),
      );
      const fromItems = items
        .filter(
          (b): b is Extract<BrowseItem, { kind: "streaming" }> =>
            b.kind === "streaming",
        )
        .map((b) => b.preview)
        .filter((p) => {
          const key = `${p.catalogPrefix ?? ""}:${(p.slug ?? p.id ?? "").toLowerCase()}`;
          return !freshKeys.has(key);
        });
      // Preferisci ordine: Rai aggiornati, Mediaset aggiornati, eventuali restanti.
      const rai = fresh.filter((p) => p.catalogPrefix === "raiplay");
      const mediaset = fresh.filter((p) => p.catalogPrefix === "mediaset");
      const otherFresh = fresh.filter(
        (p) => p.catalogPrefix !== "raiplay" && p.catalogPrefix !== "mediaset",
      );
      return [...rai, ...mediaset, ...otherFresh, ...fromItems];
    }
    return items
      .filter((b): b is Extract<BrowseItem, { kind: "streaming" }> => b.kind === "streaming")
      .map((b) => b.preview);
  }, [fresh, items, catalog]);

  const rowInteractionValue = useMemo(
    () => ({ collapseEpoch }),
    [collapseEpoch],
  );

  const scroll = (direction: "left" | "right") => {
    if (!scrollRef.current) return;
    const amount = Math.round(window.innerWidth * 0.72);
    scrollRef.current.scrollBy({
      left: direction === "left" ? -amount : amount,
      behavior: "smooth",
    });
  };

  const scrollToEnd = () => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ left: el.scrollWidth, behavior: "smooth" });
  };

  if (previews.length === 0) return null;

  return (
    <RowInteractionContext.Provider value={rowInteractionValue}>
      <section className="group/row lf-home-row lf-home-row--live relative space-y-1 overflow-visible">
        <div
          className={`${
            animateEntrance ? "stagger-card " : ""
          }page-px flex flex-wrap items-baseline gap-x-4 gap-y-1`}
        >
          <h2 className="lf-home-row__title title-safe flex items-center gap-2">
            <BroadcastIcon className="h-5 w-5 shrink-0 text-white" />
            {title}
          </h2>
          <button
            type="button"
            onClick={scrollToEnd}
            className="lf-live-row__see-all"
          >
            Vedi tutte le dirette →
          </button>
        </div>

        <div className="lf-row-scroll relative">
          <button
            type="button"
            onClick={() => scroll("left")}
            aria-label="Scorri a sinistra"
            className="absolute left-2 top-1/2 z-[60] flex h-11 w-11 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full bg-black/35 text-white opacity-80 backdrop-blur-sm transition-all active:scale-95 sm:left-4 sm:h-12 sm:w-12 sm:bg-white/15 sm:text-white sm:opacity-0 sm:backdrop-blur-none lg:group-hover/row:opacity-100"
          >
            <ChevronLeft className="h-7 w-7 drop-shadow-md sm:h-10 sm:w-10 sm:drop-shadow-none" />
          </button>
          <button
            type="button"
            onClick={() => scroll("right")}
            aria-label="Scorri a destra"
            className="absolute right-2 top-1/2 z-[60] flex h-11 w-11 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full bg-black/35 text-white opacity-80 backdrop-blur-sm transition-all active:scale-95 sm:right-4 sm:h-12 sm:w-12 sm:bg-white/15 sm:text-white sm:opacity-0 sm:backdrop-blur-none lg:group-hover/row:opacity-100"
          >
            <ChevronRight className="h-7 w-7 drop-shadow-md sm:h-10 sm:w-10" />
          </button>

          <div
            ref={scrollRef}
            className="scrollbar-hide page-px lf-row-scroll__track lf-live-row__track"
            style={{ gap: CARD_GAP }}
            {...scrollProps}
          >
            {previews.map((preview) => (
              <div
                key={browseItemId(streamingBrowseItem(preview))}
                className={`${animateEntrance ? "stagger-card " : ""}shrink-0`}
              >
                <LiveCard preview={preview} onPlay={onPlayStreaming} />
              </div>
            ))}
          </div>
        </div>
      </section>
    </RowInteractionContext.Provider>
  );
});
