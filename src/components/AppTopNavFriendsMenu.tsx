import { useCallback, useRef, useState } from "react";
import {
  BellOff,
  ChevronRight,
  Circle,
  EyeOff,
  Loader2,
  MessageSquare,
  Moon,
  Radio,
  RefreshCw,
  UserPlus,
  Users,
} from "lucide-react";
import { useChatPopup } from "../context/ChatPopupContext";
import { useNotifications } from "../context/NotificationContext";
import type { CloudProfile } from "../types/cloud";
import { ensureWatchPartyChat, openDirectChat } from "../lib/cloudChat";
import { joinCloudWatchParty } from "../lib/cloudWatchParty";
import { isLanFeaturesEnabled } from "../lib/platform";
import { isPrivateOrLanHost } from "../lib/watchPartyNetwork";
import {
  USER_PRESENCE_OPTIONS,
  userPresenceStatusLabel,
  type UserPresenceStatus,
} from "../lib/userPresenceStatus";
import type { WatchPartySession } from "../types/watchParty";
import type { AppTopNavFriendEntry } from "../hooks/useAppTopNavFriendsList";
import { OnlineDot } from "./profile/ProfileUi";
import { useWatchPartyInviteActions } from "../hooks/useWatchPartyInviteActions";
import {
  canInviteFriendToHostSession,
  canShowHostPartyInvites,
} from "../lib/watchPartyInviteEligibility";

const STATUS_ICONS: Record<UserPresenceStatus, typeof Circle> = {
  online: Circle,
  away: Moon,
  dnd: BellOff,
  invisible: EyeOff,
};

const STATUS_DOT_CLASS: Record<UserPresenceStatus, string> = {
  online: "bg-mint",
  away: "bg-amber-400",
  dnd: "bg-red-400",
  invisible: "bg-white/25 ring-1 ring-white/30",
};

type FriendMenuEntry = AppTopNavFriendEntry;

interface AppTopNavFriendsMenuPanelProps {
  friends: AppTopNavFriendEntry[];
  onlineCount: number;
  refreshing: boolean;
  status: UserPresenceStatus;
  setStatus: (status: UserPresenceStatus) => void;
  refreshAll: () => void;
  cloudProfile: CloudProfile | null;
  onClose: () => void;
  onNavigate: (id: string) => void;
  onJoinWatchParty?: (session: WatchPartySession) => void;
}

