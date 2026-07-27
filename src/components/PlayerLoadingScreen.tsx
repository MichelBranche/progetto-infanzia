import { useEffect } from "react";
import { X } from "lucide-react";

interface PlayerLoadingScreenProps {
  title?: string;
  subtitle?: string;
  backdropUrl?: string;
  logoUrl?: string;
  /** Overlay a tutto schermo con annulla (avvio) o riempimento del player. */
  variant?: "launch" | "inline";
  onCancel?: () => void;
}

/**
 * Schermata unica fra il click su Play e il primo frame: la stessa immagine
 * copre la risoluzione dello stream e il buffering iniziale, così l'attesa
 * sembra un solo passaggio invece di tre spinner in fila.
 */
export function PlayerLoadingScreen({
  title,
  subtitle,
  backdropUrl,
  logoUrl,
  variant = "launch",
  onCancel,
}: PlayerLoadingScreenProps) {
  useEffect(() => {
    if (!onCancel) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  return (
    <div
      className={`lf-player-launch lf-player-launch--${variant}`}
      role="status"
      aria-live="polite"
    >
      {backdropUrl && (
        <img
          className="lf-player-launch__backdrop"
          src={backdropUrl}
          alt=""
          aria-hidden
          decoding="async"
        />
      )}

      {onCancel && (
        <button
          type="button"
          onClick={onCancel}
          className="lf-player-launch__close"
          aria-label="Annulla avvio"
        >
          <X className="h-5 w-5" strokeWidth={2} />
        </button>
      )}

      <div className="lf-player-launch__content">
        {logoUrl ? (
          <img
            className="lf-player-launch__logo"
            src={logoUrl}
            alt={title ?? ""}
            decoding="async"
          />
        ) : (
          title && <h2 className="lf-player-launch__title">{title}</h2>
        )}
        {subtitle && <p className="lf-player-launch__subtitle">{subtitle}</p>}
        <div className="lf-player-launch__bar" aria-hidden>
          <span />
        </div>
      </div>
    </div>
  );
}
