import { motion } from "framer-motion";
import { Clock, LogIn, UserPlus } from "lucide-react";
import { useAppAccess } from "../context/AppAccessContext";
import { GUEST_DAILY_LIMIT_SECONDS } from "../lib/guestUsage";

function formatCooldown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

interface GuestLimitBlockedScreenProps {
  onRegister: () => void;
}

export function GuestLimitBlockedScreen({ onRegister }: GuestLimitBlockedScreenProps) {
  const { guestCooldownRemainingMs } = useAppAccess();
  const limitLabel = `${Math.round(GUEST_DAILY_LIMIT_SECONDS / 60)} minuti`;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-void/95 px-6 backdrop-blur-md">
      <motion.div
        initial={{ opacity: 0, y: 16, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        className="w-full max-w-md rounded-3xl border border-warm/20 bg-[#0a0a0e]/90 p-8 text-center shadow-2xl"
      >
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-warm/12 text-warm">
          <Clock className="h-7 w-7" />
        </div>
        <h1 className="font-display mt-5 text-2xl font-semibold tracking-[-0.03em] text-text-primary">
          Tempo ospite esaurito
        </h1>
        <p className="mt-3 text-[14px] leading-relaxed text-text-secondary">
          Hai usato i {limitLabel} di prova gratuita. Per continuare a guardare
          devi creare un account.
        </p>
        {guestCooldownRemainingMs > 0 && (
          <p className="mt-4 rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 text-[13px] text-text-muted">
            Senza account, riprova tra{" "}
            <span className="font-semibold tabular-nums text-text-primary">
              {formatCooldown(guestCooldownRemainingMs)}
            </span>
          </p>
        )}
        <button
          type="button"
          onClick={onRegister}
          className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-white px-5 py-3.5 text-[15px] font-semibold text-black transition-opacity hover:opacity-90"
        >
          <UserPlus className="h-4 w-4" />
          Crea account gratuito
        </button>
        <p className="mt-3 text-[11px] text-text-muted">
          Accesso illimitato, profili, continua a guardare e amici cloud.
        </p>
        <button
          type="button"
          onClick={onRegister}
          className="mt-4 inline-flex items-center gap-1.5 text-[12px] font-medium text-text-secondary transition-colors hover:text-text-primary"
        >
          <LogIn className="h-3.5 w-3.5" />
          Ho già un account
        </button>
      </motion.div>
    </div>
  );
}
