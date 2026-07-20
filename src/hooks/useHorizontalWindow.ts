import {
  useCallback,
  useEffect,
  useState,
  type RefObject,
} from "react";

export interface HorizontalWindow {
  /** Indice incluso della prima card montata. */
  startIndex: number;
  /** Indice escluso dell'ultima card montata. */
  endIndex: number;
  /** Spazio vuoto a sinistra (px) per mantenere la scrollbar corretta. */
  leadingPx: number;
  /** Spazio vuoto a destra (px). */
  trailingPx: number;
  /** True se il windowing e' attivo (lista abbastanza lunga). */
  active: boolean;
}

interface Options {
  itemCount: number;
  /** Larghezza card in px (senza gap). */
  itemWidth: number;
  /** Gap flex tra card in px. */
  gap: number;
  /** Card extra a sinistra/destra oltre il viewport. */
  overscan?: number;
  /** Sotto questa soglia monta tutto (overhead inutile). */
  minCount?: number;
}

const DEFAULT_OVERSCAN = 4;
const DEFAULT_MIN_COUNT = 18;

/**
 * Windowing orizzontale per righe tipo Netflix: monta solo le card
 * visibili (+ overscan). I spacer leading/trailing tengono la scrollWidth
 * corretta cosi' freccia/drag/scroll-snap restano naturali.
 *
 * Con `display:flex; gap:G` la posizione della card i e' `i * (W+G)`.
 * Gli spacer compensano il gap extra creato dal flex tra spacer e card.
 */
export function useHorizontalWindow(
  scrollRef: RefObject<HTMLElement | null>,
  {
    itemCount,
    itemWidth,
    gap,
    overscan = DEFAULT_OVERSCAN,
    minCount = DEFAULT_MIN_COUNT,
  }: Options,
): HorizontalWindow {
  const stride = itemWidth + gap;
  const active = itemCount >= minCount && stride > 0;

  const compute = useCallback((): HorizontalWindow => {
    if (!active) {
      return {
        startIndex: 0,
        endIndex: itemCount,
        leadingPx: 0,
        trailingPx: 0,
        active: false,
      };
    }

    const el = scrollRef.current;
    const scrollLeft = el?.scrollLeft ?? 0;
    const viewport =
      el?.clientWidth ??
      (typeof window !== "undefined" ? window.innerWidth : 1280);

    const first = Math.floor(scrollLeft / stride);
    const visible = Math.ceil(viewport / stride) + 1;
    const startIndex = Math.max(0, first - overscan);
    const endIndex = Math.min(itemCount, first + visible + overscan);

    // Vedi commento sopra: spacer + gap flex = startIndex * stride.
    const leadingPx =
      startIndex === 0 ? 0 : Math.max(0, startIndex * stride - gap);
    const trailingPx =
      endIndex >= itemCount
        ? 0
        : Math.max(0, (itemCount - endIndex) * stride - gap);

    return { startIndex, endIndex, leadingPx, trailingPx, active: true };
  }, [active, gap, itemCount, overscan, scrollRef, stride]);

  const [windowState, setWindowState] = useState<HorizontalWindow>(compute);

  useEffect(() => {
    setWindowState(compute());
  }, [compute]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !active) return;

    let raf = 0;
    const schedule = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        setWindowState(compute());
      });
    };

    el.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);

    const ro =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(schedule)
        : null;
    ro?.observe(el);

    return () => {
      if (raf) cancelAnimationFrame(raf);
      el.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      ro?.disconnect();
    };
  }, [active, compute, scrollRef]);

  return windowState;
}

export interface RowMetrics {
  itemWidth: number;
  gap: number;
}

/** Metriche allineate a lordflix.css per layout row / continue. */
export function rowItemMetrics(layout: "default" | "continue"): RowMetrics {
  if (typeof window === "undefined") {
    return layout === "continue"
      ? { itemWidth: 288, gap: 16 }
      : { itemWidth: 200, gap: 14 };
  }
  if (layout === "continue") {
    // .lf-continue-card 240 → 288 @ sm (640px) + gap 1rem
    const wide = window.matchMedia("(min-width: 640px)").matches;
    return { itemWidth: wide ? 288 : 240, gap: 16 };
  }
  // .lf-browse-card 140 → 200 @ lg (1024px) + gap 0.875rem
  const wide = window.matchMedia("(min-width: 1024px)").matches;
  return { itemWidth: wide ? 200 : 140, gap: 14 };
}
