import { useCallback, useEffect, useState } from "react";
import { FolderOpen, Library, Loader2, RefreshCw, Settings, Tv, Volume2 } from "lucide-react";
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
      <div className="flex min-h-[50vh] items-center justify-center pt-24">
        <Loader2 className="h-6 w-6 animate-spin text-text-muted" />
      </div>
    );
  }

  return (
    <div className="page-px pb-16 pt-24 sm:pt-28">
      <div className="mb-8 flex items-center gap-3">
        <Settings className="h-5 w-5 text-accent" />
        <div>
          <h2 className="font-display text-3xl font-semibold tracking-[-0.03em] text-text-primary">
            Impostazioni
          </h2>
          <p className="mt-1 text-[14px] text-text-secondary">
            Libreria, abbonamenti e controllo genitori
          </p>
        </div>
      </div>

      {error && (
        <p className="mb-6 rounded-xl border border-warm/20 bg-warm/10 px-4 py-3 text-[13px] text-warm">
          {error}
        </p>
      )}

      <div className="grid max-w-3xl gap-6">
        <CloudAuthPanel />

        <section className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5">
          <div className="flex items-center gap-2 text-text-primary">
            <FolderOpen className="h-4 w-4 text-accent" />
            <h3 className="text-[15px] font-medium">Libreria locale</h3>
          </div>
          <p className="mt-2 break-all text-[13px] text-text-muted">{settings.mediaRoot}</p>
          {settings.lastScan && (
            <p className="mt-1 text-[11px] text-text-muted">
              Ultima scansione: {new Date(settings.lastScan).toLocaleString("it-IT")}
            </p>
          )}
          <p className="mt-2 text-[12px] leading-relaxed text-text-muted">
            Nell&apos;app installata la cartella predefinita è in AppData. Se hai già
            i file altrove (es. la cartella <code className="text-text-secondary">media</code>{" "}
            del progetto), collegala qui sotto.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void handleChooseMediaFolder()}
              disabled={scanning || saving}
              className="inline-flex items-center gap-2 rounded-full border border-accent/30 bg-accent/10 px-4 py-2 text-[12px] text-text-primary hover:bg-accent/15 disabled:opacity-50"
            >
              <FolderOpen className="h-3.5 w-3.5" />
              Scegli cartella media
            </button>
            <button
              type="button"
              onClick={() => void handleScan()}
              disabled={scanning || saving}
              className="inline-flex items-center gap-2 rounded-full border border-white/10 px-4 py-2 text-[12px] text-text-primary hover:bg-white/[0.04] disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${scanning ? "animate-spin" : ""}`} />
              Scansiona cartella media
            </button>
          </div>
          {scanMessage && (
            <p className="mt-3 text-[12px] text-mint">{scanMessage}</p>
          )}
          {onOpenManage && (
            <button
              type="button"
              onClick={onOpenManage}
              className="mt-4 inline-flex items-center gap-2 rounded-full border border-white/10 px-4 py-2 text-[12px] text-text-primary hover:bg-white/[0.04]"
            >
              <Library className="h-3.5 w-3.5" />
              Gestisci file libreria
            </button>
          )}
        </section>

        <section className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5">
          <div className="flex items-center gap-2 text-text-primary">
            <Tv className="h-4 w-4 text-accent" />
            <h3 className="text-[15px] font-medium">Trasmissione TV</h3>
          </div>
          <p className="mt-2 text-[13px] leading-relaxed text-text-muted">
            Porta streaming LAN: <strong className="text-text-secondary">{settings.streamPort}</strong>.
            Consenti Branchefy sul firewall Windows per reti private.
          </p>
          <div className="mt-4 flex items-center justify-between gap-4">
            <p className="text-[13px] text-text-secondary">
              Transcodifica automatica per TV (MKV → MP4)
            </p>
            <button
              type="button"
              onClick={() =>
                void saveSettings({
                  castTranscodeEnabled: !settings.castTranscodeEnabled,
                })
              }
              className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${
                settings.castTranscodeEnabled ? "bg-accent" : "bg-white/15"
              }`}
            >
              <span
                className={`absolute top-0.5 h-6 w-6 rounded-full bg-white transition-transform ${
                  settings.castTranscodeEnabled ? "left-[22px]" : "left-0.5"
                }`}
              />
            </button>
          </div>
        </section>

        <section className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5">
          <h3 className="text-[15px] font-medium text-text-primary">Metadati TMDB</h3>
          <p className="mt-1 text-[13px] text-text-muted">
            Poster e descrizioni automatici. Crea una chiave su themoviedb.org
          </p>
          <input
            type="password"
            value={settings.tmdbApiKey ?? ""}
            onChange={(e) =>
              setSettings({ ...settings, tmdbApiKey: e.target.value })
            }
            onBlur={() =>
              void saveSettings({ tmdbApiKey: settings.tmdbApiKey ?? "" })
            }
            placeholder="Chiave API TMDB"
            className="mt-4 w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2.5 text-[13px] outline-none focus:border-accent/30"
          />
          <div className="mt-4 flex items-center justify-between gap-4">
            <p className="text-[13px] text-text-secondary">
              Arricchisci automaticamente alla scansione
            </p>
            <button
              type="button"
              onClick={() =>
                void saveSettings({
                  tmdbEnrichOnScan: !settings.tmdbEnrichOnScan,
                })
              }
              className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${
                settings.tmdbEnrichOnScan ? "bg-accent" : "bg-white/15"
              }`}
            >
              <span
                className={`absolute top-0.5 h-6 w-6 rounded-full bg-white transition-transform ${
                  settings.tmdbEnrichOnScan ? "left-[22px]" : "left-0.5"
                }`}
              />
            </button>
          </div>
        </section>

        <section className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5">
          <h3 className="text-[15px] font-medium text-text-primary">Cartelle cloud (rclone)</h3>
          <p className="mt-2 text-[13px] leading-relaxed text-text-muted">
            Per serie su Mega o cloud senza scaricare tutto: monta la cartella remota con{" "}
            <code className="text-text-secondary">rclone mount</code> dentro{" "}
            <code className="text-text-secondary">media/serie/</code>, poi usa «Scansiona cartella media».
            Vedi <code className="text-text-secondary">media/README.md</code> per i comandi.
          </p>
        </section>

        <section className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Volume2 className="h-4 w-4 text-accent" />
              <h3 className="text-[15px] font-medium text-text-primary">Suono intro</h3>
            </div>
            <button
              type="button"
              onClick={() =>
                void saveSettings({ introSoundEnabled: !settings.introSoundEnabled })
              }
              className={`relative h-7 w-12 rounded-full transition-colors ${
                settings.introSoundEnabled ? "bg-accent" : "bg-white/15"
              }`}
            >
              <span
                className={`absolute top-0.5 h-6 w-6 rounded-full bg-white transition-transform ${
                  settings.introSoundEnabled ? "left-[22px]" : "left-0.5"
                }`}
              />
            </button>
          </div>
          <p className="mt-2 text-[13px] text-text-muted">
            Effetto sonoro all&apos;avvio di Branchefy
          </p>
        </section>

        <section className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5">
          <h3 className="text-[15px] font-medium text-text-primary">I tuoi abbonamenti</h3>
          <p className="mt-1 text-[13px] text-text-muted">
            Per ogni titolo potrai vedere «In casa» e i servizi dove cercarlo
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {STREAMING_SERVICES.map((service) => {
              const active = settings.subscribedServices.includes(service.id);
              return (
                <button
                  key={service.id}
                  type="button"
                  disabled={saving}
                  onClick={() => toggleService(service.id)}
                  className={`rounded-full border px-3 py-1.5 text-[12px] transition-colors ${
                    active
                      ? "border-accent/40 bg-accent/10 text-text-primary"
                      : "border-white/[0.08] text-text-muted hover:border-white/15"
                  }`}
                >
                  {service.label}
                </button>
              );
            })}
          </div>
        </section>

        {STREMIO_ADDONS_ENABLED && (
          <section className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5">
            <h3 className="text-[15px] font-medium text-text-primary">
              Addon Stremio
            </h3>
            <p className="mt-1 text-[13px] text-text-muted">
              Cataloghi e streaming remoto (protocollo addon Stremio)
            </p>
            <AddonManagerPanel parentProfileId={profileId} />
          </section>
        )}

        {STREMIO_ADDONS_ENABLED && (
          <section className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5">
            <h3 className="text-[15px] font-medium text-text-primary">
              Debrid (Real-Debrid / AllDebrid)
            </h3>
            <p className="mt-1 text-[13px] text-text-muted">
              Riproduce in-app gli stream torrent degli addon convertendoli in link
              HTTP diretti col tuo account. Nessun server torrent necessario.
            </p>
            <DebridPanel parentProfileId={profileId} />
          </section>
        )}

        <section className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5">
          <h3 className="text-[15px] font-medium text-text-primary">
            Limiti profili bambino
          </h3>
          <p className="mt-1 text-[13px] text-text-muted">
            Tempo giornaliero e fascia oraria senza TV
          </p>
          <ParentalLimitsPanel parentProfileId={profileId} />
        </section>

        <AppUpdaterSection />

        <section className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5">
          <h3 className="text-[15px] font-medium text-text-primary">PIN profilo genitore</h3>
          <p className="mt-1 text-[13px] text-text-muted">
            Protegge l&apos;accesso al profilo genitore e alle impostazioni
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <input
              value={currentPin}
              onChange={(e) => setCurrentPin(e.target.value.replace(/\D/g, ""))}
              placeholder="PIN attuale (se già impostato)"
              maxLength={8}
              className="rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2.5 text-[13px] outline-none focus:border-accent/30"
            />
            <input
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
              placeholder="Nuovo PIN"
              maxLength={8}
              className="rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2.5 text-[13px] outline-none focus:border-accent/30"
            />
            <input
              value={pinConfirm}
              onChange={(e) => setPinConfirm(e.target.value.replace(/\D/g, ""))}
              placeholder="Conferma nuovo PIN"
              maxLength={8}
              className="rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2.5 text-[13px] outline-none focus:border-accent/30"
            />
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void handleSetPin()}
              className="rounded-full bg-text-primary px-4 py-2 text-[12px] font-medium text-void"
            >
              Salva PIN
            </button>
            <button
              type="button"
              onClick={() => void handleRemovePin()}
              className="rounded-full border border-white/10 px-4 py-2 text-[12px] text-text-secondary"
            >
              Rimuovi PIN
            </button>
          </div>
          {pinMessage && (
            <p className="mt-3 text-[12px] text-text-secondary">{pinMessage}</p>
          )}
        </section>
      </div>
    </div>
  );
}
