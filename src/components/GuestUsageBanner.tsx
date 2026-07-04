import { Clock } from "lucide-react";
import { useAppAccess } from "../context/AppAccessContext";
import { formatDuration } from "../types/media";

interface GuestUsageBannerProps {
  onUpgrade?: () => void;
}

export function GuestUsageBanner({ onUpgrade }: GuestUsageBannerProps) {
  const { isGuest, guestSecondsRemaining, guestLimitReached } = useAppAccess();

  if (!isGuest) return null;

  const remainingLabel = formatDuration(guestSecondsRemaining) ?? "0m";

  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-3 border-b px-4 py-2.5 sm:px-6 ${
        guestLimitReached
          ? "border-warm/20 bg-warm/10"
          : "border-white/[0.06] bg-white/[0.02]"
      }`}
    >
      <div className="flex min-w-0 items-center gap-2 text-[12px]">
        <Clock className="h-3.5 w-3.5 shrink-0 text-text-muted" />
        {guestLimitReached ? (
          <span className="text-warm">
            Limite giornaliero ospite raggiunto (2 ore). Registrati per continuare.
          </span>
        ) : (
          <span className="text-text-secondary">
            Modalità ospite · <span className="text-text-primary">{remainingLabel}</span>{" "}
            rimanenti oggi
          </span>
        )}
      </div>
      {onUpgrade && (
        <button
          type="button"
          onClick={onUpgrade}
          className="shrink-0 rounded-full border border-white/10 px-3 py-1 text-[11px] font-medium text-text-primary transition-colors hover:bg-white/[0.05]"
        >
          Registrati
        </button>
      )}
    </div>
  );
}
