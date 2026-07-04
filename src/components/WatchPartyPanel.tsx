import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Copy,
  Loader2,
  LogOut,
  Radio,
  Users,
  Wifi,
  X,
} from "lucide-react";
import { useCloudAccount } from "../context/CloudAccountContext";
import { isCloudEnabled } from "../lib/cloudConfig";
import { createCloudWatchParty, joinCloudWatchParty } from "../lib/cloudWatchParty";
import { isPrivateOrLanHost } from "../lib/watchPartyNetwork";
import {
  createWatchParty,
  watchPartyContentFromPlayer,
} from "../lib/watchPartyApi";
import type {
  WatchPartyMember,
  WatchPartySession,
} from "../types/watchParty";

type PanelTab = "create" | "join";

interface WatchPartyPanelProps {
  open: boolean;
  onClose: () => void;
  profileId: string;
  profileName: string;
  defaultTab?: PanelTab;
  mediaId?: string;
  title?: string;
  streamUrl?: string;
  isHls?: boolean;
  posterUrl?: string;
  remotePlayback?: boolean;
  session?: WatchPartySession | null;
  partyMembers?: WatchPartyMember[];
  partyConnected?: boolean;
  partyError?: string | null;
  onLeaveParty?: () => void;
  onSessionReady: (session: WatchPartySession) => void;
}

