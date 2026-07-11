import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Copy,
  Check,
  Loader2,
  LogOut,
  MessageSquare,
  Radio,
  Users,
  Wifi,
  X,
} from "lucide-react";
import { useCloudAccount } from "../context/CloudAccountContext";
import { isCloudEnabled } from "../lib/cloudConfig";
import { isLanFeaturesEnabled } from "../lib/platform";
import { ensureWatchPartyChat } from "../lib/cloudChat";
import { createCloudWatchParty, joinCloudWatchParty } from "../lib/cloudWatchParty";
import { useWatchPartyChat } from "../hooks/useWatchPartyChat";
import { isPrivateOrLanHost } from "../lib/watchPartyNetwork";
import {
  createWatchParty,
  watchPartyContentFromPlayer,
} from "../lib/watchPartyApi";
import type {
  WatchPartyMember,
  WatchPartySession,
} from "../types/watchParty";
import { ChatPanel } from "./chat/ChatPanel";
import { WatchPartyFriendInviteList } from "./WatchPartyFriendInviteList";

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
  const lanEnabled = isLanFeaturesEnabled();
  const canCreate = Boolean(mediaId && title && streamUrl);
  const [tab, setTab] = useState<PanelTab>(
    canCreate ? defaultTab : "join",
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [roomCode, setRoomCode] = useState("");
  const [hostIp, setHostIp] = useState("");
  const [copied, setCopied] = useState(false);
  const [joinRelay, setJoinRelay] = useState<"lan" | "cloud">(
    cloudProfile ? "cloud" : lanEnabled ? "lan" : "cloud",
  );
  const [useCloudRelay, setUseCloudRelay] = useState(Boolean(cloudProfile) || !lanEnabled);
  const [createdRoom, setCreatedRoom] = useState<WatchPartySession | null>(null);

  const activeSession = session ?? createdRoom;
  const { conversationId: partyChatId, error: partyChatError } = useWatchPartyChat(
    activeSession?.relay === "cloud" ? activeSession : null,
    cloudProfile?.id,
  );

  useEffect(() => {
    if (!open) {
      setError(null);
      setRoomCode("");
      setHostIp("");
      setCopied(false);
      if (!session) setCreatedRoom(null);
      return;
    }
    setTab(canCreate ? defaultTab : "join");
  }, [open, defaultTab, canCreate, session]);

  useEffect(() => {
    if (cloudProfile || !lanEnabled) {
      setUseCloudRelay(true);
      setJoinRelay("cloud");
    }
  }, [cloudProfile, lanEnabled]);

  useEffect(() => {
    if (session) setCreatedRoom(null);
  }, [session]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

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

      if (!lanEnabled) {
        setError(
          cloudProfile
            ? "Su mobile usa solo stanze online."
            : "Accedi al tuo account Branchefy per guardare insieme su mobile.",
        );
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
    lanEnabled,
  ]);

  const handleJoin = useCallback(async () => {
    const code = roomCode.trim().toUpperCase();
    if (code.length < 4) {
      setError("Inserisci il codice stanza");
      return;
    }

    // Modalità online: solo stanze cloud, comportamento prevedibile.
    if (joinRelay === "cloud") {
      if (!cloudProfile) {
        setError("Accedi al tuo account Branchefy per unirti online");
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const room = await joinCloudWatchParty(code);
        if (!room) {
          setError(
            "Stanza online non trovata. L'host deve creare la stanza con «Stanza online» attiva.",
          );
          return;
        }
        try {
          await ensureWatchPartyChat(room.code);
        } catch {
          // join ok anche se la chat non parte subito
        }
        onSessionReady({ role: "guest", room, relay: "cloud" });
        onClose();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
      return;
    }

    // Modalità stessa rete (LAN).
    if (!lanEnabled) {
      setError("Le stanze LAN non sono disponibili su mobile. Usa modalità Online.");
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
  }, [
    roomCode,
    hostIp,
    joinRelay,
    cloudProfile,
    cloudConfigured,
    onSessionReady,
    onClose,
    lanEnabled,
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
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // ignore
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex items-end justify-center bg-black/65 backdrop-blur-md sm:items-center sm:p-6"
          onClick={onClose}
        >
          <motion.div
            role="dialog"
            aria-labelledby="watch-party-title"
            initial={{ opacity: 0, y: 28, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.98 }}
            transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
            onClick={(e) => e.stopPropagation()}
            className="watch-party-sheet relative flex max-h-[min(88vh,720px)] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0a0a0c] shadow-[0_32px_80px_rgba(0,0,0,0.65)] max-sm:max-w-none"
          >
            <div className="watch-party-sheet__handle" aria-hidden />
            <div className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-accent/20 via-accent/5 to-transparent" />
            <div className="noise-overlay pointer-events-none absolute inset-0 opacity-[0.08]" />

            <button
              type="button"
              onClick={onClose}
              className="absolute right-3 top-3 z-10 rounded-full border border-white/10 bg-black/30 p-2 text-text-muted backdrop-blur-sm transition-colors hover:border-white/20 hover:text-text-primary"
              aria-label="Chiudi"
            >
              <X className="h-4 w-4" />
            </button>

            <div className="relative px-6 pb-4 pt-6 sm:px-7 sm:pt-7">
              <div className="flex items-start gap-4 pr-8">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-accent/25 bg-accent/10 shadow-[0_0_32px_rgba(94,234,212,0.12)]">
                  <Users className="h-5 w-5 text-accent" />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.32em] text-accent">
                    Watch party
                  </p>
                  <h2
                    id="watch-party-title"
                    className="font-display mt-1.5 text-[clamp(1.5rem,3vw,1.85rem)] font-semibold leading-none tracking-[-0.03em] text-text-primary"
                  >
                    Guarda insieme
                  </h2>
                  <p className="mt-2 text-[12px] text-text-muted">
                    {lanEnabled
                      ? "Stanze online o sulla stessa rete Wi‑Fi"
                      : "Stanze online con account Branchefy"}
                  </p>
                </div>
              </div>
            </div>

            <div className="relative min-h-0 flex-1 overflow-y-auto px-6 pb-6 sm:px-7">
              {activeSession ? (
                <section>
                  <div className="rounded-xl border border-accent/20 bg-accent/[0.06] px-4 py-5">
                    <div className="flex items-center justify-center gap-2 text-[10px] font-semibold uppercase tracking-[0.28em] text-accent">
                      {activeSession.relay === "cloud" ? (
                        <Radio className="h-3.5 w-3.5" />
                      ) : (
                        <Wifi className="h-3.5 w-3.5" />
                      )}
                      {activeSession.relay === "cloud"
                        ? "Stanza online"
                        : "Stanza LAN"}
                    </div>
                    <p className="font-display mt-3 text-center text-4xl font-bold tracking-[0.24em] text-text-primary">
                      {activeSession.room.code}
                    </p>
                    <p className="mt-3 text-center text-[13px] text-text-secondary">
                      {activeSession.room.content.title}
                    </p>
                    <p className="mt-1.5 flex items-center justify-center gap-1.5 text-[12px] text-text-muted">
                      <span
                        className={`inline-block h-1.5 w-1.5 rounded-full ${
                          partyConnected ? "bg-mint" : "bg-warm animate-pulse"
                        }`}
                      />
                      {activeSession.role === "host" ? "Sei l'host" : "Sei ospite"}
                      {partyConnected
                        ? ` · ${partyMembers.length} in stanza`
                        : " · Connessione…"}
                    </p>
                    {activeSession.relay === "lan" && activeSession.room.hostIp && (
                      <p className="mt-2 text-center text-[12px] text-text-muted">
                        IP host:{" "}
                        <span className="tabular-nums text-text-secondary">
                          {activeSession.room.hostIp}
                        </span>
                      </p>
                    )}
                  </div>

                  {partyError && (
                    <p className="mt-4 rounded-xl border border-warm/25 bg-warm/10 px-3.5 py-3 text-[12px] leading-relaxed text-warm">
                      {partyError}
                    </p>
                  )}

                  {activeSession.relay === "cloud" && cloudProfile && partyChatId && (
                    <div className="mt-5">
                      <div className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.28em] text-text-muted">
                        <MessageSquare className="h-3.5 w-3.5" />
                        Chat stanza
                      </div>
                      <ChatPanel
                        conversationId={partyChatId}
                        currentUserId={cloudProfile.id}
                        compact
                        className="max-h-[min(36vh,280px)] sm:max-h-[240px]"
                      />
                    </div>
                  )}
                  {activeSession.relay === "cloud" &&
                    cloudProfile &&
                    !partyChatId &&
                    partyChatError && (
                      <p className="mt-4 text-[12px] text-warm">{partyChatError}</p>
                    )}

                  {activeSession.role === "host" && (
                    <WatchPartyFriendInviteList
                      profileId={profileId}
                      profileName={profileName}
                      active={open}
                    />
                  )}
                </section>
              ) : (
                <>
                  <div className="mb-4 flex gap-1 rounded-full border border-white/[0.06] bg-white/[0.03] p-1">
                    {canCreate && (
                      <button
                        type="button"
                        onClick={() => setTab("create")}
                        className={`flex-1 rounded-full px-3 py-2 text-[12px] font-medium transition-colors ${
                          tab === "create"
                            ? "bg-text-primary text-void"
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
                          ? "bg-text-primary text-void"
                          : "text-text-muted hover:text-text-primary"
                      }`}
                    >
                      Unisciti
                    </button>
                  </div>

                  {error && (
                    <p className="mb-4 rounded-xl border border-warm/25 bg-warm/10 px-3.5 py-3 text-[12px] leading-relaxed text-warm">
                      {error}
                    </p>
                  )}

                  {tab === "create" && canCreate && (
                    <div className="space-y-3">
                      <div className="rounded-xl border border-white/[0.04] bg-white/[0.02] px-4 py-3">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-text-muted">
                          Stai condividendo
                        </p>
                        <p className="mt-1.5 text-[14px] font-medium leading-snug text-text-primary">
                          {title}
                        </p>
                      </div>

                      {cloudProfile && (
                        <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-accent/20 bg-accent/[0.06] px-4 py-3">
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
                            <span className="mt-0.5 block text-[12px] leading-relaxed text-text-muted">
                              Per amici su reti diverse: entrambi con account
                              Branchefy. Sync play/pause; ognuno carica il
                              proprio stream.
                            </span>
                          </span>
                        </label>
                      )}

                      {cloudProfile && lanEnabled && !useCloudRelay && (
                        <p className="rounded-xl border border-warm/25 bg-warm/10 px-3.5 py-3 text-[12px] leading-relaxed text-warm">
                          Senza «Stanza online» gli amici lontani non potranno
                          connettersi — serve la stessa rete Wi‑Fi.
                        </p>
                      )}

                      {!cloudProfile && cloudConfigured && lanEnabled && (
                        <p className="rounded-xl border border-white/[0.04] bg-white/[0.02] px-4 py-3 text-[12px] leading-relaxed text-text-muted">
                          Per guardare con amici lontani, accedi al tuo account
                          Branchefy in Profilo → Account online.
                        </p>
                      )}

                      {!cloudConfigured && lanEnabled && (
                        <p className="flex items-start gap-2.5 rounded-xl border border-white/[0.04] bg-white/[0.02] px-4 py-3 text-[12px] leading-relaxed text-text-muted">
                          <Wifi className="mt-0.5 h-4 w-4 shrink-0" />
                          La stanza sarà in LAN: gli ospiti devono essere sulla
                          stessa rete Wi‑Fi.
                        </p>
                      )}
                    </div>
                  )}

                  {tab === "join" && (
                    <div className="space-y-3">
                      {cloudProfile && lanEnabled && (
                        <div className="flex gap-1 rounded-full border border-white/[0.06] bg-white/[0.03] p-1">
                          <button
                            type="button"
                            onClick={() => setJoinRelay("cloud")}
                            className={`flex flex-1 items-center justify-center gap-1.5 rounded-full px-3 py-2 text-[12px] font-medium transition-colors ${
                              joinRelay === "cloud"
                                ? "bg-text-primary text-void"
                                : "text-text-muted hover:text-text-primary"
                            }`}
                          >
                            <Radio className="h-3.5 w-3.5" />
                            Online
                          </button>
                          <button
                            type="button"
                            onClick={() => setJoinRelay("lan")}
                            className={`flex flex-1 items-center justify-center gap-1.5 rounded-full px-3 py-2 text-[12px] font-medium transition-colors ${
                              joinRelay === "lan"
                                ? "bg-text-primary text-void"
                                : "text-text-muted hover:text-text-primary"
                            }`}
                          >
                            <Wifi className="h-3.5 w-3.5" />
                            Stessa rete
                          </button>
                        </div>
                      )}

                      <label className="block">
                        <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.28em] text-text-muted">
                          Codice stanza
                        </span>
                        <input
                          value={roomCode}
                          onChange={(e) =>
                            setRoomCode(e.target.value.toUpperCase())
                          }
                          placeholder="ES. AB12CD"
                          className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 text-center font-display text-[18px] font-semibold uppercase tracking-[0.3em] text-text-primary outline-none transition-colors placeholder:text-text-muted/50 focus:border-accent/40"
                        />
                      </label>

                      {joinRelay === "lan" && lanEnabled && (
                        <label className="block">
                          <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.28em] text-text-muted">
                            IP dell&apos;host (stessa rete)
                          </span>
                          <input
                            value={hostIp}
                            onChange={(e) => setHostIp(e.target.value)}
                            placeholder="Es. 192.168.1.42"
                            className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 text-[14px] tabular-nums text-text-primary outline-none transition-colors placeholder:text-text-muted/50 focus:border-accent/40"
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
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="relative border-t border-white/[0.06] bg-black/30 px-4 py-4 sm:px-7">
              {activeSession ? (
                <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
                  {onLeaveParty && (
                    <button
                      type="button"
                      onClick={() => onLeaveParty()}
                      className="inline-flex items-center justify-center gap-2 rounded-full border border-warm/30 px-5 py-2.5 text-[12px] font-medium text-warm transition-colors hover:bg-warm/10"
                    >
                      <LogOut className="h-4 w-4" />
                      Esci dalla stanza
                    </button>
                  )}
                  {activeSession.role === "host" && (
                    <button
                      type="button"
                      onClick={() => void copyInvite(activeSession)}
                      className="inline-flex items-center justify-center gap-2 rounded-full bg-text-primary px-5 py-2.5 text-[12px] font-semibold text-void transition-transform hover:scale-[1.02] active:scale-[0.98]"
                    >
                      {copied ? (
                        <Check className="h-4 w-4" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                      {copied ? "Copiato!" : "Copia invito"}
                    </button>
                  )}
                </div>
              ) : (
                <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
                  <button
                    type="button"
                    onClick={onClose}
                    className="rounded-full border border-white/10 px-5 py-2.5 text-[12px] font-medium text-text-secondary transition-colors hover:border-white/20 hover:bg-white/[0.04] hover:text-text-primary"
                  >
                    Annulla
                  </button>
                  {tab === "create" && canCreate ? (
                    <button
                      type="button"
                      disabled={loading}
                      onClick={() => void handleCreate()}
                      className="inline-flex items-center justify-center gap-2 rounded-full bg-text-primary px-5 py-2.5 text-[12px] font-semibold text-void transition-transform hover:scale-[1.02] active:scale-[0.98] disabled:opacity-60"
                    >
                      {loading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Users className="h-4 w-4" />
                      )}
                      Crea stanza
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={loading}
                      onClick={() => void handleJoin()}
                      className="inline-flex items-center justify-center gap-2 rounded-full bg-text-primary px-5 py-2.5 text-[12px] font-semibold text-void transition-transform hover:scale-[1.02] active:scale-[0.98] disabled:opacity-60"
                    >
                      {loading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Radio className="h-4 w-4" />
                      )}
                      Entra nella stanza
                    </button>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
