import { useEffect, useState } from "react";
import { Check, Paintbrush } from "lucide-react";
import {
  applyChromeMode,
  CHROME_MODE_EVENT,
  readChromeMode,
  writeChromeMode,
  type ChromeMode,
} from "../../lib/chromeTheme";
import { SettingsSection } from "./SettingsUi";

const OPTIONS: Array<{
  id: ChromeMode;
  label: string;
  description: string;
  preview: string;
}> = [
  {
    id: "colored",
    label: "Colorato",
    description: "Tema scuro con dock e riflessi ambient",
    preview:
      "linear-gradient(135deg, rgb(40 28 55 / 0.95), rgb(20 20 28 / 0.92) 45%, rgb(88 28 135 / 0.45))",
  },
  {
    id: "white",
    label: "Bianco",
    description: "Tema chiaro per tutta l’app (testi, pannelli, barre)",
    preview:
      "linear-gradient(135deg, rgb(255 255 255 / 0.95), rgb(240 242 248 / 0.88) 55%, rgb(255 255 255 / 0.7))",
  },
];

export function ChromeModePicker() {
  const [mode, setMode] = useState<ChromeMode>(() => {
    const current = readChromeMode();
    applyChromeMode(current);
    return current;
  });

  useEffect(() => {
    const onChange = () => setMode(readChromeMode());
    window.addEventListener(CHROME_MODE_EVENT, onChange);
    return () => window.removeEventListener(CHROME_MODE_EVENT, onChange);
  }, []);

  return (
    <SettingsSection
      icon={Paintbrush}
      title="Tema interfaccia"
      description="Colore di sfondo, testi, impostazioni e barre di navigazione"
    >
      <div className="grid grid-cols-2 gap-3">
        {OPTIONS.map((option) => {
          const active = option.id === mode;
          return (
            <button
              key={option.id}
              type="button"
              aria-pressed={active}
              onClick={() => {
                writeChromeMode(option.id);
                setMode(option.id);
              }}
              className={`group relative min-h-[96px] overflow-hidden rounded-[1.35rem] border px-3.5 py-3.5 text-left transition-all active:scale-[0.98] ${
                active
                  ? "border-transparent bg-text-primary text-void shadow-[0_8px_24px_rgba(0,0,0,0.16)]"
                  : "border-border bg-fill-muted hover:border-border-hover hover:bg-fill"
              }`}
            >
              <div
                className={`mb-3 h-10 w-full rounded-2xl border ${
                  active ? "border-white/20" : "border-border"
                }`}
                style={{ background: option.preview }}
                aria-hidden
              />
              <p
                className={`font-display text-[13px] font-semibold tracking-[-0.02em] ${
                  active ? "text-void" : "text-text-primary"
                }`}
              >
                {option.label}
              </p>
              <p
                className={`mt-0.5 line-clamp-2 text-[11px] leading-snug ${
                  active ? "text-void/55" : "text-text-muted"
                }`}
              >
                {option.description}
              </p>
              {active && (
                <span className="absolute right-3 top-3 flex h-6 w-6 items-center justify-center rounded-full bg-void text-text-primary">
                  <Check className="h-3.5 w-3.5" strokeWidth={3} />
                </span>
              )}
            </button>
          );
        })}
      </div>
    </SettingsSection>
  );
}
