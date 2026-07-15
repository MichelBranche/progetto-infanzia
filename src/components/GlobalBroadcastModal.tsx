import { AlertTriangle, Info, Megaphone, Wrench, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import type { AppBroadcast, AppBroadcastType } from "../types/appBroadcast";
import { formatBroadcastWindow } from "../lib/appBroadcastApi";
import { useAppBroadcast } from "../hooks/useAppBroadcast";

function typeMeta(type: AppBroadcastType) {
  switch (type) {
    case "essential":
      return {
        icon: AlertTriangle,
        label: "Comunicazione essenziale",
        border: "border-warm/30",
        bg: "bg-[#120a0a]",
        glow: "from-warm/25 via-warm/5 to-transparent",
        iconWrap: "border-warm/30 bg-warm/10 text-warm",
        titleColor: "text-warm",
        blocking: true,
      };
    case "maintenance":
      return {
        icon: Wrench,
        label: "Manutenzione in corso",
        border: "border-warm/25",
        bg: "bg-[#120d08]",
        glow: "from-warm/20 via-warm/5 to-transparent",
        iconWrap: "border-warm/25 bg-warm/10 text-warm",
        titleColor: "text-warm",
        blocking: false,
      };
    case "warning":
      return {
        icon: AlertTriangle,
        label: "Avviso importante",
        border: "border-amber-400/25",
        bg: "bg-[#141008]",
        glow: "from-amber-400/15 via-amber-400/5 to-transparent",
        iconWrap: "border-amber-400/25 bg-amber-400/10 text-amber-300",
        titleColor: "text-amber-300",
        blocking: false,
      };
    default:
      return {
        icon: Info,
        label: "Comunicazione",
        border: "border-accent/25",
        bg: "bg-[#0a0c12]",
        glow: "from-accent/15 via-accent/5 to-transparent",
        iconWrap: "border-accent/25 bg-accent/10 text-accent",
        titleColor: "text-accent",
        blocking: false,
      };
  }
}

function BroadcastCard({
  broadcast,
  onDismiss,
}: {
  broadcast: AppBroadcast;
  onDismiss: () => void;
}) {
  const meta = typeMeta(broadcast.messageType);
  const Icon = meta.icon;
  const canDismiss = broadcast.dismissible && !meta.blocking;

  return (
    <motion.div
      role="alertdialog"
      aria-labelledby="global-broadcast-title"
      aria-describedby="global-broadcast-body"
      initial={{ opacity: 0, y: 24, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 16, scale: 0.98 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className={`relative w-full max-w-lg overflow-hidden rounded-2xl border ${meta.border} ${meta.bg} shadow-[0_32px_80px_rgba(0,0,0,0.7)]`}
    >
      <div
        className={`pointer-events-none absolute inset-x-0 top-0 h-36 bg-gradient-to-b ${meta.glow}`}
      />

      <div className="relative px-6 pb-5 pt-6 sm:px-7 sm:pt-7">
        <div className="flex items-start gap-4">
          <div
            className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border ${meta.iconWrap}`}
          >
            <Icon className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p
              className={`text-[10px] font-semibold uppercase tracking-[0.32em] ${meta.titleColor}`}
            >
              {meta.label}
            </p>
            <h2
              id="global-broadcast-title"
              className="font-display mt-1.5 text-[clamp(1.35rem,3vw,1.75rem)] font-semibold leading-tight tracking-[-0.03em] text-text-primary"
            >
              {broadcast.title}
            </h2>
            <p
              id="global-broadcast-body"
              className="mt-3 whitespace-pre-wrap text-[13px] leading-relaxed text-text-secondary"
            >
              {broadcast.body}
            </p>
            <p className="mt-4 text-[11px] text-text-muted">
              {formatBroadcastWindow(broadcast.startsAt, broadcast.endsAt)}
            </p>
          </div>
          {canDismiss && (
            <button
              type="button"
              onClick={onDismiss}
              aria-label="Chiudi messaggio"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 text-text-muted transition-colors hover:border-white/20 hover:text-text-primary"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {canDismiss && (
        <div className="relative border-t border-white/[0.06] bg-black/30 px-6 py-4 sm:px-7">
          <button
            type="button"
            onClick={onDismiss}
            className="inline-flex w-full items-center justify-center rounded-full border border-white/10 px-5 py-3 text-[13px] font-semibold text-text-primary transition-colors hover:border-white/20 hover:bg-white/[0.04]"
          >
            Ho capito
          </button>
        </div>
      )}
    </motion.div>
  );
}

export function GlobalBroadcastModal() {
  const { broadcast, visible, dismiss } = useAppBroadcast();

  return (
    <AnimatePresence>
      {visible && broadcast && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[125] flex items-end justify-center bg-black/70 p-4 backdrop-blur-md sm:items-center sm:p-6"
          onClick={broadcast.dismissible ? dismiss : undefined}
        >
          <div
            className="w-full max-w-lg"
            onClick={(event) => event.stopPropagation()}
          >
            <BroadcastCard broadcast={broadcast} onDismiss={dismiss} />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function GlobalBroadcastDevBadge({ active }: { active: boolean }) {
  if (!active) return null;
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-warm/30 bg-warm/10 px-2 py-0.5 text-[10px] font-medium text-warm">
      <Megaphone className="h-3 w-3" />
      Live
    </span>
  );
}
