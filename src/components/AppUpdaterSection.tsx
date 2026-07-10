import { Download, Loader2, RefreshCw, Sparkles } from "lucide-react";
import { useAppUpdaterContext } from "../context/AppUpdaterContext";
import { SettingsSection } from "./settings/SettingsUi";

export function AppUpdaterSection() {
  const {
    phase,
    currentVersion,
    pendingUpdate,
    error,
    supported,
    check,
    install,
  } = useAppUpdaterContext();

  const checking = phase === "checking";
  const showUpToDate = phase === "up-to-date";

  return (
    <SettingsSection
      icon={Sparkles}
      title="Aggiornamenti"
      description={
        currentVersion
          ? `Versione installata: v${currentVersion}`
          : "Controllo versione in corso…"
      }
    >
      {!supported && (
        <p className="text-[12px] leading-relaxed text-text-muted">
          Gli aggiornamenti automatici sono disponibili solo nell&apos;app
          installata (non in modalità sviluppo).
        </p>
      )}
      <button
        type="button"
        disabled={checking || !supported}
        onClick={() => void check(true)}
        className="mt-4 inline-flex items-center gap-2 rounded-full border border-white/10 px-5 py-2.5 text-[12px] font-semibold text-text-primary transition-colors hover:border-white/20 hover:bg-white/[0.04] disabled:opacity-50"
      >
        {checking ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <RefreshCw className="h-3.5 w-3.5" />
        )}
        Controlla aggiornamenti
      </button>
      {showUpToDate && (
        <p className="mt-3 text-[12px] text-mint">
          Sei già alla versione più recente.
        </p>
      )}
      {error && phase === "error" && (
        <p className="mt-3 rounded-xl border border-warm/25 bg-warm/10 px-3.5 py-3 text-[12px] text-warm">
          {error}
        </p>
      )}
      {phase === "available" && pendingUpdate && supported && (
        <div className="mt-4 rounded-xl border border-accent/20 bg-accent/[0.06] p-4">
          <p className="text-[13px] text-text-primary">
            Disponibile la versione <strong>{pendingUpdate.version}</strong>
          </p>
          {pendingUpdate.body && (
            <p className="mt-2 whitespace-pre-wrap text-[12px] leading-relaxed text-text-muted">
              {pendingUpdate.body}
            </p>
          )}
          <button
            type="button"
            onClick={() => void install()}
            className="mt-3 inline-flex items-center gap-2 rounded-full bg-text-primary px-5 py-2.5 text-[12px] font-semibold text-void transition-transform hover:scale-[1.02] active:scale-[0.98]"
          >
            <Download className="h-3.5 w-3.5" />
            Installa e riavvia
          </button>
        </div>
      )}
      {(phase === "downloading" || phase === "installing") && (
        <p className="mt-3 flex items-center gap-2 text-[12px] text-text-muted">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          {phase === "installing" ? "Installazione…" : "Download in corso…"}
        </p>
      )}
    </SettingsSection>
  );
}
