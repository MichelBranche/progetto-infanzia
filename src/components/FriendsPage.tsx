import { useCallback, useEffect, useState } from "react";
import {
  Check,
  Copy,
  Cloud,
  RefreshCw,
  Trash2,
  UserPlus,
  Users,
  Wifi,
  X,
} from "lucide-react";
import { CloudAuthPanel } from "./CloudAuthPanel";
import { WatchPartyPanel } from "./WatchPartyPanel";
import {
  FriendProfileSheet,
  type FriendProfileTarget,
} from "./chat/FriendProfileSheet";
import {
  FriendListRow,
  ProfileCard,
  ProfileSectionLabel,
} from "./profile/ProfileUi";
import { useCloudAccount } from "../context/CloudAccountContext";
import { useNotifications } from "../context/NotificationContext";
import { useCloudFriendAlertsContext } from "../context/CloudFriendAlertsContext";
import { formatPresenceLabel } from "../lib/presenceLabels";
import {
  listPendingFriendRequests,
  removeCloudFriend,
  respondFriendRequest,
  sendFriendRequestByFriendCode,
} from "../lib/cloudFriends";
import {
  addFriend,
  getFriendCode,
  removeFriend,
} from "../lib/watchPartyApi";
import type { CloudFriend, LanFriendPresence } from "../types/cloud";
import type { WatchPartySession } from "../types/watchParty";

type EnrichedCloudFriend = CloudFriend & {
  presence?: import("../types/cloud").FriendPresence;
  isOnline: boolean;
};

interface FriendsPageProps {
  profileId: string;
  profileName: string;
  embedded?: boolean;
  onJoinSession?: (session: WatchPartySession) => void;
  onFriendsChanged?: () => void;
  cloudOnline?: EnrichedCloudFriend[];
  cloudOffline?: EnrichedCloudFriend[];
  cloudPresenceLoading?: boolean;
  onRefreshCloudPresence?: () => Promise<void>;
  lanOnline?: LanFriendPresence[];
  lanOffline?: LanFriendPresence[];
  lanPresenceLoading?: boolean;
  onRefreshLanPresence?: () => void;
}

