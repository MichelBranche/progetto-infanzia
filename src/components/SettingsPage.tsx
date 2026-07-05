import { useCallback, useEffect, useState } from "react";
import {
  FolderOpen,
  Library,
  Loader2,
  RefreshCw,
  Tv,
  Volume2,
} from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";
import { scanLibrary } from "../lib/api";
import { setProfilePin, removeProfilePin } from "../lib/profilesApi";
import { fetchSettings, setMediaRoot, updateSettings } from "../lib/settingsApi";
import { STREAMING_SERVICES } from "../data/streaming";
import { ParentalLimitsPanel } from "./ParentalLimitsPanel";
import { AppUpdaterSection } from "./AppUpdaterSection";
import { CloudAuthPanel } from "./CloudAuthPanel";
import { AddonManagerPanel } from "./AddonManagerPanel";
import { DebridPanel } from "./DebridPanel";
import { STREMIO_ADDONS_ENABLED } from "../lib/features";
import type { AppSettings } from "../lib/settingsApi";
import {
  SettingsButton,
  SettingsGroupLabel,
  SettingsInput,
  SettingsSection,
  SettingsToggle,
} from "./settings/SettingsUi";

interface SettingsPageProps {
  profileId: string;
  onRescanComplete?: () => void;
  onOpenManage?: () => void;
}

