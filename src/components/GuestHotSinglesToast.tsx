import { AnimatePresence, motion, type TargetAndTransition } from "framer-motion";
import { Flame, X } from "lucide-react";
import type { GuestHotPopupPlacement } from "../lib/guestHotPopups";
import { useGuestHotPopups } from "../hooks/useGuestHotPopups";

const CARD_CLASS =
  "w-[min(22rem,calc(100vw-1rem))] sm:w-[25rem]";

const RISE_DURATION_S = 9;

const NAV_BOTTOM =
  "bottom-[calc(var(--mobile-nav-height,0px)+0.75rem)] sm:bottom-4";
const TOP_INSET =
  "top-[calc(var(--app-nav-height,0px)+0.75rem)] sm:top-4";

interface EntryLayout {
  className: string;
  initial: TargetAndTransition;
  animate: TargetAndTransition;
  exit: TargetAndTransition;
}

function placementKey({ entrySide, anchor }: GuestHotPopupPlacement): string {
  return `${entrySide}:${anchor}`;
}

function resolvePlacementLayout(placement: GuestHotPopupPlacement): EntryLayout {
  const { entrySide, anchor } = placement;
  const isStart = anchor === "start";

  if (entrySide === "bottom") {
    return {
      className: `${NAV_BOTTOM} ${isStart ? "left-3 sm:left-4" : "right-3 sm:right-4"}`,
      initial: { opacity: 0, y: "100%", x: 0 },
      animate: { opacity: 1, y: 0, x: 0 },
      exit: { opacity: 0, y: 24, x: 0, scale: 0.98 },
    };
  }

  if (entrySide === "top") {
    return {
      className: `${TOP_INSET} ${isStart ? "left-3 sm:left-4" : "right-3 sm:right-4"}`,
      initial: { opacity: 0, y: "-100%", x: 0 },
      animate: { opacity: 1, y: 0, x: 0 },
      exit: { opacity: 0, y: -24, x: 0, scale: 0.98 },
    };
  }

  if (entrySide === "left") {
    return {
      className: isStart
        ? `${TOP_INSET} left-3 sm:left-4`
        : `${NAV_BOTTOM} left-3 sm:left-4`,
      initial: { opacity: 0, x: "-100%", y: 0 },
      animate: { opacity: 1, x: 0, y: 0 },
      exit: { opacity: 0, x: -24, y: 0, scale: 0.98 },
    };
  }

  return {
    className: isStart
      ? `${TOP_INSET} right-3 sm:right-4`
      : `${NAV_BOTTOM} right-3 sm:right-4`,
    initial: { opacity: 0, x: "100%", y: 0 },
    animate: { opacity: 1, x: 0, y: 0 },
    exit: { opacity: 0, x: 24, y: 0, scale: 0.98 },
  };
}

export function GuestHotSinglesToast() {
  const { active, dismiss } = useGuestHotPopups();
  const layout = active ? resolvePlacementLayout(active.placement) : null;

  return (
    <div className="pointer-events-none fixed inset-0 z-[44] overflow-hidden">
      <AnimatePresence>
        {active && layout && (
          <motion.div
            key={`${active.profile.id}:${placementKey(active.placement)}`}
            initial={layout.initial}
            animate={layout.animate}
            exit={layout.exit}
            transition={{
              opacity: { duration: 1.2, ease: "easeOut" },
              x: {
                duration: RISE_DURATION_S,
                ease: [0.25, 0.1, 0.25, 1],
              },
              y: {
                duration: RISE_DURATION_S,
                ease: [0.25, 0.1, 0.25, 1],
              },
            }}
            className={`pointer-events-auto absolute ${layout.className} ${CARD_CLASS}`}
          >
            <div className="flex aspect-square w-full flex-col overflow-hidden rounded-[1.25rem] border border-pink-400/30 bg-black shadow-[0_24px_70px_rgba(255,80,140,0.28)] sm:rounded-2xl">
              <div className="relative min-h-0 flex-1">
                <img
                  src={active.profile.photoUrl}
                  alt=""
                  className="h-full w-full object-cover object-top"
                />
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-black/25" />
                <button
                  type="button"
                  onClick={dismiss}
                  className="absolute right-2.5 top-2.5 flex h-10 w-10 items-center justify-center rounded-xl bg-black/50 text-white backdrop-blur-sm transition hover:bg-black/70"
                  aria-label="Chiudi"
                >
                  <X className="h-5 w-5" />
                </button>
                <span className="absolute bottom-3 left-3 inline-flex items-center gap-1.5 rounded-full bg-pink-500/95 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-white shadow-lg">
                  <Flame className="h-3.5 w-3.5" />
                  Vicino a te
                </span>
              </div>

              <div className="flex shrink-0 flex-col gap-3 border-t border-pink-400/20 bg-[#120810] px-4 py-3.5 sm:px-5 sm:py-4">
                <p className="font-display text-[16px] font-semibold leading-snug tracking-[-0.025em] text-white sm:text-[18px]">
                  {active.profile.message}
                </p>
                <button
                  type="button"
                  onClick={dismiss}
                  className="w-full rounded-xl bg-pink-500 py-2.5 text-[14px] font-semibold text-white transition hover:bg-pink-400 sm:py-3"
                >
                  Chiudi
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
