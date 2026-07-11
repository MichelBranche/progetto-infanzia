import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, KeyRound, Loader2 } from "lucide-react";
import { getDebridConfig, setDebridConfig, testDebrid } from "../lib/addonsApi";
import {
  SettingsAlert,
  SettingsButton,
  SettingsField,
  SettingsInput,
  SettingsPill,
} from "./settings/SettingsUi";

interface DebridPanelProps {
  parentProfileId: string;
}

const PROVIDERS = [
  { id: "none", label: "Disattivato" },
  { id: "realdebrid", label: "Real-Debrid" },
  { id: "alldebrid", label: "AllDebrid" },
] as const;

const KEY_LINKS: Record<string, string> = {
  realdebrid: "https://real-debrid.com/apitoken",
  alldebrid: "https://alldebrid.com/apikeys",
};

export function DebridPanel({ parentProfileId }: DebridPanelProps) {
  const [provider, setProvider] = useState("none");
  const [apiKey, setApiKey] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "err"; text: string } | null>(
    null,
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const cfg = await getDebridConfig();
      setProvider(cfg.provider || "none");
      setApiKey(cfg.apiKey || "");
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    setSaving(true);
    setMessage(null);
    try {
      await setDebridConfig(parentProfileId, provider, provider === "none" ? "" : apiKey);
      setMessage({ kind: "ok", text: "Configurazione salvata." });
    } catch (err) {
      setMessage({
        kind: "err",
        text: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setSaving(false);
    }
  };

  const test = async () => {
    setTesting(true);
    setMessage(null);
    try {
      const username = await testDebrid(parentProfileId, provider, apiKey);
      setMessage({ kind: "ok", text: `Connesso come ${username}.` });
    } catch (err) {
      setMessage({
        kind: "err",
        text: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-6">
        <Loader2 className="h-5 w-5 animate-spin text-text-muted" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {PROVIDERS.map((p) => (
          <SettingsPill
            key={p.id}
            active={provider === p.id}
            onClick={() => {
              setProvider(p.id);
              setMessage(null);
            }}
          >
            {p.label}
          </SettingsPill>
        ))}
      </div>

      {provider !== "none" && (
        <>
          <SettingsField label="Chiave API">
            <div className="relative">
              <KeyRound className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
              <SettingsInput
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Incolla la chiave API"
                className="pl-10"
              />
            </div>
          </SettingsField>
          {KEY_LINKS[provider] && (
            <p className="text-[12px] text-text-muted">
              Ottieni la chiave su{" "}
              <span className="text-accent">{KEY_LINKS[provider]}</span>
            </p>
          )}
        </>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <SettingsButton variant="primary" onClick={() => void save()} disabled={saving}>
          {saving ? "Salvataggio…" : "Salva"}
        </SettingsButton>
        {provider !== "none" && (
          <SettingsButton
            variant="secondary"
            onClick={() => void test()}
            disabled={testing || !apiKey}
          >
            {testing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <CheckCircle2 className="h-3.5 w-3.5" />
            )}
            Verifica chiave
          </SettingsButton>
        )}
      </div>

      {message && (
        <SettingsAlert variant={message.kind === "ok" ? "success" : "error"}>
          {message.text}
        </SettingsAlert>
      )}
    </div>
  );
}
