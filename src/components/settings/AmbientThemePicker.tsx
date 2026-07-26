import { useEffect, useState } from "react";
import { Check, Palette, Pipette } from "lucide-react";
import {
  AMBIENT_THEMES,
  buildCustomAmbientTheme,
  readAmbientThemeId,
  readCustomAmbientColor,
  writeAmbientThemeId,
  writeCustomAmbientColor,
  type AmbientThemeId,
} from "../../lib/ambientThemes";
import { useHeroAmbientControls } from "../../context/HeroAmbientContext";
import { boostAmbientPalette, normalizeHexColor } from "../../lib/imagePalette";
import { SettingsField, SettingsInput, SettingsSection } from "./SettingsUi";

function ThemeSwatch({
  active,
  preview,
  label,
  description,
  onClick,
}: {
  active: boolean;
  preview: string;
  label: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`group relative min-h-[92px] overflow-hidden rounded-[1.35rem] border px-3 py-3 text-left transition-all active:scale-[0.98] sm:min-h-0 ${
        active
          ? "border-transparent bg-text-primary text-void shadow-[0_8px_24px_rgba(0,0,0,0.16)]"
          : "border-border bg-fill-muted hover:border-border-hover hover:bg-fill"
      }`}
    >
      <div
        className={`mb-2.5 h-9 w-full rounded-2xl border ${
          active ? "border-white/20" : "border-border"
        }`}
        style={{ background: preview }}
        aria-hidden
      />
      <p
        className={`font-display text-[12px] font-semibold tracking-[-0.02em] ${
          active ? "text-void" : "text-text-primary"
        }`}
      >
        {label}
      </p>
      <p
        className={`mt-0.5 line-clamp-2 text-[10px] leading-snug ${
          active ? "text-void/55" : "text-text-muted"
        }`}
      >
        {description}
      </p>
      {active && (
        <span className="absolute right-2.5 top-2.5 flex h-5 w-5 items-center justify-center rounded-full bg-void text-text-primary">
          <Check className="h-3 w-3" strokeWidth={3} />
        </span>
      )}
    </button>
  );
}

export function AmbientThemePicker() {
  const { setPalette } = useHeroAmbientControls();
  const [activeId, setActiveId] = useState<AmbientThemeId>(readAmbientThemeId);
  const [customColor, setCustomColor] = useState(readCustomAmbientColor);
  const customTheme = buildCustomAmbientTheme(customColor);

  useEffect(() => {
    const onTheme = () => {
      setActiveId(readAmbientThemeId());
      setCustomColor(readCustomAmbientColor());
    };
    window.addEventListener("branchefy:ambient-theme", onTheme);
    return () => window.removeEventListener("branchefy:ambient-theme", onTheme);
  }, []);

  const applyPalette = (id: AmbientThemeId, color?: string) => {
    const theme =
      id === "custom"
        ? buildCustomAmbientTheme(color ?? customColor)
        : AMBIENT_THEMES.find((entry) => entry.id === id);
    if (theme) setPalette(boostAmbientPalette(theme.palette));
  };

  const selectTheme = (id: AmbientThemeId) => {
    if (id === activeId && id !== "custom") return;
    writeAmbientThemeId(id);
    setActiveId(id);
    applyPalette(id);
  };

  const updateCustomColor = (raw: string, persist = true) => {
    const normalized = normalizeHexColor(raw, customColor);
    setCustomColor(normalized);
    if (persist) writeCustomAmbientColor(normalized);
    if (activeId === "custom") {
      applyPalette("custom", normalized);
    }
  };

  const selectCustom = () => {
    const normalized = writeCustomAmbientColor(customColor);
    setCustomColor(normalized);
    writeAmbientThemeId("custom");
    setActiveId("custom");
    applyPalette("custom", normalized);
  };

  return (
    <SettingsSection
      icon={Palette}
      title="Colore sfondo animato"
      description="Aurora liquida nelle sezioni Film, Serie TV, caricamento e selezione profilo"
    >
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {AMBIENT_THEMES.map((theme) => (
          <ThemeSwatch
            key={theme.id}
            active={theme.id === activeId}
            preview={theme.preview}
            label={theme.label}
            description={theme.description}
            onClick={() => selectTheme(theme.id)}
          />
        ))}
        <ThemeSwatch
          active={activeId === "custom"}
          preview={customTheme.preview}
          label="Personalizzato"
          description="Scegli un colore tuo"
          onClick={selectCustom}
        />
      </div>

      {activeId === "custom" && (
        <div className="mt-4 rounded-[1.35rem] border border-border bg-fill-muted p-4">
          <div className="flex items-center gap-2 text-[13px] font-medium text-text-primary">
            <Pipette className="h-4 w-4" />
            Colore personalizzato
          </div>
          <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end">
            <label className="flex shrink-0 items-center gap-3">
              <span className="relative h-12 w-12 overflow-hidden rounded-2xl border border-border shadow-[0_8px_20px_rgba(0,0,0,0.15)]">
                <span
                  className="absolute inset-0"
                  style={{ background: customTheme.preview }}
                  aria-hidden
                />
                <input
                  type="color"
                  value={customColor}
                  onChange={(event) => updateCustomColor(event.target.value)}
                  className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                  aria-label="Selettore colore"
                />
              </span>
              <span className="text-[11px] text-text-muted">Tocca per scegliere</span>
            </label>
            <SettingsField label="Codice esadecimale" className="flex-1">
              <SettingsInput
                value={customColor}
                onChange={(event) => updateCustomColor(event.target.value, false)}
                onBlur={(event) => updateCustomColor(event.target.value)}
                placeholder="#7c3aed"
                spellCheck={false}
                maxLength={7}
              />
            </SettingsField>
          </div>
        </div>
      )}
    </SettingsSection>
  );
}