export function FriendsPage({
  profileId,
  profileName,
  embedded = false,
  onJoinSession,
  onFriendsChanged,
  cloudOnline = [],
  cloudOffline = [],
  cloudPresenceLoading = false,
  onRefreshCloudPresence,
  lanOnline = [],
  lanOffline = [],
  lanPresenceLoading = false,
  onRefreshLanPresence,
}: FriendsPageProps) {
  const { profile: cloudProfile, configured: cloudConfigured } = useCloudAccount();
  const { notify } = useNotifications();
  const { refreshFriendAlerts } = useCloudFriendAlertsContext();

  const [myCode, setMyCode] = useState("");
  const [metaLoading, setMetaLoading] = useState(true);
  const [pendingRequests, setPendingRequests] = useState<
    import("../types/cloud").CloudFriendRequest[]
  >([]);
  const [friendCode, setFriendCode] = useState("");
  const [cloudFriendCode, setCloudFriendCode] = useState("");
  const [friendName, setFriendName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [partyPanelOpen, setPartyPanelOpen] = useState(false);
  const [selectedFriend, setSelectedFriend] = useState<FriendProfileTarget | null>(null);
  const [showAddPanel, setShowAddPanel] = useState(false);

  const loadMeta = useCallback(async () => {
    setMetaLoading(true);
    setError(null);
    try {
      const code = await getFriendCode(profileId);
      setMyCode(code);

      if (cloudProfile) {
        const pending = await listPendingFriendRequests();
        setPendingRequests(pending);
      } else {
        setPendingRequests([]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setMetaLoading(false);
      refreshFriendAlerts();
    }
  }, [profileId, cloudProfile, refreshFriendAlerts]);

  useEffect(() => {
    void loadMeta();
  }, [loadMeta]);

  const refreshAll = async () => {
    await Promise.all([
      loadMeta(),
      onRefreshCloudPresence?.(),
    ]);
    onRefreshLanPresence?.();
  };

  const handleAddLan = async () => {
    if (!friendCode.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await addFriend(profileId, friendCode, friendName || undefined);
      setFriendCode("");
      setFriendName("");
      await refreshAll();
      setShowAddPanel(false);
      onFriendsChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const handleAddCloud = async () => {
    const code = cloudFriendCode.trim();
    if (!code) return;
    setSaving(true);
    setError(null);
    try {
      await sendFriendRequestByFriendCode(code);
      setCloudFriendCode("");
      notify({
        kind: "success",
        title: "Richiesta inviata",
        message: `Inviata al codice ${code.toUpperCase()}`,
      });
      await refreshAll();
      setShowAddPanel(false);
      onFriendsChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const copyCloudCode = async () => {
    if (!cloudProfile?.friendCode) return;
    try {
      await navigator.clipboard.writeText(cloudProfile.friendCode);
      notify({ kind: "success", title: "Codice cloud copiato" });
    } catch {
      // ignore
    }
  };

  const handleRespond = async (requestId: string, accept: boolean) => {
    setSaving(true);
    setError(null);
    try {
      await respondFriendRequest(requestId, accept);
      notify({
        kind: accept ? "success" : "info",
        title: accept ? "Amicizia accettata" : "Richiesta rifiutata",
      });
      await refreshAll();
      onFriendsChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(myCode);
      notify({ kind: "success", title: "Codice copiato" });
    } catch {
      // ignore
    }
  };

  const presenceRefreshing = cloudPresenceLoading || lanPresenceLoading;
  const totalOnline = cloudOnline.length + lanOnline.length;
  const totalOffline = cloudOffline.length + lanOffline.length;

  return (
    <>
      <div className={embedded ? "" : "page-px pb-16 pt-24 sm:pt-28"}>
        <div
          className={`flex items-center justify-between gap-4 ${embedded ? "mb-6" : "mb-8"}`}
        >
          {!embedded && (
            <div>
              <p className="text-[10px] font-medium uppercase tracking-[0.34em] text-text-muted">
                Social
              </p>
              <h2 className="font-display mt-2 text-2xl font-semibold tracking-[-0.03em] text-text-primary sm:text-3xl">
                Amici
              </h2>
            </div>
          )}
          <button
            type="button"
            onClick={() => void refreshAll()}
            disabled={presenceRefreshing}
            className={`inline-flex items-center gap-2 text-[12px] font-medium text-text-muted transition-colors hover:text-text-secondary disabled:opacity-50 ${
              embedded ? "ml-auto" : ""
            }`}
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${presenceRefreshing ? "animate-spin" : ""}`}
            />
            Aggiorna
          </button>
        </div>

        {error && (
          <p className="mb-6 border border-warm/20 bg-warm/10 px-4 py-3 text-[13px] text-warm">
            {error}
          </p>
        )}

        <div className={embedded ? "space-y-6" : "mx-auto max-w-3xl space-y-8"}>
          {cloudConfigured && <CloudAuthPanel />}

          <ProfileCard>
            <ProfileSectionLabel>Online adesso</ProfileSectionLabel>
            {totalOnline === 0 ? (
              <p className="text-[14px] text-text-secondary">
                Nessun amico online al momento.
                {cloudProfile
                  ? " Restano visibili qui appena aprono Branchefy."
                  : " Accedi con email cloud o aggiungi amici LAN sulla stessa Wi‑Fi."}
              </p>
            ) : (
              <ul>
                {cloudOnline.map((friend) => (
                  <FriendListRow
                    key={`cloud-${friend.userId}`}
                    name={friend.displayName}
                    subtitle={formatPresenceLabel(friend.presence)}
                    avatarUrl={friend.avatarUrl}
                    online
                    away={friend.presence?.status === "away"}
                    onPress={() => setSelectedFriend(friend)}
                    trailing={
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          void removeCloudFriend(friend.userId).then(refreshAll);
                        }}
                        className="rounded-lg p-2 text-text-muted hover:bg-white/5 hover:text-warm"
                        aria-label="Rimuovi"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    }
                  />
                ))}
                {lanOnline.map((friend) => (
                  <FriendListRow
                    key={`lan-${friend.friendCode}`}
                    name={friend.displayName}
                    subtitle={`LAN · ${friend.lastHost ?? "rete locale"}`}
                    avatarUrl={friend.avatarUrl}
                    online
                    trailing={
                      <button
                        type="button"
                        onClick={() =>
                          void removeFriend(profileId, friend.friendCode).then(refreshAll)
                        }
                        className="rounded-lg p-2 text-text-muted hover:bg-white/5 hover:text-warm"
                        aria-label="Rimuovi"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    }
                  />
                ))}
              </ul>
            )}
          </ProfileCard>

          {cloudProfile && pendingRequests.length > 0 && (
            <ProfileCard className="border-accent/20 bg-accent/[0.03]">
              <ProfileSectionLabel>Richieste in attesa</ProfileSectionLabel>
              <ul>
                {pendingRequests.map((req) => (
                  <li
                    key={req.id}
                    className="flex items-center justify-between gap-3 border-b border-white/[0.05] py-3 last:border-0"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white/[0.06] font-display text-[14px] font-semibold text-text-primary">
                        {req.requester?.avatarUrl ? (
                          <img
                            src={req.requester.avatarUrl}
                            alt=""
                            className="h-full w-full object-cover"
                            draggable={false}
                          />
                        ) : (
                          (req.requester?.displayName ?? "?").trim().charAt(0).toUpperCase()
                        )}
                      </div>
                      <div className="min-w-0">
                      <p className="truncate font-display text-[14px] font-medium text-text-primary">
                        {req.requester?.displayName ?? "Utente"}
                      </p>
                      <p className="text-[11px] text-text-muted">
                        {req.requester?.friendCode
                          ? `Codice ${req.requester.friendCode}`
                          : req.requester?.displayName}
                      </p>
                    </div>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => void handleRespond(req.id, true)}
                        className="rounded-lg p-2 text-mint hover:bg-white/5"
                        aria-label="Accetta"
                      >
                        <Check className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => void handleRespond(req.id, false)}
                        className="rounded-lg p-2 text-text-muted hover:bg-white/5 hover:text-warm"
                        aria-label="Rifiuta"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </ProfileCard>
          )}

          {(totalOffline > 0 || cloudProfile || lanOffline.length > 0) && (
            <ProfileCard>
              <ProfileSectionLabel>Offline</ProfileSectionLabel>
              {totalOffline === 0 ? (
                <p className="text-[13px] text-text-muted">Tutti i tuoi amici sono online.</p>
              ) : (
                <ul>
                  {cloudOffline.map((friend) => (
                    <FriendListRow
                      key={`cloud-off-${friend.userId}`}
                      name={friend.displayName}
                      avatarUrl={friend.avatarUrl}
                      subtitle={
                        formatPresenceLabel(friend.presence) ??
                        `Codice ${friend.friendCode}`
                      }
                      online={false}
                      onPress={() => setSelectedFriend(friend)}
                      trailing={
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            void removeCloudFriend(friend.userId).then(refreshAll);
                          }}
                          className="rounded-lg p-2 text-text-muted hover:bg-white/5 hover:text-warm"
                          aria-label="Rimuovi"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      }
                    />
                  ))}
                  {lanOffline.map((friend) => (
                    <FriendListRow
                      key={`lan-off-${friend.friendCode}`}
                      name={friend.displayName}
                      avatarUrl={friend.avatarUrl}
                      subtitle={`LAN · ${friend.friendCode}`}
                      online={false}
                      trailing={
                        <button
                          type="button"
                          onClick={() =>
                            void removeFriend(profileId, friend.friendCode).then(refreshAll)
                          }
                          className="rounded-lg p-2 text-text-muted hover:bg-white/5 hover:text-warm"
                          aria-label="Rimuovi"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      }
                    />
                  ))}
                </ul>
              )}
            </ProfileCard>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <ProfileCard>
              <ProfileSectionLabel>Guarda insieme</ProfileSectionLabel>
              <p className="mb-4 text-[13px] leading-relaxed text-text-muted">
                Crea una stanza dal player o unisciti con un codice.
              </p>
              <button
                type="button"
                onClick={() => setPartyPanelOpen(true)}
                className="inline-flex items-center gap-2 rounded-full bg-text-primary px-4 py-2 text-[11px] font-medium uppercase tracking-[0.1em] text-void hover:bg-white"
              >
                <Users className="h-3.5 w-3.5" />
                Stanze
              </button>
            </ProfileCard>

            <ProfileCard>
              <ProfileSectionLabel>Aggiungi amico</ProfileSectionLabel>
              <p className="mb-4 text-[13px] leading-relaxed text-text-muted">
                Codice amico cloud o codice LAN sulla stessa rete.
              </p>
              <button
                type="button"
                onClick={() => setShowAddPanel((v) => !v)}
                className="inline-flex items-center gap-2 rounded-full border border-white/12 px-4 py-2 text-[11px] font-medium uppercase tracking-[0.1em] text-text-secondary hover:border-white/25 hover:text-text-primary"
              >
                <UserPlus className="h-3.5 w-3.5" />
                {showAddPanel ? "Chiudi" : "Aggiungi"}
              </button>
            </ProfileCard>
          </div>

          {showAddPanel && (
            <ProfileCard>
              {cloudProfile && (
                <div className="mb-6">
                  <div className="mb-3 flex items-center gap-2">
                    <Cloud className="h-4 w-4 text-text-muted" strokeWidth={1.5} />
                    <p className="text-[13px] font-medium text-text-primary">Cloud</p>
                  </div>
                  <div className="mb-4 flex flex-wrap items-center gap-3">
                    <span className="font-display text-xl font-semibold tracking-[0.16em] text-text-primary">
                      {cloudProfile.friendCode}
                    </span>
                    <button
                      type="button"
                      onClick={() => void copyCloudCode()}
                      className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-text-muted hover:text-text-secondary"
                    >
                      <Copy className="h-3.5 w-3.5" />
                      Il tuo codice
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <input
                      value={cloudFriendCode}
                      onChange={(e) =>
                        setCloudFriendCode(e.target.value.toUpperCase())
                      }
                      placeholder="Codice amico"
                      className="min-w-[200px] flex-1 border-b border-white/10 bg-transparent py-2 text-[13px] uppercase outline-none focus:border-white/30"
                    />
                    <button
                      type="button"
                      disabled={saving || !cloudFriendCode.trim()}
                      onClick={() => void handleAddCloud()}
                      className="rounded-full bg-text-primary px-4 py-2 text-[11px] font-medium uppercase tracking-[0.1em] text-void disabled:opacity-50"
                    >
                      Invia richiesta
                    </button>
                  </div>
                </div>
              )}

              <div>
                <div className="mb-3 flex items-center gap-2">
                  <Wifi className="h-4 w-4 text-text-muted" strokeWidth={1.5} />
                  <p className="text-[13px] font-medium text-text-primary">Rete locale</p>
                </div>
                <div className="mb-4 flex flex-wrap items-center gap-3">
                  <span className="font-display text-xl font-semibold tracking-[0.16em] text-text-primary">
                    {metaLoading ? "···" : myCode || "—"}
                  </span>
                  <button
                    type="button"
                    onClick={() => void copyCode()}
                    className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-text-muted hover:text-text-secondary"
                  >
                    <Copy className="h-3.5 w-3.5" />
                    Codice LAN
                  </button>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <input
                    value={friendCode}
                    onChange={(e) => setFriendCode(e.target.value.toUpperCase())}
                    placeholder="Codice amico"
                    className="border-b border-white/10 bg-transparent py-2 text-[13px] uppercase outline-none focus:border-white/30"
                  />
                  <input
                    value={friendName}
                    onChange={(e) => setFriendName(e.target.value)}
                    placeholder="Nome (opzionale)"
                    className="border-b border-white/10 bg-transparent py-2 text-[13px] outline-none focus:border-white/30"
                  />
                </div>
                <button
                  type="button"
                  disabled={saving || !friendCode.trim()}
                  onClick={() => void handleAddLan()}
                  className="mt-4 rounded-full border border-white/12 px-4 py-2 text-[11px] font-medium uppercase tracking-[0.1em] text-text-secondary hover:border-white/25 hover:text-text-primary disabled:opacity-50"
                >
                  Aggiungi LAN
                </button>
              </div>
            </ProfileCard>
          )}
        </div>
      </div>

      <WatchPartyPanel
        open={partyPanelOpen}
        onClose={() => setPartyPanelOpen(false)}
        profileId={profileId}
        profileName={profileName}
        defaultTab="join"
        onSessionReady={(session) => {
          onJoinSession?.(session);
          setPartyPanelOpen(false);
        }}
      />

      <FriendProfileSheet
        friend={selectedFriend}
        onClose={() => setSelectedFriend(null)}
      />
    </>
  );
}
