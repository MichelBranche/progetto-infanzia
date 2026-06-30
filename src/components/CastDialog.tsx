import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Cast, Loader2, RefreshCw, Tv, X, Wifi } from "lucide-react";
import {
  castMedia,
  castRemoteStream,
  discoverCastDevices,
  getLanHost,
  probeCastDevice,
} from "../lib/api";
import type { CastDevice } from "../types/media";

export interface RemoteCastTarget {
  proxyId: string;
  title: string;
  isHls: boolean;
  startSecs: number;
}

interface CastDialogProps {
  open: boolean;
  onClose: () => void;
  profileId: string;
  mediaId?: string;
  filePath?: string;
  remoteCast?: RemoteCastTarget;
  onCasting: (device: CastDevice) => void;
}

function needsTranscodeCast(filePath?: string) {
  if (!filePath) return false;
  return /\.(mkv|avi|webm|wmv|mov|m2ts|ts)$/i.test(filePath);
}

export function CastDialog({
  open,
  onClose,
  profileId,
  mediaId,
  filePath,
  remoteCast,
  onCasting,
}: CastDialogProps) {
  const [devices, setDevices] = useState<CastDevice[]>([]);
  const [loading, setLoading] = useState(false);
  const [probing, setProbing] = useState(false);
  const [castingId, setCastingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lanHost, setLanHost] = useState<string | null>(null);
  const [manualIp, setManualIp] = useState("");

  const runDiscovery = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [found, host] = await Promise.all([
        discoverCastDevices(),
        getLanHost(),
      ]);
      setDevices(found);
      setLanHost(host);
      if (found.length === 0) {
        setError(
          "Nessuna TV trovata automaticamente. Prova «Cerca di nuovo» o inserisci l'IP della TV (cavo Ethernet o Wi‑Fi, stessa rete del PC).",
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    void runDiscovery();
  }, [open, mediaId, runDiscovery]);

  const handleCast = async (device: CastDevice) => {
    setCastingId(device.id);
    setError(null);
    try {
      if (remoteCast) {
        await castRemoteStream(
          remoteCast.proxyId,
          remoteCast.title,
          device,
          remoteCast.startSecs,
          remoteCast.isHls,
        );
      } else if (mediaId) {
        await castMedia(profileId, mediaId, device);
      } else {
        throw new Error("Nessun contenuto da trasmettere");
      }
      onCasting(device);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setCastingId(null);
    }
  };

  const handleManualProbe = async () => {
    const host = manualIp.trim();
    if (!host) return;
    setProbing(true);
    setError(null);
    try {
      const device = await probeCastDevice(host);
      setDevices((current) => {
        if (current.some((d) => d.id === device.id)) return current;
        return [...current, device].sort((a, b) => a.name.localeCompare(b.name));
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setProbing(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, y: 12, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        className="w-full max-w-md rounded-2xl border border-white/10 bg-surface p-6 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-accent">
              <Cast className="h-4 w-4" />
              <span className="text-[11px] font-medium uppercase tracking-[0.2em]">
                Trasmetti alla TV
              </span>
            </div>
            <h2 className="font-display mt-2 text-xl font-semibold text-text-primary">
              Dispositivi in rete
            </h2>
            {needsTranscodeCast(filePath) && (
              <p className="mt-2 text-[12px] text-mint">
                Questo file verrà transcodificato in MP4 per la TV (richiede FFmpeg nel PATH).
              </p>
            )}
            {remoteCast?.isHls && (
              <p className="mt-2 text-[12px] text-mint">
                Lo stream verrà convertito in MP4 per la TV (richiede FFmpeg nel PATH).
              </p>
            )}
            {lanHost && (
              <p className="mt-1 flex items-center gap-1.5 text-[12px] text-text-muted">
                <Wifi className="h-3.5 w-3.5" />
                PC su {lanHost} · cerca anche via cavo Ethernet
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full text-text-muted hover:bg-white/5 hover:text-text-primary"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={() => void runDiscovery()}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-full border border-white/10 px-3 py-1.5 text-[11px] text-text-secondary transition-colors hover:border-white/20 hover:text-text-primary disabled:opacity-50"
          >
            <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
            Cerca di nuovo
          </button>
        </div>

        <div className="mt-3">
          {loading && (
            <div className="flex items-center justify-center gap-2 py-8 text-[13px] text-text-secondary">
              <Loader2 className="h-4 w-4 animate-spin" />
              Ricerca TV sulla rete (fino a 7 secondi)...
            </div>
          )}

          {!loading && devices.length > 0 && (
            <ul className="space-y-2">
              {devices.map((device) => (
                <li key={device.id}>
                  <button
                    type="button"
                    disabled={castingId !== null}
                    onClick={() => void handleCast(device)}
                    className="flex w-full items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.03] px-4 py-3 text-left transition-colors hover:border-accent/25 hover:bg-white/[0.05] disabled:opacity-50"
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent">
                      {castingId === device.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Tv className="h-4 w-4" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="title-clip text-[14px] font-medium text-text-primary">
                        {device.name}
                      </p>
                      <p className="text-[11px] text-text-muted">
                        {castingId === device.id &&
                        (needsTranscodeCast(filePath) || remoteCast?.isHls)
                          ? "Transcodifica in corso…"
                          : "DLNA · Smart TV"}
                      </p>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {error && (
            <p className="rounded-lg border border-warm/20 bg-warm/10 px-3 py-2.5 text-[13px] leading-relaxed text-warm">
              {error}
            </p>
          )}
        </div>

        <div className="mt-5 border-t border-white/[0.06] pt-4">
          <p className="text-[11px] font-medium uppercase tracking-[0.15em] text-text-muted">
            IP manuale della TV
          </p>
          <p className="mt-1 text-[11px] text-text-muted">
            Nelle impostazioni TV → Rete trovi l&apos;indirizzo IP (es. 192.168.1.45).
          </p>
          <div className="mt-2 flex gap-2">
            <input
              value={manualIp}
              onChange={(e) => setManualIp(e.target.value)}
              placeholder="192.168.1.45"
              className="min-w-0 flex-1 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-[13px] text-text-primary outline-none focus:border-accent/30"
            />
            <button
              type="button"
              onClick={() => void handleManualProbe()}
              disabled={probing || !manualIp.trim()}
              className="shrink-0 rounded-lg bg-white/[0.08] px-3 py-2 text-[12px] font-medium text-text-primary transition-colors hover:bg-white/[0.12] disabled:opacity-50"
            >
              {probing ? "..." : "Aggiungi"}
            </button>
          </div>
        </div>

        <p className="mt-4 text-[11px] leading-relaxed text-text-muted">
          PC e TV sulla stessa rete (Wi‑Fi o cavo). Su Windows consenti Branchefy
          sul firewall per reti private (porta 17890). Attiva DLNA sulla TV.
          I file MP4 partono più facilmente; MKV non è supportato da tutte le TV.
        </p>
      </motion.div>
    </div>
  );
}