export function AppTopNavFriendsMenuPanel({
  friends: allFriends,
  onlineCount,
  refreshing,
  status,
  setStatus,
  refreshAll,
  cloudProfile,
  onClose,
  onNavigate,
  onJoinWatchParty,
}: AppTopNavFriendsMenuPanelProps) {
  const { notify } = useNotifications();
  const chatPopup = useChatPopup();
  const partyJoinRef = useRef<HTMLDivElement>(null);
  const { hostSession, sendInviteToFriend } =
    useWatchPartyInviteActions();
  const [invitingKey, setInvitingKey] = useState<string | null>(null);

  const [partyCode, setPartyCode] = useState("");
  const [partyHostIp, setPartyHostIp] = useState("");
  const [partyJoining, setPartyJoining] = useState(false);
  const [partyError, setPartyError] = useState<string | null>(null);
  const [showPartyJoin, setShowPartyJoin] = useState(false);

  const openChat = useCallback(
    async (friend: FriendMenuEntry) => {
      if (friend.kind !== "cloud" || !friend.userId) {
        notify({
          kind: "info",
          title: "Chat cloud",
          message: "Accedi con email per messaggiare con gli amici LAN.",
        });
        return;
      }
      if (!cloudProfile) {
        notify({
          kind: "info",
          title: "Account richiesto",
          message: "Accedi al tuo account Branchefy per aprire la chat.",
        });
        return;
      }
      try {
        const conversationId = await openDirectChat(friend.userId);
        chatPopup.open(conversationId, friend.name);
        onClose();
      } catch (err) {
        notify({
          kind: "info",
          title: "Chat non disponibile",
          message: err instanceof Error ? err.message : String(err),
        });
      }
    },
    [chatPopup, cloudProfile, notify, onClose],
  );

  const preparePartyJoin = useCallback((friend?: FriendMenuEntry) => {
    setPartyError(null);
    setShowPartyJoin(true);
    if (friend?.lastHost) {
      setPartyHostIp(friend.lastHost);
    }
    window.setTimeout(() => {
      partyJoinRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }, 80);
  }, []);

  const handleFriendPartyAction = useCallback(
    async (friend: FriendMenuEntry) => {
      if (canInviteFriendToHostSession(friend, hostSession, cloudProfile)) {
        setInvitingKey(friend.key);
        try {
          const sent = await sendInviteToFriend(friend);
          if (sent) onClose();
        } finally {
          setInvitingKey(null);
        }
        return;
      }
      preparePartyJoin(friend);
    },
    [
      hostSession,
      cloudProfile,
      onClose,
      preparePartyJoin,
      sendInviteToFriend,
    ],
  );

  const handleJoinParty = useCallback(async () => {
    if (!onJoinWatchParty) return;
    const code = partyCode.trim().toUpperCase();
    if (code.length < 4) {
      setPartyError("Inserisci il codice stanza (min. 4 caratteri)");
      return;
    }

    setPartyJoining(true);
    setPartyError(null);

    try {
      if (cloudProfile) {
        const room = await joinCloudWatchParty(code);
        if (room) {
          try {
            await ensureWatchPartyChat(room.code);
          } catch {
            // join ok anche senza chat immediata
          }
          onJoinWatchParty({ role: "guest", room, relay: "cloud" });
          onClose();
          return;
        }
      }

      if (!isLanFeaturesEnabled()) {
        setPartyError(
          cloudProfile
            ? "Stanza non trovata online. Verifica il codice con l'host."
            : "Accedi con account cloud o usa la modalità LAN su desktop.",
        );
        return;
      }

      const host = partyHostIp.trim();
      if (!host) {
        setPartyError("Inserisci l'IP dell'host (stessa rete Wi‑Fi)");
        return;
      }
      if (!isPrivateOrLanHost(host)) {
        setPartyError(
          "IP non locale: usa la modalità online con account Branchefy.",
        );
        return;
      }

      onJoinWatchParty({
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
    } catch (err) {
      setPartyError(err instanceof Error ? err.message : String(err));
    } finally {
      setPartyJoining(false);
    }
  }, [
    cloudProfile,
    onClose,
    onJoinWatchParty,
    partyCode,
    partyHostIp,
  ]);

  return (
    <div
      className="overflow-hidden rounded-2xl border border-white/[0.08] bg-[#121216] shadow-[0_20px_50px_rgba(0,0,0,0.55)]"
      role="menu"
    >
      <div className="border-b border-white/[0.06] px-4 py-3.5">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="font-display text-[14px] font-semibold tracking-[-0.02em] text-text-primary">
              Amici
            </p>
            <p className="mt-0.5 text-[11px] text-text-muted">
              {onlineCount} online
              {allFriends.length > onlineCount
                ? ` · ${allFriends.length - onlineCount} offline`
                : ""}
            </p>
          </div>
          <button
            type="button"
            onClick={refreshAll}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-text-muted transition-colors hover:bg-white/[0.06] hover:text-text-primary"
            title="Aggiorna"
            aria-label="Aggiorna lista amici"
          >
            <RefreshCw
              className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`}
              strokeWidth={1.75}
            />
          </button>
        </div>
      </div>

      <div className="border-b border-white/[0.06] px-3 py-3">
        <p className="mb-2 px-1 text-[10px] font-medium uppercase tracking-[0.14em] text-text-muted">
          Il tuo stato
        </p>
        <div className="grid grid-cols-2 gap-1">
          {USER_PRESENCE_OPTIONS.map((option) => {
            const Icon = STATUS_ICONS[option.id];
            const selected = status === option.id;
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => setStatus(option.id)}
                className={`flex items-center gap-2 rounded-xl px-2.5 py-2 text-left transition-colors ${
                  selected
                    ? "bg-white/[0.08] text-text-primary"
                    : "text-text-secondary hover:bg-white/[0.04] hover:text-text-primary"
                }`}
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/[0.04]">
                  <span
                    className={`inline-flex h-2 w-2 rounded-full ${STATUS_DOT_CLASS[option.id]}`}
                  />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2 text-[12px] font-medium">
                    <Icon className="h-3 w-3 shrink-0 opacity-70" />
                    {option.label}
                  </span>
                </span>
                {selected && (
                  <span className="text-[9px] font-medium uppercase tracking-[0.12em] text-mint">
                    Attivo
                  </span>
                )}
              </button>
            );
          })}
        </div>
        {cloudProfile && (
          <p className="mt-2 px-1 text-[11px] text-text-muted">
            {userPresenceStatusLabel(status)}
          </p>
        )}
      </div>

      <div className="max-h-[240px] overflow-y-auto px-2 py-2 scrollbar-hide">
        {refreshing && allFriends.length === 0 ? (
          <div className="flex items-center justify-center gap-2 py-10 text-[13px] text-text-muted">
            <Loader2 className="h-4 w-4 animate-spin" />
            Caricamento amici…
          </div>
        ) : allFriends.length === 0 ? (
          <div className="px-2 py-8 text-center">
            <Users className="mx-auto mb-3 h-6 w-6 text-text-muted/50" />
            <p className="text-[13px] text-text-secondary">
              Nessun amico ancora.
            </p>
          </div>
        ) : (
          <ul className="space-y-0.5">
            {allFriends.map((friend) => (
              <li key={friend.key}>
                <div
                  className={`flex items-center gap-2 rounded-xl px-2 py-2 transition-colors hover:bg-white/[0.04] ${
                    friend.online ? "" : "opacity-85"
                  }`}
                >
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 items-center gap-3 text-left"
                    onClick={() => void openChat(friend)}
                  >
                    <FriendAvatar
                      name={friend.name}
                      avatarUrl={friend.avatarUrl}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <OnlineDot
                          online={friend.online}
                          away={friend.away}
                          dnd={friend.dnd}
                        />
                        <p className="truncate text-[13px] font-medium text-text-primary">
                          {friend.name}
                        </p>
                      </div>
                      {friend.subtitle && (
                        <p className="mt-0.5 truncate text-[11px] text-text-muted">
                          {friend.subtitle}
                        </p>
                      )}
                    </div>
                  </button>
                  {friend.kind === "cloud" && cloudProfile && (
                    <button
                      type="button"
                      onClick={() => void openChat(friend)}
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-text-muted transition-colors hover:bg-white/[0.08] hover:text-text-primary"
                      title="Apri chat"
                      aria-label={`Chat con ${friend.name}`}
                    >
                      <MessageSquare className="h-4 w-4" strokeWidth={1.75} />
                    </button>
                  )}
                  {onJoinWatchParty && (
                    <button
                      type="button"
                      onClick={() => void handleFriendPartyAction(friend)}
                      disabled={invitingKey === friend.key}
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-text-muted transition-colors hover:bg-accent/15 hover:text-accent disabled:opacity-50"
                      title={
                        canInviteFriendToHostSession(friend, hostSession, cloudProfile)
                          ? `Invita ${friend.name} al watch party`
                          : `Guarda insieme a ${friend.name}`
                      }
                      aria-label={
                        canInviteFriendToHostSession(friend, hostSession, cloudProfile)
                          ? `Invita ${friend.name} al watch party`
                          : `Watch party con ${friend.name}`
                      }
                    >
                      <Users className="h-4 w-4" strokeWidth={1.75} />
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {onJoinWatchParty && (
        <div
          ref={partyJoinRef}
          className="border-t border-white/[0.06] px-3 py-3"
        >
          {canShowHostPartyInvites(hostSession, cloudProfile) && hostSession && (
            <div className="mb-3 rounded-xl border border-accent/20 bg-accent/[0.06] px-3 py-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-accent">
                Stanza attiva
              </p>
              <p className="mt-1 font-display text-lg font-semibold tracking-[0.18em] text-text-primary">
                {hostSession.room.code}
              </p>
              <p className="mt-1 text-[11px] text-text-muted">
                Tocca l&apos;icona accanto a un amico per invitarlo.
              </p>
            </div>
          )}
          <button
            type="button"
            onClick={() => {
              setShowPartyJoin((v) => !v);
              setPartyError(null);
            }}
            className="flex w-full items-center justify-between rounded-xl px-2 py-2 text-left text-[13px] font-medium text-text-secondary transition-colors hover:bg-white/[0.04] hover:text-text-primary"
          >
            <span className="inline-flex items-center gap-2">
              <Radio className="h-4 w-4 shrink-0 text-accent" />
              Unisciti a watch party
            </span>
            <ChevronRight
              className={`h-4 w-4 opacity-50 transition-transform ${
                showPartyJoin ? "rotate-90" : ""
              }`}
            />
          </button>

          {showPartyJoin && (
            <div className="mt-2 space-y-2 px-1">
              <input
                type="text"
                value={partyCode}
                onChange={(e) => setPartyCode(e.target.value.toUpperCase())}
                placeholder="Codice stanza"
                className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5 text-[13px] text-text-primary outline-none placeholder:text-text-muted focus:border-accent/40"
              />
              {isLanFeaturesEnabled() && (
                <input
                  type="text"
                  value={partyHostIp}
                  onChange={(e) => setPartyHostIp(e.target.value)}
                  placeholder="IP host (LAN)"
                  className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5 text-[13px] text-text-primary outline-none placeholder:text-text-muted focus:border-accent/40"
                />
              )}
              {partyError && (
                <p className="text-[11px] leading-relaxed text-warm">
                  {partyError}
                </p>
              )}
              <button
                type="button"
                disabled={partyJoining}
                onClick={() => void handleJoinParty()}
                className="w-full rounded-xl bg-accent/20 px-3 py-2.5 text-[13px] font-medium text-accent transition-colors hover:bg-accent/30 disabled:opacity-50"
              >
                {partyJoining ? "Connessione…" : "Entra nella stanza"}
              </button>
            </div>
          )}
        </div>
      )}

      <div className="border-t border-white/[0.06] p-2">
        <button
          type="button"
          role="menuitem"
          onClick={() => onNavigate("friends")}
          className="flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-[13px] text-text-secondary transition-colors hover:bg-white/[0.04] hover:text-text-primary"
        >
          <span className="inline-flex items-center gap-2">
            <Users className="h-4 w-4 shrink-0" />
            Gestisci amici
          </span>
          <ChevronRight className="h-4 w-4 opacity-50" />
        </button>
        <button
          type="button"
          role="menuitem"
          onClick={() => onNavigate("invite")}
          className="flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-[13px] text-text-secondary transition-colors hover:bg-white/[0.04] hover:text-text-primary"
        >
          <span className="inline-flex items-center gap-2">
            <UserPlus className="h-4 w-4 shrink-0" />
            Invita amici
          </span>
          <ChevronRight className="h-4 w-4 opacity-50" />
        </button>
      </div>
    </div>
  );
}

function FriendAvatar({
  name,
  avatarUrl,
}: {
  name: string;
  avatarUrl?: string;
}) {
  const initial = name.trim().charAt(0).toUpperCase() || "?";
  return (
    <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white/[0.06] font-display text-[13px] font-semibold text-text-primary">
      {avatarUrl ? (
        <img
          src={avatarUrl}
          alt=""
          className="h-full w-full object-cover"
          draggable={false}
        />
      ) : (
        initial
      )}
    </div>
  );
}
