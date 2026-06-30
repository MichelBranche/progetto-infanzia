import { useCallback, useEffect, useState } from "react";
import { Loader2, Plus, Trash2, Wifi } from "lucide-react";
import {
  CINEMETA_MANIFEST,
  installAddon,
  listAllAddons,
  removeAddon,
  setAddonEnabled,
} from "../lib/addonsApi";
import { useAddons } from "../context/AddonsContext";
import type { InstalledAddon } from "../types/stremio";

interface AddonManagerPanelProps {
  parentProfileId: string;
}

export function AddonManagerPanel({ parentProfileId }: AddonManagerPanelProps) {
  const { refreshAddons } = useAddons();
  const [addons, setAddons] = useState<InstalledAddon[]>([]);
  const [manifestUrl, setManifestUrl] = useState(CINEMETA_MANIFEST);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listAllAddons(parentProfileId);
      setAddons(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [parentProfileId]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleInstall = async () => {
    const url = manifestUrl.trim();
    if (!url) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const addon = await installAddon(parentProfileId, url);
      setMessage(`Addon «${addon.name}» installato`);
      await load();
      await refreshAddons();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = async (id: string) => {
    setBusy(true);
    setError(null);
    try {
      await removeAddon(parentProfileId, id);
      await load();
      await refreshAddons();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const handleToggle = async (addon: InstalledAddon) => {
    setBusy(true);
    try {
      await setAddonEnabled(parentProfileId, addon.id, !addon.enabled);
      await load();
      await refreshAddons();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-4 space-y-4">
      <p className="text-[13px] text-text-muted">
        Collega addon Stremio per cataloghi e streaming remoto. I bambini vedono
        solo gli addon che autorizzi sotto «Limiti profili bambino».
      </p>

      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          value={manifestUrl}
          onChange={(e) => setManifestUrl(e.target.value)}
          placeholder="https://…/manifest.json"
          disabled={busy}
          className="flex-1 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2.5 text-[13px] outline-none focus:border-accent/30"
        />
        <button
          type="button"
          disabled={busy}
          onClick={() => void handleInstall()}
          className="inline-flex items-center justify-center gap-2 rounded-full bg-text-primary px-4 py-2.5 text-[12px] font-medium text-void disabled:opacity-50"
        >
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Plus className="h-4 w-4" />
          )}
          Aggiungi addon
        </button>
      </div>

      {message && <p className="text-[12px] text-emerald-400/90">{message}</p>}
      {error && <p className="text-[12px] text-red-400/90">{error}</p>}

      {loading ? (
        <Loader2 className="h-5 w-5 animate-spin text-text-muted" />
      ) : addons.length === 0 ? (
        <p className="text-[13px] text-text-muted">
          Nessun addon. Inizia con Cinemeta (metadati) e aggiungi un addon stream
          separato se ne hai uno legale.
        </p>
      ) : (
        <ul className="space-y-2">
          {addons.map((addon) => (
            <li
              key={addon.id}
              className="flex items-start gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3"
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent/10">
                <Wifi className="h-4 w-4 text-accent" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[14px] font-medium text-text-primary">
                    {addon.name}
                  </span>
                  <span className="text-[11px] text-text-muted">v{addon.version}</span>
                  {!addon.enabled && (
                    <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-text-muted">
                      disattivato
                    </span>
                  )}
                </div>
                <p className="mt-0.5 line-clamp-2 text-[12px] text-text-muted">
                  {addon.description || addon.addonId}
                </p>
                <p className="mt-1 text-[11px] text-text-muted/80">
                  {addon.resources.join(", ") || "nessuna risorsa"}
                  {addon.catalogs.length > 0 &&
                    ` · ${addon.catalogs.length} cataloghi`}
                </p>
              </div>
              <div className="flex shrink-0 flex-col gap-1">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void handleToggle(addon)}
                  className="rounded-lg border border-white/[0.08] px-2 py-1 text-[11px] text-text-muted hover:text-text-primary"
                >
                  {addon.enabled ? "Disattiva" : "Attiva"}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void handleRemove(addon.id)}
                  className="inline-flex items-center justify-center gap-1 rounded-lg border border-red-500/20 px-2 py-1 text-[11px] text-red-400/90"
                >
                  <Trash2 className="h-3 w-3" />
                  Rimuovi
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
