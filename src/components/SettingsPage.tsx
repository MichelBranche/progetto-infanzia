import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Blocks,
  Cloud,
  Globe,
  KeyRound,
  Lock,
  LayoutGrid,
  Paintbrush,
  Settings2,
  Shield,
  Volume2,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { IS_TAURI_SHELL } from "../lib/tauriShell";
import { setProfilePin, removeProfilePin } from "../lib/profilesApi";
import { fetchSettings, updateSettings } from "../lib/settingsApi";
import { ParentalLimitsPanel } from "./ParentalLimitsPanel";
import { AppUpdaterSection } from "./AppUpdaterSection";
import { CloudAuthPanel } from "./CloudAuthPanel";
import { AddonManagerPanel } from "./AddonManagerPanel";
import { DebridPanel } from "./DebridPanel";
import { STREMIO_ADDONS_ENABLED } from "../lib/features";
import type { AppSettings } from "../lib/settingsApi";
import { AmbientThemePicker } from "./settings/AmbientThemePicker";
import { ChromeModePicker } from "./settings/ChromeModePicker";
import { SettingsSkeleton } from "./Skeleton";
import {
  SettingsAlert,
  SettingsButton,
  SettingsInput,
  SettingsNavItem,
  SettingsSection,
  SettingsShell,
  SettingsSwitch,
} from "./settings/SettingsUi";

interface SettingsPageProps {
  profileId: string;
}

type SettingsTabId = "aspect" | "account" | "streaming" | "family" | "app";

const TABS: Array<{
  id: SettingsTabId;
  label: string;
  icon: LucideIcon;
  title: string;
  subtitle: string;
}> = [
  {
    id: "aspect",
    label: "Aspetto",
    icon: Paintbrush,
    title: "Aspetto",
    subtitle: "Tema interfaccia e aurora animata",
  },
  {
    id: "account",
    label: "Account",
    icon: Cloud,
    title: "Account",
    subtitle: "Accesso cloud e PIN profilo genitore",
  },
  {
    id: "streaming",
    label: "Streaming",
    icon: Blocks,
    title: "Streaming",
    subtitle: "Addon Stremio e servizi debrid",
  },
  {
    id: "family",
    label: "Famiglia",
    icon: Shield,
    title: "Famiglia",
    subtitle: "Limiti tempo e fascia oraria",
  },
  {
    id: "app",
    label: "App",
    icon: Settings2,
    title: "App",
    subtitle: "Suoni, proxy e aggiornamenti",
  },
];

