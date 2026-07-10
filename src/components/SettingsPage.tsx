import { useCallback, useEffect, useState } from "react";
import { Loader2, Settings2, Volume2 } from "lucide-react";
import { setProfilePin, removeProfilePin } from "../lib/profilesApi";
import { fetchSettings, updateSettings } from "../lib/settingsApi";
import { STREAMING_SERVICES } from "../data/streaming";
import { ParentalLimitsPanel } from "./ParentalLimitsPanel";
import { AppUpdaterSection } from "./AppUpdaterSection";
import { CloudAuthPanel } from "./CloudAuthPanel";
import { AddonManagerPanel } from "./AddonManagerPanel";
import { DebridPanel } from "./DebridPanel";
import { STREMIO_ADDONS_ENABLED } from "../lib/features";
import type { AppSettings } from "../lib/settingsApi";
import { AmbientThemePicker } from "./settings/AmbientThemePicker";
import {
  SettingsButton,
  SettingsGroupLabel,
  SettingsInput,
  SettingsPill,
  SettingsSection,
} from "./settings/SettingsUi";

interface SettingsPageProps {
  profileId: string;
}

export function SettingsPage({ profileId }: SettingsPageProps) {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pin, setPin] = useState("");
  const [pinConfirm, setPinConfirm] = useState("");
  const [currentPin, setCurrentPin] = useState("");
  const [pinMessage, setPinMessage] = useState<string | null>(null);
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
    <div className="page-px pb-24 pt-[calc(var(--app-nav-height)+1.75rem)] sm:pt-[calc(var(--app-nav-height)+2.25rem)]">
      <div className="mx-auto w-full max-w-lg">
        <header className="mb-8 text-center sm:mb-10">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-accent/25 bg-accent/10 shadow-[0_0_32px_rgba(94,234,212,0.12)]">
            <Settings2 className="h-5 w-5 text-accent" />
          </div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.32em] text-accent">
            Branchefy
          </p>
          <h1 className="font-display mt-2 text-[clamp(1.65rem,4vw,2.25rem)] font-semibold tracking-[-0.04em] text-text-primary">
            Impostazioni
          </h1>
          <p className="mx-auto mt-2 max-w-sm text-[13px] leading-relaxed text-text-muted">
            Aspetto, streaming, account e controllo genitori
          </p>
        </header>

        {error && (
          <p className="mb-5 rounded-xl border border-warm/25 bg-warm/10 px-4 py-3 text-center text-[13px] text-warm">
            {error}
          </p>
        )}

        <div className="space-y-3">
          <SettingsGroupLabel>Aspetto</SettingsGroupLabel>
          <AmbientThemePicker />

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

          <SettingsGroupLabel>Streaming</SettingsGroupLabel>

          <SettingsSection
            title="I tuoi abbonamenti"
            description="Per ogni titolo vedi dove è disponibile in streaming"
          >
            <div className="flex flex-wrap justify-center gap-2 sm:justify-start">
              {STREAMING_SERVICES.map((service) => {
                const active = settings.subscribedServices.includes(service.id);
                return (
                  <SettingsPill
                    key={service.id}
                    active={active}
                    disabled={saving}
                    onClick={() => toggleService(service.id)}
                  >
                    {service.label}
                  </SettingsPill>
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