export function WatchPartyPanel({
  open,
  onClose,
  profileId,
  profileName,
  defaultTab = "create",
  mediaId,
  title,
  streamUrl,
  isHls = false,
  posterUrl,
  remotePlayback,
  session,
  partyMembers = [],
  partyConnected = false,
  partyError = null,
  onLeaveParty,
  onSessionReady,
}: WatchPartyPanelProps) {
  const { profile: cloudProfile } = useCloudAccount();
  const cloudConfigured = isCloudEnabled();
  const canCreate = Boolean(mediaId && title && streamUrl);
  const [tab, setTab] = useState<PanelTab>(
    canCreate ? defaultTab : "join",
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [roomCode, setRoomCode] = useState("");
  const [hostIp, setHostIp] = useState("");
  const [joinRelay, setJoinRelay] = useState<"lan" | "cloud">(
    cloudProfile ? "cloud" : "lan",
  );
  const [useCloudRelay, setUseCloudRelay] = useState(Boolean(cloudProfile));
  const [createdRoom, setCreatedRoom] = useState<WatchPartySession | null>(null);

  const activeSession = session ?? createdRoom;

  useEffect(() => {
    if (!open) {
      setError(null);
      setRoomCode("");
      setHostIp("");
      if (!session) setCreatedRoom(null);
      return;
    }
    setTab(canCreate ? defaultTab : "join");
  }, [open, defaultTab, canCreate, session]);

  useEffect(() => {
    if (cloudProfile) {
      setUseCloudRelay(true);
      setJoinRelay("cloud");
    }
  }, [cloudProfile]);

  useEffect(() => {
    if (session) setCreatedRoom(null);
  }, [session]);

  const handleCreate = useCallback(async () => {
    if (!mediaId || !title || !streamUrl) {
      setError("Avvia prima la riproduzione del titolo");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const content = watchPartyContentFromPlayer(
        mediaId,
        title,
        streamUrl,
        isHls,
        posterUrl,
        remotePlayback,
      );

      if (useCloudRelay && cloudProfile) {
        const cloudContent =
          content.contentKind === "streaming"
            ? { ...content, streamUrl: "" }
            : content;
        const room = await createCloudWatchParty(
          cloudProfile.id,
          cloudProfile.displayName || profileName,
          cloudContent,
        );
        const nextSession: WatchPartySession = {
          role: "host",
          room: { ...room, hostProfileId: cloudProfile.id },
          relay: "cloud",
        };
        setCreatedRoom(nextSession);
        onSessionReady(nextSession);
        return;
      }

      const room = await createWatchParty(profileId, {
        profileName,
        mediaId: content.mediaId,
        title: content.title,
        streamUrl: content.streamUrl,
        isHls: content.isHls,
        posterUrl: content.posterUrl,
        contentKind: content.contentKind,
      });
      const nextSession: WatchPartySession = {
        role: "host",
        room,
        hostIp: room.hostIp,
        relay: "lan",
      };
      setCreatedRoom(nextSession);
      onSessionReady(nextSession);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [
    mediaId,
    title,
    streamUrl,
    isHls,
    posterUrl,
    remotePlayback,
    profileId,
    profileName,
    onSessionReady,
    useCloudRelay,
    cloudProfile,
  ]);

  const handleJoin = useCallback(async () => {
    const code = roomCode.trim().toUpperCase();
    if (code.length < 4) {
      setError("Inserisci il codice stanza");
      return;
    }

    // Con account cloud: prova sempre prima la stanza online (amici lontani).
    if (cloudProfile) {
      setLoading(true);
      setError(null);
      try {
        const room = await joinCloudWatchParty(code);
        if (room) {
          onSessionReady({ role: "guest", room, relay: "cloud" });
          onClose();
          return;
        }
        if (joinRelay === "cloud") {
          setError(
            "Stanza online non trovata. L'host deve creare la stanza con «Stanza online» attiva.",
          );
          return;
        }
      } catch (err) {
        if (joinRelay === "cloud") {
          setError(err instanceof Error ? err.message : String(err));
          return;
        }
      } finally {
        if (joinRelay === "cloud") {
          setLoading(false);
          return;
        }
        setLoading(false);
      }
    } else if (joinRelay === "cloud") {
      setError("Accedi al tuo account Branchefy per unirti online");
      return;
    }

    const host = hostIp.trim();
    if (!host) {
      setError(
        cloudConfigured
          ? "Per amici lontani: accedi al tuo account e usa modalità Online. In LAN serve l'IP dell'host."
          : "Inserisci l'IP dell'host (stessa rete Wi‑Fi)",
      );
      return;
    }
    if (!isPrivateOrLanHost(host)) {
      setError(
        "IP non locale: la modalità «Stessa rete» funziona solo in casa. Usa Online con account Branchefy.",
      );
      return;
    }

    setLoading(true);
    setError(null);
    try {
      onSessionReady({
        role: "guest",
        hostIp: host,
        relay: "lan",
        room: {
          code,
          hostProfileId: "",
          hostName: "Host",
          hostIp: host,
          content: {
            mediaId: `party:${code}`,
            title: "In attesa dell'host…",
            streamUrl: "",
            isHls: false,
            contentKind: "local",
          },
          playing: false,
          positionSecs: 0,
          members: [],
        },
      });
      onClose();
    } finally {
      setLoading(false);
    }
  }, [
    roomCode,
    hostIp,
    joinRelay,
    cloudProfile,
    cloudConfigured,
    onSessionReady,
    onClose,
  ]);

  const copyInvite = async (room: WatchPartySession) => {
    const { room: data } = room;
    const isCloud = room.relay === "cloud";
    const text = [
      `Guardiamo insieme: ${data.content.title}`,
      `Codice stanza: ${data.code}`,
      isCloud
        ? "Modalità: online (account Branchefy)"
        : data.hostIp
          ? `IP host: ${data.hostIp}`
          : null,
      "Apri Branchefy → Amici → Guarda insieme",
    ]
      .filter(Boolean)
      .join("\n");
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // ignore
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.button
            type="button"
            aria-label="Chiudi pannello"
            className="fixed inset-0 z-[58] bg-black/50 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
          />

          <motion.aside
            className="fixed inset-y-0 right-0 z-[60] flex w-full max-w-[380px] flex-col border-l border-white/[0.08] bg-[#0c0c10] shadow-2xl"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 320 }}
          >
            <div className="flex items-start justify-between gap-3 border-b border-white/[0.06] px-5 py-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/15">
                  <Users className="h-5 w-5 text-accent" />
                </div>
                <div>
                  <h2 className="text-[16px] font-semibold text-text-primary">
                    Guarda insieme
                  </h2>
                  <p className="text-[12px] text-text-muted">
                    Stanze LAN o online
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg p-2 text-text-muted transition-colors hover:bg-white/5 hover:text-text-primary"
                aria-label="Chiudi"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4">
              {activeSession && (
                <section className="mb-5 rounded-2xl border border-accent/25 bg-accent/5 p-4">
                  <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-accent">
                    <Radio className="h-3.5 w-3.5" />
                    {activeSession.relay === "cloud" ? "Stanza online" : "Stanza LAN"}
                  </div>
                  <p className="font-display mt-3 text-center text-3xl font-bold tracking-[0.22em] text-text-primary">
                    {activeSession.room.code}
                  </p>
                  <p className="mt-2 text-center text-[13px] text-text-secondary">
                    {activeSession.room.content.title}
                  </p>
                  <p className="mt-1 text-center text-[12px] text-text-muted">
                    {activeSession.role === "host" ? "Sei l'host" : "Sei ospite"}
                    {partyConnected
                      ? ` · ${partyMembers.length} in stanza`
                      : " · Connessione…"}
                  </p>
                  {activeSession.relay === "lan" && activeSession.room.hostIp && (
                    <p className="mt-2 text-center text-[12px] text-text-muted">
                      IP host:{" "}
                      <span className="text-text-secondary">
                        {activeSession.room.hostIp}
                      </span>
                    </p>
                  )}
                  {partyError && (
                    <p className="mt-3 rounded-lg border border-warm/20 bg-warm/10 px-3 py-2 text-[12px] text-warm">
                      {partyError}
                    </p>
                  )}
                  <div className="mt-4 flex flex-col gap-2">
                    {activeSession.role === "host" && (
                      <button
                        type="button"
                        onClick={() => void copyInvite(activeSession)}
                        className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 px-4 py-2.5 text-[13px] text-text-primary hover:bg-white/[0.04]"
                      >
                        <Copy className="h-4 w-4" />
                        Copia invito
                      </button>
                    )}
                    {onLeaveParty && (
                      <button
                        type="button"
                        onClick={() => onLeaveParty()}
                        className="flex w-full items-center justify-center gap-2 rounded-xl border border-warm/30 px-4 py-2.5 text-[13px] text-warm hover:bg-warm/10"
                      >
                        <LogOut className="h-4 w-4" />
                        Esci dalla stanza
                      </button>
                    )}
                  </div>
                </section>
              )}

              {!activeSession && (
                <>
                  <div className="mb-4 flex gap-2 rounded-full bg-white/[0.04] p-1">
                    {canCreate && (
                      <button
                        type="button"
                        onClick={() => setTab("create")}
                        className={`flex-1 rounded-full px-3 py-2 text-[12px] font-medium transition-colors ${
                          tab === "create"
                            ? "bg-white text-black"
                            : "text-text-muted hover:text-text-primary"
                        }`}
                      >
                        Crea stanza
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setTab("join")}
                      className={`flex-1 rounded-full px-3 py-2 text-[12px] font-medium transition-colors ${
                        tab === "join"
                          ? "bg-white text-black"
                          : "text-text-muted hover:text-text-primary"
                      }`}
                    >
                      Unisciti
                    </button>
                  </div>

                  {error && (
                    <p className="mb-4 rounded-xl border border-warm/20 bg-warm/10 px-3 py-2 text-[12px] text-warm">
                      {error}
                    </p>
                  )}

                  {tab === "create" && canCreate && (
                    <div className="space-y-4">
                      <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
                        <p className="text-[11px] uppercase tracking-[0.12em] text-text-muted">
                          Stai condividendo
                        </p>
                        <p className="mt-1 text-[15px] font-medium text-text-primary">
                          {title}
                        </p>
                      </div>

                      {cloudProfile && (
                        <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-accent/25 bg-accent/5 px-3 py-3">
                          <input
                            type="checkbox"
                            checked={useCloudRelay}
                            onChange={(e) => setUseCloudRelay(e.target.checked)}
                            className="mt-0.5 h-4 w-4 accent-accent"
                          />
                          <span>
                            <span className="block text-[13px] font-medium text-text-primary">
                              Stanza online (consigliata)
                            </span>
                            <span className="mt-0.5 block text-[12px] text-text-muted">
                              Per amici su reti diverse: entrambi con account
                              Branchefy. Sync play/pause; ognuno carica il
                              proprio stream (streaming consigliato).
                            </span>
                          </span>
                        </label>
                      )}

                      {cloudProfile && !useCloudRelay && (
                        <p className="rounded-xl border border-warm/20 bg-warm/10 px-3 py-2 text-[12px] text-warm">
                          Senza «Stanza online» gli amici lontani non potranno
                          connettersi — serve la stessa rete Wi‑Fi.
                        </p>
                      )}

                      {!cloudProfile && cloudConfigured && (
                        <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-3 text-[12px] text-text-muted">
                          <p>
                            Per guardare con amici lontani, accedi al tuo account
                            Branchefy in Profilo → Account online.
                          </p>
                        </div>
                      )}

                      {!cloudConfigured && (
                        <div className="flex items-start gap-2 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-3 text-[12px] text-text-muted">
                          <Wifi className="mt-0.5 h-4 w-4 shrink-0" />
                          La stanza sarà in LAN: gli ospiti devono essere sulla
                          stessa rete Wi‑Fi.
                        </div>
                      )}

                      <button
                        type="button"
                        disabled={loading}
                        onClick={() => void handleCreate()}
                        className="flex w-full items-center justify-center gap-2 rounded-xl bg-white px-4 py-3 text-[14px] font-semibold text-black disabled:opacity-60"
                      >
                        {loading ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Users className="h-4 w-4" />
                        )}
                        Crea stanza
                      </button>
                    </div>
                  )}

                  {tab === "join" && (
                    <div className="space-y-4">
                      {cloudProfile && (
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => setJoinRelay("cloud")}
                            className={`flex flex-1 items-center justify-center gap-1.5 rounded-full px-3 py-2 text-[12px] ${
                              joinRelay === "cloud"
                                ? "bg-white text-black"
                                : "border border-white/10 text-text-muted"
                            }`}
                          >
                            <Radio className="h-3.5 w-3.5" />
                            Online
                          </button>
                          <button
                            type="button"
                            onClick={() => setJoinRelay("lan")}
                            className={`flex flex-1 items-center justify-center gap-1.5 rounded-full px-3 py-2 text-[12px] ${
                              joinRelay === "lan"
                                ? "bg-white text-black"
                                : "border border-white/10 text-text-muted"
                            }`}
                          >
                            <Wifi className="h-3.5 w-3.5" />
                            Stessa rete
                          </button>
                        </div>
                      )}

                      <label className="block">
                        <span className="mb-1.5 block text-[12px] text-text-muted">
                          Codice stanza
                        </span>
                        <input
                          value={roomCode}
                          onChange={(e) =>
                            setRoomCode(e.target.value.toUpperCase())
                          }
                          placeholder="Es. AB12CD"
                          className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-3 text-[15px] uppercase tracking-[0.2em] outline-none focus:border-accent/30"
                        />
                      </label>

                      {joinRelay === "lan" && (
                        <label className="block">
                          <span className="mb-1.5 block text-[12px] text-text-muted">
                            IP dell&apos;host (solo stessa rete)
                          </span>
                          <input
                            value={hostIp}
                            onChange={(e) => setHostIp(e.target.value)}
                            placeholder="Es. 192.168.1.42"
                            className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-3 text-[14px] outline-none focus:border-accent/30"
                          />
                        </label>
                      )}

                      {cloudProfile && joinRelay === "cloud" && (
                        <p className="text-[12px] leading-relaxed text-text-muted">
                          Non serve l&apos;IP dell&apos;host: inserisci solo il
                          codice stanza. Assicurati che l&apos;host abbia creato
                          una stanza con «Stanza online» attiva.
                        </p>
                      )}

                      <button
                        type="button"
                        disabled={loading}
                        onClick={() => void handleJoin()}
                        className="flex w-full items-center justify-center gap-2 rounded-xl bg-white px-4 py-3 text-[14px] font-semibold text-black disabled:opacity-60"
                      >
                        {loading ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          "Entra nella stanza"
                        )}
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
