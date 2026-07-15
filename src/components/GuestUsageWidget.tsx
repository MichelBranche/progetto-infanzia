import { useMemo } from "react";
import { motion } from "framer-motion";
import { Clock, UserPlus } from "lucide-react";
import { useAppAccess } from "../context/AppAccessContext";
import { GUEST_DAILY_LIMIT_SECONDS } from "../lib/guestUsage";

function formatClock(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${m}:${String(s).padStart(2, "0")}`;
}

interface GuestUsageWidgetProps {
  onRegister?: () => void;
}

export function GuestUsageWidget({ onRegister }: GuestUsageWidgetProps) {
  const {
    isGuest,
    guestSecondsUsed,
    guestSecondsRemaining,
    guestAccessBlocked,
    guestCooldownRemainingMs,
    guestWatching,
  } = useAppAccess();

  const progress = useMemo(() => {
    if (guestAccessBlocked && guestCooldownRemainingMs > 0) return 1;
    return Math.min(1, guestSecondsUsed / GUEST_DAILY_LIMIT_SECONDS);
  }, [guestAccessBlocked, guestCooldownRemainingMs, guestSecondsUsed]);

  if (!isGuest || guestAccessBlocked) return null;

  const label = `${formatClock(guestSecondsRemaining)} rimasti`;
  const subtitle = guestWatching
    ? "In riproduzione · timer attivo"
    : "Il timer scende solo mentre guardi";

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="pointer-events-auto fixed bottom-[calc(var(--mobile-nav-height,0px)+1rem)] left-4 z-[45] w-[min(18rem,calc(100vw-2rem))] sm:bottom-6"
    >
      <div className="overflow-hidden rounded-2xl border border-white/12 bg-black/70 shadow-[0_12px_40px_rgba(0,0,0,0.45)] backdrop-blur-xl">
        <div className="flex items-center gap-3 px-3.5 py-3">
          <div
            className={`relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
              guestWatching ? "bg-accent/15 text-accent" : "bg-white/[0.06] text-text-secondary"
            }`}
          >
            <Clock className="h-4 w-4" />
            {guestWatching && (
              <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 animate-pulse rounded-full bg-accent ring-2 ring-black/80" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-text-muted">
              Modalità ospite
            </p>
            <p className="font-display text-[15px] font-semibold tabular-nums tracking-[-0.02em] text-text-primary">
              {label}
            </p>
            <p className="mt-0.5 text-[11px] text-text-muted">{subtitle}</p>
          </div>
          {onRegister && (
            <button
              type="button"
              onClick={onRegister}
              className="inline-flex shrink-0 items-center gap-1 rounded-full border border-white/12 bg-white/[0.06] px-2.5 py-1.5 text-[10px] font-semibold text-text-primary transition-colors hover:bg-white/10"
            >
              <UserPlus className="h-3 w-3" />
              Account
            </button>
          )}
        </div>
        <div className="h-1 bg-white/[0.06]">
          <motion.div
            className={`h-full ${guestWatching ? "bg-accent" : "bg-white/25"}`}
            initial={false}
            animate={{ width: `${progress * 100}%` }}
            transition={{ duration: guestWatching ? 0.15 : 0.35, ease: "linear" }}
          />
        </div>
      </div>
    </motion.div>
  );
}
