import { useCallback, useEffect, useMemo, useState } from "react";
import {
  GripVertical,
  Loader2,
  Save,
  Search,
  Trash2,
} from "lucide-react";
import { fetchScCatalog } from "../../lib/addonsApi";
import {
  fetchDevBranchefyTopPreview,
  fetchDevHomeTop10Config,
  saveDevHomeTop10Config,
} from "../../lib/homeTop10Api";
import type { HomeTop10Mode } from "../../types/homeTop10";
import type { StremioMetaPreview } from "../../types/stremio";
import {
  SettingsButton,
  SettingsPill,
} from "../settings/SettingsUi";
import {
  DevErrorBanner,
  DevInfoBanner,
  DevLoadingState,
} from "./DevConsoleUi";
import { SETTINGS_CARD } from "../settings/SettingsUi";

const MODE_OPTIONS: Array<{ id: HomeTop10Mode; label: string; hint: string }> = [
  {
    id: "sc",
    label: "Streaming Community",
    hint: "Come oggi: Top 10 dal catalogo SC (trending / più visti).",
  },
  {
    id: "branchefy",
    label: "Più visti Branchefy",
    hint: "I 10 titoli più guardati dagli utenti cloud di Branchefy.",
  },
  {
    id: "manual",
    label: "Selezione manuale",
    hint: "Scegli fino a 10 titoli: tutti gli utenti vedono questa lista.",
  },
];

function previewKey(item: StremioMetaPreview): string {
  return `${item.type}:${item.id}`;
}

