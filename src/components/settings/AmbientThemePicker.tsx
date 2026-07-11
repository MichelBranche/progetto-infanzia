import { useEffect, useState } from "react";
import { Check, Palette } from "lucide-react";
import {
  AMBIENT_THEMES,
  readAmbientThemeId,
  writeAmbientThemeId,
  type AmbientThemeId,
} from "../../lib/ambientThemes";
import { useHeroAmbientControls } from "../../context/HeroAmbientContext";
import { boostAmbientPalette } from "../../lib/imagePalette";
import { SettingsSection } from "./SettingsUi";

export function AmbientThemePicker() {
  const { setPalette } = useHeroAmbientControls();
  const [activeId, setActiveId] = useState<AmbientThemeId>(readAmbientThemeId);

  useEffect(() => {
    const onTheme = () => setActiveId(readAmbientThemeId());
    window.addEventListener("branchefy:ambient-theme", onTheme);
    return () => window.removeEventListener("branchefy:ambient-theme", onTheme);
  }, []);

  const selectTheme = (id: AmbientThemeId) => {
    if (id === activeId) return;
    writeAmbientThemeId(id);
    setActiveId(id);
    const theme = AMBIENT_THEMES.find((t) => t.id === id);
    if (theme) setPalette(boostAmbientPalette(theme.palette));
  };

  return (
    <SettingsSection
      icon={Palette}
      title="Colore sfondo animato"
      description="Aurora liquida nelle sezioni Film, Serie TV, caricamento e selezione profilo"
    >
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        {AMBIENT_THEMES.map((theme) => {
          const active = theme.id === activeId;
          return (
            <button
              key={theme.id}
              type="button"
              onClick={() => selectTheme(theme.id)}
              aria-pressed={active}
              className={`group relative min-h-[88px] overflow-hidden rounded-xl border px-3 py-3.5 text-left transition-all active:scale-[0.98] sm:min-h-0 sm:py-3 ${
                active
                  ? "border-accent/50 bg-accent/[0.08] shadow-[0_0_28px_rgba(94,234,212,0.14)]"
                  : "border-white/[0.06] bg-white/[0.02] hover:border-white/15 hover:bg-white/[0.04]"
              }`}
            >
              <div
                className={`mb-2.5 h-10 w-full rounded-lg border transition-shadow ${
                  active ? "border-accent/30 shadow-[0_0_20px_rgba(94,234,212,0.2)]" : "border-white/10"
                }`}
                style={{ background: theme.preview }}
                aria-hidden
              />
              <p className="font-display text-[12px] font-medium tracking-[-0.01em] text-text-primary">
                {theme.label}
              </p>
              <p className="mt-0.5 text-[10px] leading-snug text-text-muted">
                {theme.description}
              </p>
              {active && (
                <span className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-accent text-void shadow-[0_0_12px_rgba(94,234,212,0.6)]">
                  <Check className="h-3 w-3" strokeWidth={3} />
                </span>
              )}
            </button>
          );
        })}
      </div>
    </SettingsSection>
  );
}
