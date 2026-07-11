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
import {
  SettingsAlert,
  SettingsButton,
  SettingsEmpty,
  SettingsInput,
  SettingsListItem,
} from "./settings/SettingsUi";

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
    <div className="space-y-4">
      <p className="text-[13px] leading-relaxed text-text-muted">
        Collega addon Stremio per cataloghi e streaming remoto. I bambini vedono
        solo gli addon che autorizzi sotto «Limiti profili bambino».
      </p>

      <div className="flex flex-col gap-2 sm:flex-row">
        <SettingsInput
          value={manifestUrl}
          onChange={(e) => setManifestUrl(e.target.value)}
          placeholder="https://…/manifest.json"
          disabled={busy}
          className="flex-1"
        />
        <SettingsButton
          variant="primary"
          disabled={busy}
          onClick={() => void handleInstall()}
          className="shrink-0"
        >
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Plus className="h-4 w-4" />
          )}
          Aggiungi addon
        </SettingsButton>
      </div>

      {message && <SettingsAlert variant="success">{message}</SettingsAlert>}
      {error && <SettingsAlert>{error}</SettingsAlert>}

      {loading ? (
        <div className="flex justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-text-muted" />
        </div>
      ) : addons.length === 0 ? (
        <SettingsEmpty>
          Nessun addon. Inizia con Cinemeta (metadati) e aggiungi un addon stream
          separato se ne hai uno legale.
        </SettingsEmpty>
      ) : (
        <ul className="space-y-2">
          {addons.map((addon) => (
            <SettingsListItem
              key={addon.id}
              icon={Wifi}
              title={addon.name}
              meta={
                <>
                  <span className="text-[11px] text-text-muted">v{addon.version}</span>
                  {!addon.enabled && (
                    <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[10px] text-text-muted">
                      disattivato
                    </span>
                  )}
                </>
              }
              description={addon.description || addon.addonId}
              footer={`${addon.resources.join(", ") || "nessuna risorsa"}${
                addon.catalogs.length > 0 ? ` · ${addon.catalogs.length} cataloghi` : ""
              }`}
              actions={
                <>
                  <SettingsButton
                    variant="secondary"
                    disabled={busy}
                    onClick={() => void handleToggle(addon)}
                    className="px-2.5 py-1.5 text-[11px]"
                  >
                    {addon.enabled ? "Disattiva" : "Attiva"}
                  </SettingsButton>
                  <SettingsButton
                    variant="danger"
                    disabled={busy}
                    onClick={() => void handleRemove(addon.id)}
                    className="px-2.5 py-1.5 text-[11px]"
                  >
                    <Trash2 className="h-3 w-3" />
                    Rimuovi
                  </SettingsButton>
                </>
              }
            />
          ))}
        </ul>
      )}
    </div>
  );
}