export function DevTop10Panel() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [mode, setMode] = useState<HomeTop10Mode>("sc");
  const [manualItems, setManualItems] = useState<StremioMetaPreview[]>([]);
  const [branchefyPreview, setBranchefyPreview] = useState<StremioMetaPreview[]>([]);
  const [catalog, setCatalog] = useState<StremioMetaPreview[]>([]);
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [cfg, sc, branchefy] = await Promise.all([
        fetchDevHomeTop10Config(),
        fetchScCatalog().catch(() => null),
        fetchDevBranchefyTopPreview().catch(() => []),
      ]);
      setMode(cfg.mode);
      setManualItems(cfg.items);
      setBranchefyPreview(branchefy);

      const pool: StremioMetaPreview[] = [];
      const seen = new Set<string>();
      const push = (item: StremioMetaPreview) => {
        const key = previewKey(item);
        if (seen.has(key) || !item.id) return;
        seen.add(key);
        pool.push(item);
      };
      if (sc?.index) {
        for (const item of sc.index) push(item);
      }
      if (sc?.rows) {
        for (const row of sc.rows) {
          for (const item of row.items) push(item);
        }
      }
      for (const item of branchefy) push(item);
      for (const item of cfg.items) push(item);
      setCatalog(pool);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const searchHits = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return catalog.slice(0, 24);
    return catalog
      .filter((item) => item.name.toLowerCase().includes(q))
      .slice(0, 24);
  }, [catalog, query]);

  const addItem = (item: StremioMetaPreview) => {
    setManualItems((prev) => {
      if (prev.length >= 10) return prev;
      if (prev.some((x) => previewKey(x) === previewKey(item))) return prev;
      return [...prev, item];
    });
    setMessage(null);
  };

  const removeAt = (index: number) => {
    setManualItems((prev) => prev.filter((_, i) => i !== index));
  };

  const move = (index: number, dir: -1 | 1) => {
    setManualItems((prev) => {
      const next = [...prev];
      const target = index + dir;
      if (target < 0 || target >= next.length) return prev;
      const tmp = next[index];
      next[index] = next[target];
      next[target] = tmp;
      return next;
    });
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      if (mode === "manual" && manualItems.length === 0) {
        throw new Error("Aggiungi almeno un titolo per la selezione manuale.");
      }
      await saveDevHomeTop10Config({ mode, items: manualItems });
      setMessage("Top 10 salvata. Tutti gli utenti la vedranno entro circa un minuto.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <DevLoadingState />;

  return (
    <div className="space-y-4">
      {error && <DevErrorBanner message={error} />}
      {message && (
        <div className="rounded-2xl border border-mint/25 bg-mint/10 px-4 py-3 text-[13px] text-mint">
          {message}
        </div>
      )}

      <DevInfoBanner>
        La Home usa questa configurazione per la riga Top 10. In modalità Streaming
        Community resta il comportamento attuale del catalogo SC.
      </DevInfoBanner>

      <section className={`${SETTINGS_CARD} p-5 sm:p-6`}>
        <h3 className="font-display text-[16px] font-semibold tracking-[-0.02em] text-text-primary">
          Sorgente Top 10
        </h3>
        <div className="mt-4 flex flex-wrap gap-2">
          {MODE_OPTIONS.map((opt) => (
            <SettingsPill
              key={opt.id}
              active={mode === opt.id}
              onClick={() => setMode(opt.id)}
            >
              {opt.label}
            </SettingsPill>
          ))}
        </div>
        <p className="mt-3 text-[13px] text-text-muted">
          {MODE_OPTIONS.find((o) => o.id === mode)?.hint}
        </p>
      </section>

      {mode === "branchefy" && (
        <section className={`${SETTINGS_CARD} p-5 sm:p-6`}>
          <h3 className="font-display text-[16px] font-semibold tracking-[-0.02em] text-text-primary">
            Anteprima più visti Branchefy
          </h3>
          <p className="mt-1 mb-4 text-[12px] text-text-muted">
            Aggregato da progresso streaming cloud (utenti distinti + tempo).
          </p>
          {branchefyPreview.length === 0 ? (
            <p className="text-[13px] text-text-muted">
              Nessun dato di visione ancora. Appena gli utenti guardano titoli, compariranno qui.
            </p>
          ) : (
            <ol className="space-y-2">
              {branchefyPreview.map((item, index) => (
                <li
                  key={previewKey(item)}
                  className="flex items-center gap-3 rounded-2xl border border-border bg-fill-muted px-3 py-2"
                >
                  <span className="w-6 text-center font-display text-[14px] font-bold text-text-muted">
                    {index + 1}
                  </span>
                  {item.poster ? (
                    <img
                      src={item.poster}
                      alt=""
                      className="h-12 w-8 rounded object-cover"
                      draggable={false}
                    />
                  ) : (
                    <div className="h-12 w-8 rounded bg-fill-strong" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium text-text-primary">
                      {item.name}
                    </p>
                    <p className="text-[11px] text-text-muted">
                      {(item as { viewers?: number }).viewers ?? 0} utenti ·{" "}
                      {item.type}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </section>
      )}

      {mode === "manual" && (
        <>
          <section className={`${SETTINGS_CARD} p-5 sm:p-6`}>
            <div className="mb-3 flex items-center justify-between gap-3">
              <h3 className="font-display text-[16px] font-semibold tracking-[-0.02em] text-text-primary">
                Lista manuale ({manualItems.length}/10)
              </h3>
            </div>
            {manualItems.length === 0 ? (
              <p className="text-[13px] text-text-muted">
                Nessun titolo. Cerca sotto e aggiungi fino a 10 voci.
              </p>
            ) : (
              <ol className="space-y-2">
                {manualItems.map((item, index) => (
                  <li
                    key={previewKey(item)}
                    className="flex items-center gap-2 rounded-2xl border border-border bg-fill-muted px-2 py-2"
                  >
                    <GripVertical className="h-4 w-4 shrink-0 text-text-muted" />
                    <span className="w-5 text-center text-[12px] font-semibold text-text-muted">
                      {index + 1}
                    </span>
                    {item.poster ? (
                      <img
                        src={item.poster}
                        alt=""
                        className="h-12 w-8 rounded object-cover"
                        draggable={false}
                      />
                    ) : (
                      <div className="h-12 w-8 rounded bg-fill-strong" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-medium text-text-primary">
                        {item.name}
                      </p>
                      <p className="text-[11px] text-text-muted">{item.type}</p>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <button
                        type="button"
                        className="rounded-full px-2 py-1 text-[11px] text-text-muted hover:bg-fill"
                        onClick={() => move(index, -1)}
                        disabled={index === 0}
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        className="rounded-full px-2 py-1 text-[11px] text-text-muted hover:bg-fill"
                        onClick={() => move(index, 1)}
                        disabled={index === manualItems.length - 1}
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        className="rounded-full p-2 text-warm hover:bg-warm/10"
                        onClick={() => removeAt(index)}
                        aria-label="Rimuovi"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </section>

          <section className={`${SETTINGS_CARD} p-5 sm:p-6`}>
            <h3 className="font-display text-[16px] font-semibold tracking-[-0.02em] text-text-primary">
              Aggiungi dal catalogo
            </h3>
            <div className="relative mt-3">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Cerca titolo…"
                className="w-full rounded-2xl border border-border bg-fill py-3 pl-10 pr-4 text-[14px] text-text-primary outline-none placeholder:text-text-muted/70 focus:border-border-hover"
              />
            </div>
            <ul className="mt-3 max-h-[min(40vh,360px)] space-y-1 overflow-y-auto">
              {searchHits.map((item) => {
                const already = manualItems.some(
                  (x) => previewKey(x) === previewKey(item),
                );
                return (
                  <li key={previewKey(item)}>
                    <button
                      type="button"
                      disabled={already || manualItems.length >= 10}
                      onClick={() => addItem(item)}
                      className="flex w-full items-center gap-3 rounded-2xl px-2 py-2 text-left transition-colors hover:bg-fill disabled:opacity-40"
                    >
                      {item.poster ? (
                        <img
                          src={item.poster}
                          alt=""
                          className="h-10 w-7 rounded object-cover"
                          draggable={false}
                        />
                      ) : (
                        <div className="h-10 w-7 rounded bg-fill-strong" />
                      )}
                      <span className="min-w-0 flex-1 truncate text-[13px] text-text-primary">
                        {item.name}
                      </span>
                      <span className="text-[11px] text-text-muted">
                        {already ? "In lista" : "Aggiungi"}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        </>
      )}

      <div className="flex justify-end">
        <SettingsButton variant="primary" onClick={() => void save()} disabled={saving}>
          {saving ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Save className="h-3.5 w-3.5" />
          )}
          Salva Top 10
        </SettingsButton>
      </div>
    </div>
  );
}
