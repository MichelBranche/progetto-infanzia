import { Download, Loader2, RefreshCw, Sparkles } from "lucide-react";
import { useAppUpdaterContext } from "../context/AppUpdaterContext";
import {
  SettingsAlert,
  SettingsButton,
  SettingsInset,
  SettingsSection,
} from "./settings/SettingsUi";

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

      <SettingsButton
        variant="secondary"
        disabled={checking || !supported}
        onClick={() => void check(true)}
        className="mt-4"
      >
        {checking ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <RefreshCw className="h-3.5 w-3.5" />
        )}
        Controlla aggiornamenti
      </SettingsButton>

      {showUpToDate && (
        <SettingsAlert variant="success" className="mt-3">
          Sei già alla versione più recente.
        </SettingsAlert>
      )}

      {error && phase === "error" && (
        <SettingsAlert className="mt-3">{error}</SettingsAlert>
      )}

      {phase === "available" && pendingUpdate && supported && (
        <SettingsInset className="mt-4 border-accent/20 bg-accent/[0.06]">
          <p className="text-[13px] text-text-primary">
            Disponibile la versione{" "}
            <strong className="font-display tracking-[-0.02em]">
              {pendingUpdate.version}
            </strong>
          </p>
          {pendingUpdate.body && (
            <p className="mt-2 whitespace-pre-wrap text-[12px] leading-relaxed text-text-muted">
              {pendingUpdate.body}
            </p>
          )}
          <SettingsButton
            variant="primary"
            onClick={() => void install()}
            className="mt-3"
          >
            <Download className="h-3.5 w-3.5" />
            Installa e riavvia
          </SettingsButton>
        </SettingsInset>
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
