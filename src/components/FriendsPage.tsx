import { useCallback, useEffect, useState } from "react";
import { Check, Copy, Loader2, Mail, Trash2, UserPlus, Users, X } from "lucide-react";
import { CloudAuthPanel } from "./CloudAuthPanel";
import { WatchPartyPanel } from "./WatchPartyPanel";
import { useCloudAccount } from "../context/CloudAccountContext";
import {
  listCloudFriends,
  listPendingFriendRequests,
  removeCloudFriend,
  respondFriendRequest,
  sendFriendRequestByEmail,
} from "../lib/cloudFriends";
import {
  addFriend,
  getFriendCode,
  listFriends,
  removeFriend,
} from "../lib/watchPartyApi";
import type { CloudFriend, CloudFriendRequest } from "../types/cloud";
import type { FriendRecord, WatchPartySession } from "../types/watchParty";

interface FriendsPageProps {
  profileId: string;
  profileName: string;
  embedded?: boolean;
  onJoinSession?: (session: WatchPartySession) => void;
}

export function FriendsPage({
  profileId,
  profileName,
  embedded = false,
  onJoinSession,
}: FriendsPageProps) {
  const { profile: cloudProfile, configured: cloudConfigured } = useCloudAccount();
  const [loading, setLoading] = useState(true);
  const [myCode, setMyCode] = useState("");
  const [friends, setFriends] = useState<FriendRecord[]>([]);
  const [cloudFriends, setCloudFriends] = useState<CloudFriend[]>([]);
  const [pendingRequests, setPendingRequests] = useState<CloudFriendRequest[]>([]);
  const [friendCode, setFriendCode] = useState("");
  const [friendName, setFriendName] = useState("");
  const [friendEmail, setFriendEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [partyPanelOpen, setPartyPanelOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [code, list] = await Promise.all([
        getFriendCode(profileId),
        listFriends(profileId),
      ]);
      setMyCode(code);
      setFriends(list);

      if (cloudProfile) {
        const [cloudList, pending] = await Promise.all([
          listCloudFriends(),
          listPendingFriendRequests(),
        ]);
        setCloudFriends(cloudList);
        setPendingRequests(pending);
      } else {
        setCloudFriends([]);
        setPendingRequests([]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [profileId, cloudProfile]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleAddLan = async () => {
    if (!friendCode.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await addFriend(profileId, friendCode, friendName || undefined);
      setFriendCode("");
      setFriendName("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const handleAddCloud = async () => {
    if (!friendEmail.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await sendFriendRequestByEmail(friendEmail);
      setFriendEmail("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const handleRespond = async (requestId: string, accept: boolean) => {
    setSaving(true);
    setError(null);
    try {
      await respondFriendRequest(requestId, accept);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveLan = async (code: string) => {
    await removeFriend(profileId, code);
    await load();
  };

  const handleRemoveCloud = async (userId: string) => {
    await removeCloudFriend(userId);
    await load();
  };

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(myCode);
    } catch {
      // ignore
    }
  };

  if (loading) {
    return (
      <div
        className={`flex min-h-[50vh] items-center justify-center ${embedded ? "py-16" : "pt-24"}`}
      >
        <Loader2 className="h-6 w-6 animate-spin text-text-muted" />
      </div>
    );
  }

  return (
    <>
      <div
        className={`page-px pb-16 ${embedded ? "pt-2" : "pt-24 sm:pt-28"}`}
      >
        {!embedded && (
          <div className="mb-8 flex items-center gap-3">
            <Users className="h-5 w-5 text-accent" />
            <div>
              <h2 className="font-display text-3xl font-semibold tracking-[-0.03em] text-text-primary">
                Amici
              </h2>
              <p className="mt-1 text-[14px] text-text-secondary">
                In casa con il codice locale, ovunque con l&apos;account email
              </p>
            </div>
          </div>
        )}

        {error && (
          <p className="mb-6 rounded-xl border border-warm/20 bg-warm/10 px-4 py-3 text-[13px] text-warm">
            {error}
          </p>
        )}

        <div className="grid max-w-3xl gap-6">
          {cloudConfigured && <CloudAuthPanel />}

          {cloudProfile && pendingRequests.length > 0 && (
            <section className="rounded-2xl border border-accent/20 bg-accent/5 p-5">
              <h3 className="text-[15px] font-medium text-text-primary">
                Richieste in attesa ({pendingRequests.length})
              </h3>
              <ul className="mt-4 space-y-2">
                {pendingRequests.map((req) => (
                  <li
                    key={req.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2.5"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-[14px] font-medium text-text-primary">
                        {req.requester?.displayName ?? "Utente"}
                      </p>
                      <p className="text-[11px] text-text-muted">
                        {req.requester?.email}
                      </p>
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
            </section>
          )}

          <section className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5">
            <h3 className="text-[15px] font-medium text-text-primary">
              Guarda insieme
            </h3>
            <p className="mt-1 text-[13px] text-text-muted">
              Crea una stanza dal player oppure unisciti con un codice
            </p>
            <button
              type="button"
              onClick={() => setPartyPanelOpen(true)}
              className="mt-4 inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-[12px] font-semibold text-black hover:bg-white/90"
            >
              <Users className="h-3.5 w-3.5" />
              Apri pannello stanze
            </button>
          </section>

          {cloudProfile && (
            <section className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5">
              <div className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-accent" />
                <h3 className="text-[15px] font-medium text-text-primary">
                  Aggiungi amico via email
                </h3>
              </div>
              <p className="mt-1 text-[13px] text-text-muted">
                Funziona anche se non siete sulla stessa rete Wi‑Fi
              </p>
              <div className="mt-4 flex flex-wrap gap-3">
                <input
                  type="email"
                  value={friendEmail}
                  onChange={(e) => setFriendEmail(e.target.value)}
                  placeholder="email@esempio.it"
                  className="min-w-[200px] flex-1 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2.5 text-[13px] outline-none focus:border-accent/30"
                />
                <button
                  type="button"
                  disabled={saving || !friendEmail.trim()}
                  onClick={() => void handleAddCloud()}
                  className="rounded-full bg-white px-4 py-2 text-[12px] font-semibold text-black disabled:opacity-50"
                >
                  Invia richiesta
                </button>
              </div>
            </section>
          )}

          {cloudProfile && (
            <section className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5">
              <h3 className="text-[15px] font-medium text-text-primary">
                Amici online ({cloudFriends.length})
              </h3>
              {cloudFriends.length === 0 ? (
                <p className="mt-3 text-[13px] text-text-muted">
                  Nessun amico cloud. Aggiungine uno con la sua email.
                </p>
              ) : (
                <ul className="mt-4 space-y-2">
                  {cloudFriends.map((friend) => (
                    <li
                      key={friend.userId}
                      className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.06] px-3 py-2.5"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-[14px] font-medium text-text-primary">
                          {friend.displayName}
                        </p>
                        <p className="text-[11px] text-text-muted">
                          {friend.email} · {friend.friendCode}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => void handleRemoveCloud(friend.userId)}
                        className="rounded-lg p-2 text-text-muted hover:bg-white/5 hover:text-warm"
                        aria-label="Rimuovi"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          <section className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5">
            <h3 className="text-[15px] font-medium text-text-primary">
              Rete domestica (LAN)
            </h3>
            <p className="mt-1 text-[13px] text-text-muted">
              Codice amico per chi è sulla stessa Wi‑Fi
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <span className="font-display rounded-xl bg-white/[0.05] px-4 py-2 text-2xl font-bold tracking-[0.18em] text-text-primary">
                {myCode}
              </span>
              <button
                type="button"
                onClick={() => void copyCode()}
                className="inline-flex items-center gap-2 rounded-full border border-white/10 px-4 py-2 text-[12px] text-text-primary hover:bg-white/[0.04]"
              >
                <Copy className="h-3.5 w-3.5" />
                Copia
              </button>
            </div>
          </section>

          <section className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5">
            <div className="flex items-center gap-2">
              <UserPlus className="h-4 w-4 text-accent" />
              <h3 className="text-[15px] font-medium text-text-primary">
                Aggiungi amico LAN
              </h3>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <input
                value={friendCode}
                onChange={(e) => setFriendCode(e.target.value.toUpperCase())}
                placeholder="Codice amico"
                className="rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2.5 text-[13px] uppercase outline-none focus:border-accent/30"
              />
              <input
                value={friendName}
                onChange={(e) => setFriendName(e.target.value)}
                placeholder="Nome (opzionale)"
                className="rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2.5 text-[13px] outline-none focus:border-accent/30"
              />
            </div>
            <button
              type="button"
              disabled={saving || !friendCode.trim()}
              onClick={() => void handleAddLan()}
              className="mt-3 rounded-full bg-white px-4 py-2 text-[12px] font-semibold text-black disabled:opacity-50"
            >
              Aggiungi
            </button>
          </section>

          <section className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5">
            <h3 className="text-[15px] font-medium text-text-primary">
              Amici LAN ({friends.length})
            </h3>
            {friends.length === 0 ? (
              <p className="mt-3 text-[13px] text-text-muted">
                Nessun amico in rete locale.
              </p>
            ) : (
              <ul className="mt-4 space-y-2">
                {friends.map((friend) => (
                  <li
                    key={friend.friendCode}
                    className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.06] px-3 py-2.5"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-[14px] font-medium text-text-primary">
                        {friend.displayName}
                      </p>
                      <p className="text-[11px] text-text-muted">
                        {friend.friendCode}
                        {friend.lastHost ? ` · ${friend.lastHost}` : ""}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleRemoveLan(friend.friendCode)}
                      className="rounded-lg p-2 text-text-muted hover:bg-white/5 hover:text-warm"
                      aria-label="Rimuovi"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
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
    </>
  );
}