export function SettingsPage({ profileId }: SettingsPageProps) {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pin, setPin] = useState("");
  const [pinConfirm, setPinConfirm] = useState("");
  const [currentPin, setCurrentPin] = useState("");
  const [pinMessage, setPinMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scProxyDraft, setScProxyDraft] = useState("");
  const [activeTab, setActiveTab] = useState<SettingsTabId>("aspect");

  const visibleTabs = useMemo(
    () =>
      TABS.filter((tab) => tab.id !== "streaming" || STREMIO_ADDONS_ENABLED),
    [],
  );

  const activeMeta = visibleTabs.find((tab) => tab.id === activeTab) ?? visibleTabs[0];
  const ActiveIcon = activeMeta.icon;

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

  useEffect(() => {
    if (settings) setScProxyDraft(settings.scProxyUrl ?? "");
  }, [settings?.scProxyUrl]);

  useEffect(() => {
    if (!STREMIO_ADDONS_ENABLED && activeTab === "streaming") {
      setActiveTab("aspect");
    }
  }, [activeTab]);

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
    return <SettingsSkeleton />;
  }

  const sidebar = (
    <>
      <div className="flex items-center gap-2.5 px-4 pb-3 pt-4 lg:px-5 lg:pb-5 lg:pt-6">
        <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-text-primary font-display text-[15px] font-black italic tracking-[-0.06em] text-void">
          B
        </span>
        <div className="min-w-0">
          <p className="font-display text-[15px] font-semibold tracking-[-0.03em] text-text-primary">
            Branchefy
          </p>
          <p className="text-[11px] text-text-muted">Impostazioni</p>
        </div>
      </div>

      <nav
        className="flex gap-1 overflow-x-auto px-3 pb-3 scrollbar-hide lg:flex-1 lg:flex-col lg:overflow-visible lg:px-3 lg:pb-4"
        aria-label="Sezioni impostazioni"
      >
        {visibleTabs.map((tab) => (
          <div key={tab.id} className="shrink-0 lg:w-full">
            <SettingsNavItem
              icon={tab.icon}
              label={tab.label}
              active={activeTab === tab.id}
              onClick={() => setActiveTab(tab.id)}
            />
          </div>
        ))}
      </nav>

      <div className="mt-auto hidden border-t border-border px-5 py-4 lg:block">
        <p className="text-[12px] leading-relaxed text-text-secondary">
          Tema e aurora restano salvati su questo dispositivo.
        </p>
      </div>
    </>
  );

  return (
    <div className="page-px relative pb-[max(5.5rem,var(--mobile-nav-height))] pt-[calc(var(--app-nav-height)+0.85rem)] sm:pb-20 sm:pt-[calc(var(--app-nav-height)+1.5rem)]">
      <div className="mx-auto w-full max-w-6xl">
        <SettingsShell sidebar={sidebar}>
          <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-5 sm:px-7 sm:py-6">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-text-muted">
                {activeMeta.label}
              </p>
              <h1 className="font-display mt-1 text-[clamp(1.65rem,3vw,2.15rem)] font-semibold tracking-[-0.045em] text-text-primary">
                {activeMeta.title}
              </h1>
              <p className="mt-1 text-[13px] text-text-muted sm:text-[14px]">
                {activeMeta.subtitle}
              </p>
            </div>
            <span className="hidden h-11 w-11 shrink-0 items-center justify-center rounded-full bg-fill-strong text-text-primary sm:flex">
              <ActiveIcon className="h-5 w-5" strokeWidth={1.85} />
            </span>
          </div>

          <div className="space-y-4 p-4 sm:p-6 lg:p-7">
            {error && <SettingsAlert variant="error">{error}</SettingsAlert>}

            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                className="space-y-4"
              >
                {activeTab === "aspect" && (
                  <>
                    <ChromeModePicker />
                    <AmbientThemePicker />
                  </>
                )}

                {activeTab === "account" && (
                  <>
                    <CloudAuthPanel />
                    <SettingsSection
                      variant="ink"
                      icon={Lock}
                      title="PIN profilo genitore"
                      description="Protegge l'accesso al profilo genitore e alle impostazioni"
                    >
                      <div className="grid gap-3 sm:grid-cols-2">
                        <SettingsInput
                          value={currentPin}
                          onChange={(e) =>
                            setCurrentPin(e.target.value.replace(/\D/g, ""))
                          }
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
                          onChange={(e) =>
                            setPinConfirm(e.target.value.replace(/\D/g, ""))
                          }
                          placeholder="Conferma PIN"
                          maxLength={8}
                          inputMode="numeric"
                          className="sm:col-span-2"
                        />
                      </div>
                      <div className="mt-4 flex flex-wrap gap-2">
                        <SettingsButton
                          variant="primary"
                          className="settings-ink-btn-primary"
                          onClick={() => void handleSetPin()}
                        >
                          Salva PIN
                        </SettingsButton>
                        <SettingsButton
                          variant="secondary"
                          className="settings-ink-btn-secondary"
                          onClick={() => void handleRemovePin()}
                        >
                          Rimuovi PIN
                        </SettingsButton>
                      </div>
                      {pinMessage && (
                        <p className="mt-3 text-[13px] text-text-secondary">{pinMessage}</p>
                      )}
                    </SettingsSection>
                  </>
                )}

                {activeTab === "streaming" && STREMIO_ADDONS_ENABLED && (
                  <>
                    <SettingsSection
                      icon={Blocks}
                      title="Addon Stremio"
                      description="Cataloghi e streaming remoto"
                    >
                      <AddonManagerPanel parentProfileId={profileId} />
                    </SettingsSection>
                    <SettingsSection
                      icon={KeyRound}
                      title="Debrid"
                      description="Real-Debrid / AllDebrid per stream torrent in-app"
                    >
                      <DebridPanel parentProfileId={profileId} />
                    </SettingsSection>
                  </>
                )}

                {activeTab === "family" && (
                  <SettingsSection
                    icon={Shield}
                    title="Limiti profili bambino"
                    description="Tempo giornaliero e fascia oraria consentita"
                  >
                    <ParentalLimitsPanel parentProfileId={profileId} />
                  </SettingsSection>
                )}

                {activeTab === "app" && (
                  <>
                    <div className="grid gap-4 lg:grid-cols-2">
                      <SettingsSection
                        icon={Volume2}
                        title="Suono intro"
                        description="Effetto sonoro all'avvio di Branchefy"
                        headerRight={
                          <SettingsSwitch
                            enabled={settings.introSoundEnabled}
                            disabled={saving}
                            onChange={() =>
                              void saveSettings({
                                introSoundEnabled: !settings.introSoundEnabled,
                              })
                            }
                          />
                        }
                      />
                      <SettingsSection
                        icon={LayoutGrid}
                        title="Suoni card home"
                        description="Effetti sulle card e al click per aprire un titolo"
                        headerRight={
                          <SettingsSwitch
                            enabled={settings.homeCardSoundsEnabled}
                            disabled={saving}
                            onChange={() =>
                              void saveSettings({
                                homeCardSoundsEnabled:
                                  !settings.homeCardSoundsEnabled,
                              })
                            }
                          />
                        }
                      />
                    </div>

                    {IS_TAURI_SHELL && (
                      <SettingsSection
                        icon={Globe}
                        title="Proxy StreamingCommunity"
                        description="Instrada solo StreamingCommunity tramite proxy. Lascialo spento per la connessione diretta."
                        headerRight={
                          <SettingsSwitch
                            enabled={settings.scProxyEnabled}
                            disabled={saving}
                            onChange={() =>
                              void saveSettings({
                                scProxyEnabled: !settings.scProxyEnabled,
                              })
                            }
                          />
                        }
                      >
                        {settings.scProxyEnabled && (
                          <div className="mt-1">
                            <SettingsInput
                              value={scProxyDraft}
                              onChange={(e) => setScProxyDraft(e.target.value)}
                              placeholder="socks5://utente:password@host:1080"
                              spellCheck={false}
                              autoCapitalize="none"
                            />
                            <div className="mt-3 flex flex-wrap items-center gap-2">
                              <SettingsButton
                                variant="primary"
                                onClick={() =>
                                  void saveSettings({
                                    scProxyUrl: scProxyDraft.trim(),
                                  })
                                }
                              >
                                Salva proxy
                              </SettingsButton>
                              {settings.scProxyUrl && (
                                <span className="text-[12px] text-text-secondary">
                                  Attivo: {settings.scProxyUrl}
                                </span>
                              )}
                            </div>
                            <p className="mt-3 text-[12px] leading-relaxed text-text-muted">
                              Schemi: <code>http://</code>, <code>https://</code>,{" "}
                              <code>socks5://</code>, <code>socks5h://</code>.
                            </p>
                          </div>
                        )}
                      </SettingsSection>
                    )}

                    <AppUpdaterSection />
                  </>
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        </SettingsShell>
      </div>
    </div>
  );
}
