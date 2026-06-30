import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, KeyRound, Loader2 } from "lucide-react";
import { getDebridConfig, setDebridConfig, testDebrid } from "../lib/addonsApi";

interface DebridPanelProps {
  parentProfileId: string;
}

const PROVIDERS = [
  { id: "none", label: "Disattivato" },
  { id: "realdebrid", label: "Real-Debrid" },
  { id: "alldebrid", label: "AllDebrid" },
];

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
      <div className="mt-4 flex justify-center py-4">
        <Loader2 className="h-5 w-5 animate-spin text-text-muted" />
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-4">
      <div className="flex flex-wrap gap-2">
        {PROVIDERS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => {
              setProvider(p.id);
              setMessage(null);
            }}
            className={`rounded-full border px-3 py-1.5 text-[12px] transition-colors ${
              provider === p.id
                ? "border-accent/40 bg-accent/10 text-text-primary"
                : "border-white/[0.08] text-text-muted hover:border-white/15"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {provider !== "none" && (
        <>
          <div className="relative">
            <KeyRound className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="Chiave API"
              className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] py-2.5 pl-9 pr-3 text-[13px] outline-none focus:border-accent/30"
            />
          </div>
          {KEY_LINKS[provider] && (
            <p className="text-[12px] text-text-muted">
              Ottieni la chiave su{" "}
              <span className="text-accent">{KEY_LINKS[provider]}</span>
            </p>
          )}
        </>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          className="rounded-full bg-text-primary px-4 py-2 text-[12px] font-medium text-void disabled:opacity-50"
        >
          {saving ? "Salvataggio…" : "Salva"}
        </button>
        {provider !== "none" && (
          <button
            type="button"
            onClick={() => void test()}
            disabled={testing || !apiKey}
            className="inline-flex items-center gap-2 rounded-full border border-white/10 px-4 py-2 text-[12px] text-text-primary hover:bg-white/[0.04] disabled:opacity-50"
          >
            {testing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <CheckCircle2 className="h-3.5 w-3.5" />
            )}
            Verifica chiave
          </button>
        )}
      </div>

      {message && (
        <p
          className={`text-[12px] ${
            message.kind === "ok" ? "text-mint" : "text-warm"
          }`}
        >
          {message.text}
        </p>
      )}
    </div>
  );
}
