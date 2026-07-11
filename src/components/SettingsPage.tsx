import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  Blocks,
  KeyRound,
  Loader2,
  Lock,
  Shield,
  Tv,
  Volume2,
} from "lucide-react";
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
  SettingsAlert,
  SettingsButton,
  SettingsGroupLabel,
  SettingsInput,
  SettingsPill,
  SettingsSection,
  SettingsSwitch,
} from "./settings/SettingsUi";

interface SettingsPageProps {
  profileId: string;
}

const sectionMotion = {
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0 },
};

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

  let motionIndex = 0;

  return (
    <div className="relative min-h-full">
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_90%_55%_at_50%_-15%,rgba(94,234,212,0.09),transparent_65%)]" />
        <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-void/80 to-transparent" />
        <div className="noise-overlay absolute inset-0 opacity-[0.035]" />
      </div>

      <div className="page-px relative pb-24 pt-[calc(var(--app-nav-height)+1.75rem)] sm:pt-[calc(var(--app-nav-height)+2.25rem)]">
        <div className="mx-auto w-full max-w-2xl">
          <motion.header
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
            className="mb-8 text-center sm:mb-10"
          >
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-white/[0.08] bg-white/[0.03] shadow-[0_12px_40px_rgba(0,0,0,0.35)]">
              <span className="chromatic-logo chromatic-logo--skew font-display text-[2rem] font-black leading-none tracking-[-0.08em]">
                B
              </span>
            </div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.32em] text-accent">
              Branchefy
            </p>
            <h1 className="font-display mt-2 text-[clamp(1.75rem,4vw,2.5rem)] font-semibold tracking-[-0.04em] text-text-primary">
              Impostazioni
            </h1>
            <p className="mx-auto mt-2 max-w-md text-[13px] leading-relaxed text-text-muted">
              Aspetto, streaming, account e controllo genitori
            </p>
          </motion.header>

          {error && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-5"
            >
              <SettingsAlert variant="error">{error}</SettingsAlert>
            </motion.div>
          )}

          <div className="space-y-3">
            <motion.div
              {...sectionMotion}
              transition={{ delay: motionIndex++ * 0.05, duration: 0.4 }}
            >
              <SettingsGroupLabel>Aspetto</SettingsGroupLabel>
              <AmbientThemePicker />
            </motion.div>

            <motion.div
              {...sectionMotion}
              transition={{ delay: motionIndex++ * 0.05, duration: 0.4 }}
            >
              <SettingsGroupLabel>Account</SettingsGroupLabel>
              <CloudAuthPanel />
            </motion.div>

            <motion.div
              {...sectionMotion}
              transition={{ delay: motionIndex++ * 0.05, duration: 0.4 }}
            >
              <SettingsSection
                icon={Lock}
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
                <div className="mt-4 flex flex-wrap gap-2">
                  <SettingsButton variant="primary" onClick={() => void handleSetPin()}>
                    Salva PIN
                  </SettingsButton>
                  <SettingsButton variant="secondary" onClick={() => void handleRemovePin()}>
                    Rimuovi PIN
                  </SettingsButton>
                </div>
                {pinMessage && (
                  <p className="mt-3 text-[12px] text-text-secondary">{pinMessage}</p>
                )}
              </SettingsSection>
            </motion.div>

            <motion.div
              {...sectionMotion}
              transition={{ delay: motionIndex++ * 0.05, duration: 0.4 }}
            >
              <SettingsGroupLabel>Streaming</SettingsGroupLabel>

              <SettingsSection
                icon={Tv}
                title="I tuoi abbonamenti"
                description="Per ogni titolo vedi dove è disponibile in streaming"
              >
                <div className="flex flex-wrap gap-2">
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
            </motion.div>

            {STREMIO_ADDONS_ENABLED && (
              <motion.div
                {...sectionMotion}
                transition={{ delay: motionIndex++ * 0.05, duration: 0.4 }}
              >
                <SettingsSection
                  icon={Blocks}
                  title="Addon Stremio"
                  description="Cataloghi e streaming remoto"
                >
                  <AddonManagerPanel parentProfileId={profileId} />
                </SettingsSection>
              </motion.div>
            )}

            {STREMIO_ADDONS_ENABLED && (
              <motion.div
                {...sectionMotion}
                transition={{ delay: motionIndex++ * 0.05, duration: 0.4 }}
              >
                <SettingsSection
                  icon={KeyRound}
                  title="Debrid"
                  description="Real-Debrid / AllDebrid per stream torrent in-app"
                >
                  <DebridPanel parentProfileId={profileId} />
                </SettingsSection>
              </motion.div>
            )}

            <motion.div
              {...sectionMotion}
              transition={{ delay: motionIndex++ * 0.05, duration: 0.4 }}
            >
              <SettingsGroupLabel>Famiglia</SettingsGroupLabel>

              <SettingsSection
                icon={Shield}
                title="Limiti profili bambino"
                description="Tempo giornaliero e fascia oraria consentita"
              >
                <ParentalLimitsPanel parentProfileId={profileId} />
              </SettingsSection>
            </motion.div>

            <motion.div
              {...sectionMotion}
              transition={{ delay: motionIndex++ * 0.05, duration: 0.4 }}
            >
              <SettingsGroupLabel>App</SettingsGroupLabel>

              <SettingsSection
                icon={Volume2}
                title="Suono intro"
                description="Effetto sonoro all'avvio di Branchefy"
                headerRight={
                  <SettingsSwitch
                    enabled={settings.introSoundEnabled}
                    disabled={saving}
                    onChange={() =>
                      void saveSettings({ introSoundEnabled: !settings.introSoundEnabled })
                    }
                  />
                }
              />

              <div className="mt-3">
                <AppUpdaterSection />
              </div>
            </motion.div>
          </div>
        </div>
      </div>
    </div>
  );
}