export function SettingsPage({ profileId, onRescanComplete, onOpenManage }: SettingsPageProps) {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pin, setPin] = useState("");
  const [pinConfirm, setPinConfirm] = useState("");
  const [currentPin, setCurrentPin] = useState("");
  const [pinMessage, setPinMessage] = useState<string | null>(null);
  const [scanMessage, setScanMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchSettings();
      setSettings(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const saveSettings = async (patch: Parameters<typeof updateSettings>[1]) => {
    setSaving(true);
    setError(null);
    try {
      const next = await updateSettings(profileId, patch);
      setSettings(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const toggleService = (id: string) => {
    if (!settings) return;
    const next = settings.subscribedServices.includes(id)
      ? settings.subscribedServices.filter((s) => s !== id)
      : [...settings.subscribedServices, id];
    void saveSettings({ subscribedServices: next });
  };

  const handleScan = async () => {
    setScanning(true);
    setScanMessage(null);
    try {
      const result = await scanLibrary();
      setScanMessage(
        `Scansione completata: ${result.added} aggiunti, ${result.updated} aggiornati, ${result.removed} rimossi (${result.total} totali)`,
      );
      await load();
      onRescanComplete?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setScanning(false);
    }
  };

  const handleChooseMediaFolder = async () => {
    setScanMessage(null);
    setError(null);
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: "Scegli la cartella media",
      });
      if (!selected || typeof selected !== "string") return;
      setScanning(true);
      const result = await setMediaRoot(selected);
      setScanMessage(
        `Cartella collegata: ${result.added} aggiunti, ${result.updated} aggiornati (${result.total} totali)`,
      );
      await load();
      onRescanComplete?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setScanning(false);
    }
  };

  const handleSetPin = async () => {
    setPinMessage(null);
    if (pin.length < 4 || pin !== pinConfirm) {
      setPinMessage("I PIN devono coincidere (4-8 cifre)");
      return;
    }
    try {
      await setProfilePin(profileId, pin, currentPin.trim() || undefined);
      setPin("");
      setPinConfirm("");
      setCurrentPin("");
      setPinMessage("PIN impostato correttamente");
    } catch (err) {
      setPinMessage(err instanceof Error ? err.message : String(err));
    }
  };

  const handleRemovePin = async () => {
    if (!currentPin.trim()) {
      setPinMessage("Inserisci il PIN attuale per rimuoverlo");
      return;
    }
    try {
      await removeProfilePin(profileId, currentPin.trim());
      setCurrentPin("");
      setPinMessage("PIN rimosso");
    } catch (err) {
      setPinMessage(err instanceof Error ? err.message : String(err));
    }
  };

  if (loading || !settings) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center pt-[var(--app-nav-height)]">
        <Loader2 className="h-7 w-7 animate-spin text-text-muted" />
      </div>
    );
  }

  return (
    <div className="page-px pb-24 pt-[calc(var(--app-nav-height)+2rem)] sm:pt-[calc(var(--app-nav-height)+2.5rem)]">
      <div className="mx-auto w-full max-w-2xl">
        <header className="mb-10 text-center sm:mb-12">
          <p className="font-display text-[11px] font-medium tracking-[0.22em] text-text-muted">
            BRANCHEFY
          </p>
          <h1 className="font-display mt-3 text-[clamp(1.75rem,4vw,2.5rem)] font-semibold tracking-[-0.04em] text-text-primary">
            Impostazioni
          </h1>
          <p className="mx-auto mt-2 max-w-md text-[14px] leading-relaxed text-text-secondary">
            Libreria, streaming, account e controllo genitori
          </p>
        </header>

        {error && (
          <p className="mb-6 rounded-xl border border-warm/20 bg-warm/10 px-4 py-3 text-center text-[13px] text-warm">
            {error}
          </p>
        )}

        <div className="space-y-4">
          <SettingsGroupLabel>Account</SettingsGroupLabel>
          <CloudAuthPanel />

          <SettingsSection
            title="PIN profilo genitore"
            description="Protegge l'accesso al profilo genitore e alle impostazioni"
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <SettingsInput
                value={currentPin}
                onChange={(e) => setCurrentPin(e.target.value.replace(/\D/g, ""))}
                placeholder="PIN attuale"
                maxLength={8}
                inputMode="numeric"
              />
              <SettingsInput
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
                placeholder="Nuovo PIN"
                maxLength={8}
                inputMode="numeric"
              />
              <SettingsInput
                value={pinConfirm}
                onChange={(e) => setPinConfirm(e.target.value.replace(/\D/g, ""))}
                placeholder="Conferma PIN"
                maxLength={8}
                inputMode="numeric"
                className="sm:col-span-2"
              />
            </div>
            <div className="mt-4 flex flex-wrap justify-center gap-2 sm:justify-start">
              <SettingsButton variant="primary" onClick={() => void handleSetPin()}>
                Salva PIN
              </SettingsButton>
              <SettingsButton variant="secondary" onClick={() => void handleRemovePin()}>
                Rimuovi PIN
              </SettingsButton>
            </div>
            {pinMessage && (
              <p className="mt-3 text-center text-[12px] text-text-secondary sm:text-left">
                {pinMessage}
              </p>
            )}
          </SettingsSection>

          <SettingsGroupLabel>Libreria</SettingsGroupLabel>

          <SettingsSection
            icon={FolderOpen}
            title="Cartella media"
            description="I file locali vengono letti da questa cartella. Puoi collegarne una personalizzata se i tuoi video sono altrove."
          >
            <p className="break-all rounded-xl bg-white/[0.03] px-4 py-3 font-mono text-[12px] text-text-secondary">
              {settings.mediaRoot}
            </p>
            {settings.lastScan && (
              <p className="mt-2 text-center text-[11px] text-text-muted sm:text-left">
                Ultima scansione: {new Date(settings.lastScan).toLocaleString("it-IT")}
              </p>
            )}
            <div className="mt-4 flex flex-wrap justify-center gap-2 sm:justify-start">
              <SettingsButton
                variant="accent"
                disabled={scanning || saving}
                onClick={() => void handleChooseMediaFolder()}
              >
                <FolderOpen className="h-3.5 w-3.5" />
                Scegli cartella
              </SettingsButton>
              <SettingsButton
                variant="secondary"
                disabled={scanning || saving}
                onClick={() => void handleScan()}
              >
                <RefreshCw className={`h-3.5 w-3.5 ${scanning ? "animate-spin" : ""}`} />
                Scansiona
              </SettingsButton>
              {onOpenManage && (
                <SettingsButton variant="secondary" onClick={onOpenManage}>
                  <Library className="h-3.5 w-3.5" />
                  Gestisci file
                </SettingsButton>
              )}
            </div>
            {scanMessage && (
              <p className="mt-3 text-center text-[12px] text-mint sm:text-left">{scanMessage}</p>
            )}
          </SettingsSection>

          <SettingsSection
            title="Metadati TMDB"
            description="Poster e descrizioni automatici. Chiave gratuita su themoviedb.org"
          >
            <SettingsInput
              type="password"
              value={settings.tmdbApiKey ?? ""}
              onChange={(e) => setSettings({ ...settings, tmdbApiKey: e.target.value })}
              onBlur={() => void saveSettings({ tmdbApiKey: settings.tmdbApiKey ?? "" })}
              placeholder="Chiave API TMDB"
            />
            <div className="mt-3">
              <SettingsToggle
                label="Arricchisci alla scansione"
                description="Scarica poster e sinossi per i nuovi titoli"
                enabled={settings.tmdbEnrichOnScan}
                disabled={saving}
                onChange={() =>
                  void saveSettings({ tmdbEnrichOnScan: !settings.tmdbEnrichOnScan })
                }
              />
            </div>
          </SettingsSection>

          <SettingsSection
            title="Cartelle cloud"
            description="Monta Mega o altri cloud con rclone dentro media/serie/, poi scansiona la libreria."
          />

          <SettingsGroupLabel>Streaming e TV</SettingsGroupLabel>

          <SettingsSection
            icon={Tv}
            title="Trasmissione TV"
            description={`Porta LAN ${settings.streamPort}. Consenti Branchefy sul firewall per reti private.`}
          >
            <SettingsToggle
              label="Transcodifica per TV"
              description="Converte MKV in MP4 per Chromecast e TV"
              enabled={settings.castTranscodeEnabled}
              disabled={saving}
              onChange={() =>
                void saveSettings({
                  castTranscodeEnabled: !settings.castTranscodeEnabled,
                })
              }
            />
          </SettingsSection>

          <SettingsSection
            title="I tuoi abbonamenti"
            description="Per ogni titolo vedi dove è disponibile in streaming"
          >
            <div className="flex flex-wrap justify-center gap-2 sm:justify-start">
              {STREAMING_SERVICES.map((service) => {
                const active = settings.subscribedServices.includes(service.id);
                return (
                  <button
                    key={service.id}
                    type="button"
                    disabled={saving}
                    onClick={() => toggleService(service.id)}
                    className={`rounded-full border px-3.5 py-1.5 text-[12px] font-medium transition-colors ${
                      active
                        ? "border-accent/40 bg-accent/12 text-text-primary"
                        : "border-white/[0.08] bg-white/[0.02] text-text-muted hover:border-white/15 hover:text-text-secondary"
                    }`}
                  >
                    {service.label}
                  </button>
                );
              })}
            </div>
          </SettingsSection>

          {STREMIO_ADDONS_ENABLED && (
            <SettingsSection
              title="Addon Stremio"
              description="Cataloghi e streaming remoto"
            >
              <AddonManagerPanel parentProfileId={profileId} />
            </SettingsSection>
          )}

          {STREMIO_ADDONS_ENABLED && (
            <SettingsSection
              title="Debrid"
              description="Real-Debrid / AllDebrid per stream torrent in-app"
            >
              <DebridPanel parentProfileId={profileId} />
            </SettingsSection>
          )}

          <SettingsGroupLabel>Famiglia</SettingsGroupLabel>

          <SettingsSection
            title="Limiti profili bambino"
            description="Tempo giornaliero e fascia oraria consentita"
          >
            <ParentalLimitsPanel parentProfileId={profileId} />
          </SettingsSection>

          <SettingsGroupLabel>App</SettingsGroupLabel>

          <SettingsSection
            icon={Volume2}
            title="Suono intro"
            description="Effetto sonoro all'avvio di Branchefy"
            headerRight={
              <button
                type="button"
                onClick={() =>
                  void saveSettings({ introSoundEnabled: !settings.introSoundEnabled })
                }
                className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${
                  settings.introSoundEnabled ? "bg-accent" : "bg-white/15"
                }`}
              >
                <span
                  className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow-sm transition-transform ${
                    settings.introSoundEnabled ? "left-[22px]" : "left-0.5"
                  }`}
                />
              </button>
            }
          />

          <AppUpdaterSection />
        </div>
      </div>
    </div>
  );
}
