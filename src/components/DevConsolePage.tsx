import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Film,
  Loader2,
  Shield,
  Terminal,
  UserRound,
  Users,
} from "lucide-react";
import { formatDuration } from "../types/media";
import {
  fetchDevCloudUsers,
  fetchDevLocalDashboard,
} from "../lib/devAdminApi";
import type { DevCloudUser, DevLocalProfileInsight } from "../types/devAdmin";

type DevTab = "cloud" | "local";

function formatWhen(iso?: string) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("it-IT", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function presenceLabel(user: DevCloudUser) {
  if (!user.hasProfile) return "Senza profilo app";
  if (user.presenceStatus === "online") return "Online";
  if (user.presenceStatus === "away") return "Assente";
  if (user.lastSeenAt) return `Visto ${formatWhen(user.lastSeenAt)}`;
  return "Offline";
}

function CloudUserDetail({ user }: { user: DevCloudUser }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6">
      <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] px-5 py-4">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-display text-xl font-semibold text-text-primary">
            {user.displayName ?? user.email}
          </h3>
          {!user.hasProfile ? (
            <span className="rounded-full border border-warm/30 bg-warm/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-warm">
              Non registrato
            </span>
          ) : (
            <span className="rounded-full border border-mint/25 bg-mint/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-mint">
              Registrato
            </span>
          )}
        </div>
        <p className="mt-1 text-[13px] text-text-muted">{user.email}</p>
        <dl className="mt-4 grid gap-2 text-[12px] sm:grid-cols-2">
          <div className="flex justify-between gap-3 rounded-lg bg-black/20 px-3 py-2">
            <dt className="text-text-muted">Creato</dt>
            <dd className="text-text-primary">{formatWhen(user.authCreatedAt)}</dd>
          </div>
          <div className="flex justify-between gap-3 rounded-lg bg-black/20 px-3 py-2">
            <dt className="text-text-muted">Ultimo accesso</dt>
            <dd className="text-text-primary">{formatWhen(user.lastSignInAt)}</dd>
          </div>
          <div className="flex justify-between gap-3 rounded-lg bg-black/20 px-3 py-2">
            <dt className="text-text-muted">Stato</dt>
            <dd className="text-text-primary">{presenceLabel(user)}</dd>
          </div>
          {user.friendCode && (
            <div className="flex justify-between gap-3 rounded-lg bg-black/20 px-3 py-2">
              <dt className="text-text-muted">Codice amico</dt>
              <dd className="font-mono text-text-primary">{user.friendCode}</dd>
            </div>
          )}
        </dl>
      </div>

      <section>
        <div className="mb-3 flex items-center gap-2">
          <Users className="h-4 w-4 text-text-muted" />
          <h4 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-text-muted">
            Amici ({user.friends.length})
          </h4>
        </div>
        {!user.hasProfile ? (
          <p className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-6 text-center text-[13px] text-text-muted">
            Utente senza profilo app: nessun dato amici.
          </p>
        ) : user.friends.length === 0 ? (
          <p className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-6 text-center text-[13px] text-text-muted">
            Nessun amico accettato.
          </p>
        ) : (
          <ul className="space-y-2">
            {user.friends.map((friend) => (
              <li
                key={friend.friendId}
                className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium text-text-primary">
                    {friend.displayName}
                  </p>
                  <p className="truncate text-[12px] text-text-muted">
                    {friend.email}
                  </p>
                </div>
                <span className="shrink-0 font-mono text-[11px] text-text-secondary">
                  {friend.friendCode}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="min-h-0 flex-1">
        <div className="mb-3 flex items-center gap-2">
          <Film className="h-4 w-4 text-text-muted" />
          <h4 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-text-muted">
            Titoli guardati ({user.recentWatches.length})
          </h4>
        </div>
        {!user.hasProfile ? (
          <p className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-6 text-center text-[13px] text-text-muted">
            Utente senza profilo app: nessuna cronologia cloud.
          </p>
        ) : user.recentWatches.length === 0 ? (
          <p className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-6 text-center text-[13px] text-text-muted">
            Nessun titolo sincronizzato sul cloud. I dati compaiono quando
            l&apos;utente guarda contenuti con l&apos;app aggiornata.
          </p>
        ) : (
          <ul className="max-h-[min(52vh,520px)] space-y-2 overflow-y-auto pr-1">
            {user.recentWatches.map((watch, index) => (
              <li
                key={`${watch.watchedAt}-${watch.titleName}-${index}`}
                className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-[14px] font-medium text-text-primary">
                    {watch.titleName}
                  </p>
                  {watch.episodeLabel && (
                    <p className="truncate text-[12px] text-text-muted">
                      {watch.episodeLabel}
                    </p>
                  )}
                </div>
                <div className="shrink-0 text-right text-[11px] text-text-muted">
                  <p>{formatWhen(watch.watchedAt)}</p>
                  <p className="tabular-nums">{formatDuration(watch.secondsWatched)}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function LocalProfileDetail({ profile }: { profile: DevLocalProfileInsight }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6">
      <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] px-5 py-4">
        <h3 className="font-display text-xl font-semibold text-text-primary">
          {profile.name}
        </h3>
        <p className="mt-1 text-[13px] capitalize text-text-muted">{profile.role}</p>
        <p className="mt-2 text-[12px] text-text-secondary">
          Profilo locale su questo dispositivo
        </p>
      </div>

      <section>
        <div className="mb-3 flex items-center gap-2">
          <Users className="h-4 w-4 text-text-muted" />
          <h4 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-text-muted">
            Amici ({profile.friends.length})
          </h4>
        </div>
        {profile.friends.length === 0 ? (
          <p className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-6 text-center text-[13px] text-text-muted">
            Nessun amico aggiunto.
          </p>
        ) : (
          <ul className="space-y-2">
            {profile.friends.map((friend) => (
              <li
                key={friend.friendCode}
                className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium text-text-primary">
                    {friend.displayName}
                  </p>
                  {friend.lastHost && (
                    <p className="truncate text-[12px] text-text-muted">
                      Host: {friend.lastHost}
                    </p>
                  )}
                </div>
                <div className="shrink-0 text-right text-[11px] text-text-muted">
                  <p className="font-mono text-text-secondary">{friend.friendCode}</p>
                  <p>{formatWhen(friend.addedAt)}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="min-h-0 flex-1">
        <div className="mb-3 flex items-center gap-2">
          <Film className="h-4 w-4 text-text-muted" />
          <h4 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-text-muted">
            Titoli guardati ({profile.recentSessions.length})
          </h4>
        </div>
        {profile.recentSessions.length === 0 ? (
          <p className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-6 text-center text-[13px] text-text-muted">
            Nessuna sessione di visione registrata.
          </p>
        ) : (
          <ul className="max-h-[min(52vh,520px)] space-y-2 overflow-y-auto pr-1">
            {profile.recentSessions.map((session) => (
              <li
                key={session.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-[14px] font-medium text-text-primary">
                    {session.mediaTitle}
                  </p>
                  <p className="text-[12px] text-text-muted">
                    {session.sourceKind === "addon" ? "Streaming" : "Libreria locale"}
                    {session.completed ? " · completato" : ""}
                  </p>
                </div>
                <div className="shrink-0 text-right text-[11px] text-text-muted">
                  <p>{formatWhen(session.startedAt)}</p>
                  <p className="tabular-nums">
                    {formatDuration(session.secondsWatched)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

export function DevConsolePage() {
  const [tab, setTab] = useState<DevTab>("cloud");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cloudUsers, setCloudUsers] = useState<DevCloudUser[]>([]);
  const [localProfiles, setLocalProfiles] = useState<DevLocalProfileInsight[]>(
    [],
  );
  const [selectedCloudId, setSelectedCloudId] = useState<string | null>(null);
  const [selectedLocalId, setSelectedLocalId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [cloud, local] = await Promise.all([
        fetchDevCloudUsers(),
        fetchDevLocalDashboard(),
      ]);
      setCloudUsers(cloud);
      setLocalProfiles(local.profiles);
      setSelectedCloudId((prev) =>
        prev && cloud.some((u) => u.userId === prev)
          ? prev
          : (cloud[0]?.userId ?? null),
      );
      setSelectedLocalId((prev) =>
        prev && local.profiles.some((p) => p.id === prev)
          ? prev
          : (local.profiles[0]?.id ?? null),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filteredCloud = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return cloudUsers;
    return cloudUsers.filter(
      (user) =>
        user.email.toLowerCase().includes(q) ||
        user.displayName?.toLowerCase().includes(q),
    );
  }, [cloudUsers, query]);

  const filteredLocal = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return localProfiles;
    return localProfiles.filter((profile) =>
      profile.name.toLowerCase().includes(q),
    );
  }, [localProfiles, query]);

  const selectedCloudUser = useMemo(
    () => cloudUsers.find((u) => u.userId === selectedCloudId) ?? null,
    [cloudUsers, selectedCloudId],
  );

  const selectedLocalProfile = useMemo(
    () => localProfiles.find((p) => p.id === selectedLocalId) ?? null,
    [localProfiles, selectedLocalId],
  );

  const registeredCount = cloudUsers.filter((u) => u.hasProfile).length;
  const unregisteredCount = cloudUsers.length - registeredCount;

  return (
    <div className="page-px pb-16 pt-24 sm:pt-28">
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-accent/25 bg-accent/10">
            <Terminal className="h-5 w-5 text-accent" />
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.32em] text-accent">
              Dev only
            </p>
            <h2 className="font-display mt-1 text-3xl font-semibold tracking-[-0.03em] text-text-primary">
              Console sviluppatore
            </h2>
            <p className="mt-1 text-[14px] text-text-secondary">
              Seleziona un utente per vedere titoli guardati e amici
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="self-start rounded-full border border-white/10 px-4 py-2 text-[12px] text-text-secondary transition-colors hover:bg-white/[0.04]"
        >
          Aggiorna
        </button>
      </div>

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        {[
          { label: "Utenti auth", value: cloudUsers.length, icon: Users },
          { label: "Con profilo", value: registeredCount, icon: Shield },
          { label: "Solo auth", value: unregisteredCount, icon: UserRound },
        ].map((stat) => (
          <div
            key={stat.label}
            className="rounded-2xl border border-white/[0.06] bg-white/[0.02] px-4 py-4"
          >
            <div className="flex items-center gap-2 text-text-muted">
              <stat.icon className="h-4 w-4" />
              <p className="text-[11px] uppercase tracking-[0.16em]">
                {stat.label}
              </p>
            </div>
            <p className="mt-2 font-display text-2xl font-semibold text-text-primary">
              {stat.value}
            </p>
          </div>
        ))}
      </div>

      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="inline-flex rounded-full border border-white/10 bg-white/[0.03] p-1">
          {(["cloud", "local"] as const).map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`rounded-full px-4 py-2 text-[12px] font-medium transition-colors ${
                tab === id
                  ? "bg-text-primary text-void"
                  : "text-text-muted hover:text-text-primary"
              }`}
            >
              {id === "cloud" ? "Utenti cloud" : "Profili locali"}
            </button>
          ))}
        </div>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Cerca email, nome o profilo…"
          className="w-full rounded-full border border-white/10 bg-black/20 px-4 py-2.5 text-[13px] text-text-primary outline-none placeholder:text-text-muted focus:border-accent/40 sm:max-w-xs"
        />
      </div>

      {loading ? (
        <div className="flex min-h-[320px] items-center justify-center">
          <Loader2 className="h-7 w-7 animate-spin text-text-muted" />
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-warm/25 bg-warm/10 px-4 py-4 text-[13px] text-warm">
          {error}
        </div>
      ) : tab === "cloud" ? (
        <div className="grid min-h-[420px] gap-4 lg:grid-cols-[minmax(240px,300px)_1fr]">
          <div className="flex max-h-[min(70vh,680px)] flex-col overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.02]">
            <p className="border-b border-white/[0.06] px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">
              Utenti ({filteredCloud.length})
            </p>
            <ul className="min-h-0 flex-1 overflow-y-auto p-2">
              {filteredCloud.length === 0 ? (
                <li className="px-3 py-6 text-center text-[13px] text-text-muted">
                  Nessun utente trovato.
                </li>
              ) : (
                filteredCloud.map((user) => {
                  const selected = user.userId === selectedCloudId;
                  return (
                    <li key={user.userId}>
                      <button
                        type="button"
                        onClick={() => setSelectedCloudId(user.userId)}
                        className={`mb-1 w-full rounded-xl px-3 py-3 text-left transition-colors ${
                          selected
                            ? "bg-accent/15 ring-1 ring-accent/30"
                            : "hover:bg-white/[0.04]"
                        }`}
                      >
                        <p className="truncate font-medium text-text-primary">
                          {user.displayName ?? user.email}
                        </p>
                        <p className="mt-0.5 truncate text-[11px] text-text-muted">
                          {user.email}
                        </p>
                        <p className="mt-1 text-[10px] text-text-secondary">
                          {user.friends.length} amici · {user.recentWatches.length}{" "}
                          visioni
                        </p>
                      </button>
                    </li>
                  );
                })
              )}
            </ul>
          </div>

          <div className="min-h-0 rounded-2xl border border-white/[0.07] bg-white/[0.01] p-4 sm:p-5">
            {selectedCloudUser ? (
              <CloudUserDetail user={selectedCloudUser} />
            ) : (
              <p className="flex min-h-[240px] items-center justify-center text-[14px] text-text-muted">
                Seleziona un utente dalla lista
              </p>
            )}
          </div>
        </div>
      ) : (
        <div className="grid min-h-[420px] gap-4 lg:grid-cols-[minmax(240px,300px)_1fr]">
          <div className="flex max-h-[min(70vh,680px)] flex-col overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.02]">
            <p className="border-b border-white/[0.06] px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">
              Profili ({filteredLocal.length})
            </p>
            <ul className="min-h-0 flex-1 overflow-y-auto p-2">
              {filteredLocal.length === 0 ? (
                <li className="px-3 py-6 text-center text-[13px] text-text-muted">
                  Nessun profilo locale.
                </li>
              ) : (
                filteredLocal.map((profile) => {
                  const selected = profile.id === selectedLocalId;
                  return (
                    <li key={profile.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedLocalId(profile.id)}
                        className={`mb-1 w-full rounded-xl px-3 py-3 text-left transition-colors ${
                          selected
                            ? "bg-accent/15 ring-1 ring-accent/30"
                            : "hover:bg-white/[0.04]"
                        }`}
                      >
                        <p className="truncate font-medium text-text-primary">
                          {profile.name}
                        </p>
                        <p className="mt-0.5 text-[11px] capitalize text-text-muted">
                          {profile.role}
                        </p>
                        <p className="mt-1 text-[10px] text-text-secondary">
                          {profile.friends.length} amici ·{" "}
                          {profile.recentSessions.length} visioni
                        </p>
                      </button>
                    </li>
                  );
                })
              )}
            </ul>
          </div>

          <div className="min-h-0 rounded-2xl border border-white/[0.07] bg-white/[0.01] p-4 sm:p-5">
            {selectedLocalProfile ? (
              <LocalProfileDetail profile={selectedLocalProfile} />
            ) : (
              <p className="flex min-h-[240px] items-center justify-center text-[14px] text-text-muted">
                Seleziona un profilo dalla lista
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
