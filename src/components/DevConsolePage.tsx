import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bug,
  CheckCircle2,
  Film,
  Lightbulb,
  Loader2,
  MessageSquare,
  RotateCcw,
  Shield,
  Trash2,
  UserRound,
  Users,
} from "lucide-react";
import { formatDuration } from "../types/media";
import {
  fetchDevCloudUsers,
  fetchDevFeedback,
  fetchDevLocalDashboard,
  deleteDevCloudUser,
  moveFeedbackToTrash,
  restoreFeedbackFromTrash,
  setFeedbackStatus,
} from "../lib/devAdminApi";
import type { DevCloudUser, DevLocalProfileInsight } from "../types/devAdmin";
import {
  feedbackDaysUntilPurge,
  feedbackTypeLabel,
  FEEDBACK_TRASH_RETENTION_DAYS,
  type AppFeedbackRecord,
  type FeedbackBucket,
  type FeedbackType,
} from "../types/feedback";
import {
  DevActionBar,
  DevActionButton,
  DevBadge,
  DevChip,
  DevDetailHeader,
  DevDetailPane,
  DevErrorBanner,
  DevFilterRow,
  DevHero,
  DevListItem,
  DevLoadingState,
  DevMasterDetail,
  DevMetaGrid,
  DevRowItem,
  DevRowList,
  DevSearchInput,
  DevSidebar,
  DevStatsGrid,
  DevUserAvatar,
  DevWarningBanner,
  ProfileEmptyState,
  ProfileSectionLabel,
  ProfileTabBar,
} from "./dev/DevConsoleUi";

type DevTab = "cloud" | "local" | "feedback";

const MAIN_TABS: { id: DevTab; label: string; icon: typeof Users }[] = [
  { id: "cloud", label: "Utenti cloud", icon: Users },
  { id: "local", label: "Profili locali", icon: UserRound },
  { id: "feedback", label: "Feedback", icon: MessageSquare },
];

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

function isCloudUserOnline(user: DevCloudUser) {
  return user.presenceStatus === "online" || user.presenceStatus === "away";
}

function feedbackTypeBadge(type: FeedbackType): string {
  switch (type) {
    case "bug":
      return "border-warm/30 bg-warm/10 text-warm";
    case "feedback":
      return "border-accent/30 bg-accent/10 text-accent";
    case "feature":
      return "border-sky-400/25 bg-sky-400/10 text-sky-300";
    case "title":
      return "border-mint/25 bg-mint/10 text-mint";
    default:
      return "border-white/10 bg-white/[0.04] text-text-muted";
  }
}

function FeedbackTypeIcon({ type }: { type: FeedbackType }) {
  const className = "h-3.5 w-3.5";
  switch (type) {
    case "bug":
      return <Bug className={className} />;
    case "feature":
      return <Lightbulb className={className} />;
    case "title":
      return <Film className={className} />;
    default:
      return <MessageSquare className={className} />;
  }
}

function CloudUserDetail({
  user,
  deleteBusy,
  onDelete,
}: {
  user: DevCloudUser;
  deleteBusy: boolean;
  onDelete: () => void;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6">
      <DevDetailHeader
        title={user.displayName ?? user.email}
        subtitle={user.email}
        avatar={
          <DevUserAvatar
            name={user.displayName ?? user.email}
            online={user.hasProfile ? isCloudUserOnline(user) : undefined}
          />
        }
        badges={
          user.hasProfile ? (
            <DevBadge tone="mint">Registrato</DevBadge>
          ) : (
            <DevBadge tone="warm">Solo auth</DevBadge>
          )
        }
      />

      <DevMetaGrid
        items={[
          { label: "Creato", value: formatWhen(user.authCreatedAt) },
          { label: "Ultimo accesso", value: formatWhen(user.lastSignInAt) },
          { label: "Stato", value: presenceLabel(user) },
          ...(user.friendCode
            ? [{ label: "Codice amico", value: <span className="font-mono">{user.friendCode}</span> }]
            : []),
          ...(user.appVersion
            ? [{ label: "Versione app", value: <span className="font-mono">v{user.appVersion}</span> }]
            : []),
          ...(user.platform
            ? [{ label: "Piattaforma", value: <span className="capitalize">{user.platform}</span> }]
            : []),
        ]}
      />

      <DevActionBar>
        <DevActionButton tone="danger" disabled={deleteBusy} onClick={onDelete} icon={deleteBusy ? Loader2 : Trash2}>
          {deleteBusy ? "Eliminazione…" : "Elimina account"}
        </DevActionButton>
      </DevActionBar>

      <section>
        <ProfileSectionLabel>{`Amici (${user.friends.length})`}</ProfileSectionLabel>
        {!user.hasProfile ? (
          <ProfileEmptyState
            icon={Users}
            title="Nessun dato amici"
            description="Utente senza profilo app collegato."
          />
        ) : user.friends.length === 0 ? (
          <ProfileEmptyState
            icon={Users}
            title="Nessun amico"
            description="Nessuna amicizia cloud accettata."
          />
        ) : (
          <DevRowList>
            {user.friends.map((friend) => (
              <DevRowItem
                key={friend.friendId}
                title={friend.displayName}
                subtitle={friend.email}
                trailing={<span className="font-mono text-text-secondary">{friend.friendCode}</span>}
              />
            ))}
          </DevRowList>
        )}
      </section>

      <section className="min-h-0 flex-1">
        <ProfileSectionLabel>{`Titoli guardati (${user.recentWatches.length})`}</ProfileSectionLabel>
        {!user.hasProfile ? (
          <ProfileEmptyState
            icon={Film}
            title="Nessuna cronologia"
            description="Utente senza profilo app sul cloud."
          />
        ) : user.recentWatches.length === 0 ? (
          <ProfileEmptyState
            icon={Film}
            title="Nessuna visione"
            description="I dati compaiono quando l'utente guarda contenuti con l'app aggiornata."
          />
        ) : (
          <DevRowList maxHeight="max-h-[min(52vh,520px)]">
            {user.recentWatches.map((watch, index) => (
              <DevRowItem
                key={`${watch.watchedAt}-${watch.titleName}-${index}`}
                title={watch.titleName}
                subtitle={watch.episodeLabel}
                trailing={
                  <>
                    <p>{formatWhen(watch.watchedAt)}</p>
                    <p className="tabular-nums">{formatDuration(watch.secondsWatched)}</p>
                  </>
                }
              />
            ))}
          </DevRowList>
        )}
      </section>
    </div>
  );
}

function FeedbackDetail({
  item,
  bucket,
  busy,
  onResolve,
  onReopen,
  onTrash,
  onRestore,
}: {
  item: AppFeedbackRecord;
  bucket: FeedbackBucket;
  busy: boolean;
  onResolve: () => void;
  onReopen: () => void;
  onTrash: () => void;
  onRestore: () => void;
}) {
  const inTrash = bucket === "trash";
  const purgeDays = item.deletedAt ? feedbackDaysUntilPurge(item.deletedAt) : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5">
      <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] px-5 py-4">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-wider ${feedbackTypeBadge(item.type)}`}
          >
            <FeedbackTypeIcon type={item.type} />
            {feedbackTypeLabel(item.type)}
          </span>
          {item.status === "resolved" && !inTrash && <DevBadge tone="mint">Risolto</DevBadge>}
          {inTrash && <DevBadge tone="neutral">Nel cestino</DevBadge>}
          <span className="text-[12px] text-text-muted">{formatWhen(item.createdAt)}</span>
        </div>
        {item.subject && (
          <h3 className="font-display mt-4 text-xl font-semibold tracking-[-0.03em] text-text-primary">
            {item.subject}
          </h3>
        )}
        <p className="mt-3 whitespace-pre-wrap text-[14px] leading-relaxed text-text-secondary">
          {item.message}
        </p>
      </div>

      <DevMetaGrid
        items={[
          {
            label: "Profilo",
            value: (
              <>
                {item.profileName}
                <span className="text-text-muted"> · {item.profileRole}</span>
              </>
            ),
          },
          ...(item.appVersion
            ? [{ label: "Versione app", value: <span className="font-mono">{item.appVersion}</span> }]
            : []),
          ...(item.platform
            ? [{ label: "Piattaforma", value: <span className="capitalize">{item.platform}</span> }]
            : []),
          ...(item.context?.activeNav
            ? [{ label: "Sezione attiva", value: item.context.activeNav }]
            : []),
          ...(item.userId
            ? [
                {
                  label: "User ID",
                  value: (
                    <span className="block max-w-[200px] truncate font-mono text-[11px] text-text-secondary sm:max-w-none">
                      {item.userId}
                    </span>
                  ),
                },
              ]
            : []),
          ...(item.resolvedAt
            ? [{ label: "Risolto il", value: formatWhen(item.resolvedAt) }]
            : []),
          ...(inTrash && item.deletedAt
            ? [
                {
                  label: "Eliminazione definitiva",
                  value:
                    purgeDays === 0
                      ? "Al prossimo aggiornamento"
                      : `Tra ${purgeDays} giorni (${FEEDBACK_TRASH_RETENTION_DAYS} nel cestino)`,
                },
              ]
            : []),
        ]}
      />

      <DevActionBar>
        {!inTrash && item.status === "open" && (
          <DevActionButton tone="mint" disabled={busy} onClick={onResolve} icon={busy ? Loader2 : CheckCircle2}>
            Segna come risolto
          </DevActionButton>
        )}
        {!inTrash && item.status === "resolved" && (
          <DevActionButton tone="neutral" disabled={busy} onClick={onReopen} icon={busy ? Loader2 : RotateCcw}>
            Riapri
          </DevActionButton>
        )}
        {!inTrash && (
          <DevActionButton tone="warm" disabled={busy} onClick={onTrash} icon={busy ? Loader2 : Trash2}>
            Sposta nel cestino
          </DevActionButton>
        )}
        {inTrash && (
          <DevActionButton tone="accent" disabled={busy} onClick={onRestore} icon={busy ? Loader2 : RotateCcw}>
            Ripristina
          </DevActionButton>
        )}
      </DevActionBar>
    </div>
  );
}

function LocalProfileDetail({ profile }: { profile: DevLocalProfileInsight }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6">
      <DevDetailHeader
        title={profile.name}
        subtitle="Profilo locale su questo dispositivo"
        avatar={<DevUserAvatar name={profile.name} />}
        badges={<DevBadge tone="accent">{profile.role}</DevBadge>}
      />

      <section>
        <ProfileSectionLabel>{`Amici (${profile.friends.length})`}</ProfileSectionLabel>
        {profile.friends.length === 0 ? (
          <ProfileEmptyState
            icon={Users}
            title="Nessun amico"
            description="Nessun amico LAN aggiunto da questo profilo."
          />
        ) : (
          <DevRowList>
            {profile.friends.map((friend) => (
              <DevRowItem
                key={friend.friendCode}
                title={friend.displayName}
                subtitle={friend.lastHost ? `Host: ${friend.lastHost}` : undefined}
                trailing={
                  <>
                    <p className="font-mono text-text-secondary">{friend.friendCode}</p>
                    <p>{formatWhen(friend.addedAt)}</p>
                  </>
                }
              />
            ))}
          </DevRowList>
        )}
      </section>

      <section className="min-h-0 flex-1">
        <ProfileSectionLabel>{`Titoli guardati (${profile.recentSessions.length})`}</ProfileSectionLabel>
        {profile.recentSessions.length === 0 ? (
          <ProfileEmptyState
            icon={Film}
            title="Nessuna sessione"
            description="Nessuna visione registrata su questo profilo."
          />
        ) : (
          <DevRowList maxHeight="max-h-[min(52vh,520px)]">
            {profile.recentSessions.map((session) => (
              <DevRowItem
                key={session.id}
                title={session.mediaTitle}
                subtitle={`${session.sourceKind === "addon" ? "Streaming" : "Libreria locale"}${session.completed ? " · completato" : ""}`}
                trailing={
                  <>
                    <p>{formatWhen(session.startedAt)}</p>
                    <p className="tabular-nums">{formatDuration(session.secondsWatched)}</p>
                  </>
                }
              />
            ))}
          </DevRowList>
        )}
      </section>
    </div>
  );
}

export function DevConsolePage() {
  const [tab, setTab] = useState<DevTab>("cloud");
  const [query, setQuery] = useState("");
  const [feedbackTypeFilter, setFeedbackTypeFilter] = useState<FeedbackType | "all">("all");
  const [feedbackBucket, setFeedbackBucket] = useState<FeedbackBucket>("inbox");
  const [feedbackActionBusy, setFeedbackActionBusy] = useState(false);
  const [deleteUserBusy, setDeleteUserBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cloudUsers, setCloudUsers] = useState<DevCloudUser[]>([]);
  const [localProfiles, setLocalProfiles] = useState<DevLocalProfileInsight[]>([]);
  const [feedbackItems, setFeedbackItems] = useState<AppFeedbackRecord[]>([]);
  const [feedbackWarning, setFeedbackWarning] = useState<string | null>(null);
  const [selectedCloudId, setSelectedCloudId] = useState<string | null>(null);
  const [selectedLocalId, setSelectedLocalId] = useState<string | null>(null);
  const [selectedFeedbackId, setSelectedFeedbackId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setFeedbackWarning(null);
    try {
      const [cloudResult, localResult, feedbackResult] = await Promise.allSettled([
        fetchDevCloudUsers(),
        fetchDevLocalDashboard(),
        fetchDevFeedback(),
      ]);

      if (cloudResult.status === "rejected") throw cloudResult.reason;
      if (localResult.status === "rejected") throw localResult.reason;

      const cloud = cloudResult.value;
      const local = localResult.value;
      const feedback = feedbackResult.status === "fulfilled" ? feedbackResult.value : [];

      if (feedbackResult.status === "rejected") {
        const message =
          feedbackResult.reason instanceof Error
            ? feedbackResult.reason.message
            : String(feedbackResult.reason);
        setFeedbackWarning(
          message.includes("app_feedback")
            ? "Tabella feedback non ancora creata su Supabase."
            : message,
        );
      }

      setCloudUsers(cloud);
      setLocalProfiles(local.profiles);
      setFeedbackItems(feedback);
      setSelectedCloudId((prev) =>
        prev && cloud.some((u) => u.userId === prev) ? prev : (cloud[0]?.userId ?? null),
      );
      setSelectedLocalId((prev) =>
        prev && local.profiles.some((p) => p.id === prev)
          ? prev
          : (local.profiles[0]?.id ?? null),
      );
      setSelectedFeedbackId((prev) =>
        prev && feedback.some((item) => item.id === prev)
          ? prev
          : (feedback[0]?.id ?? null),
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
    return localProfiles.filter((profile) => profile.name.toLowerCase().includes(q));
  }, [localProfiles, query]);

  const filteredFeedback = useMemo(() => {
    const q = query.trim().toLowerCase();
    return feedbackItems.filter((item) => {
      const inTrash = Boolean(item.deletedAt);
      if (feedbackBucket === "trash") {
        if (!inTrash) return false;
      } else if (inTrash) {
        return false;
      } else if (feedbackBucket === "resolved" && item.status !== "resolved") {
        return false;
      } else if (feedbackBucket === "inbox" && item.status !== "open") {
        return false;
      }
      if (feedbackTypeFilter !== "all" && item.type !== feedbackTypeFilter) return false;
      if (!q) return true;
      return (
        item.message.toLowerCase().includes(q) ||
        item.subject?.toLowerCase().includes(q) ||
        item.profileName.toLowerCase().includes(q)
      );
    });
  }, [feedbackItems, query, feedbackTypeFilter, feedbackBucket]);

  const selectedCloudUser = useMemo(
    () => cloudUsers.find((u) => u.userId === selectedCloudId) ?? null,
    [cloudUsers, selectedCloudId],
  );

  const selectedLocalProfile = useMemo(
    () => localProfiles.find((p) => p.id === selectedLocalId) ?? null,
    [localProfiles, selectedLocalId],
  );

  const selectedFeedback = useMemo(
    () => feedbackItems.find((item) => item.id === selectedFeedbackId) ?? null,
    [feedbackItems, selectedFeedbackId],
  );

  const registeredCount = cloudUsers.filter((u) => u.hasProfile).length;
  const unregisteredCount = cloudUsers.length - registeredCount;
  const inboxCount = feedbackItems.filter((item) => !item.deletedAt && item.status === "open").length;
  const resolvedCount = feedbackItems.filter(
    (item) => !item.deletedAt && item.status === "resolved",
  ).length;
  const trashCount = feedbackItems.filter((item) => item.deletedAt).length;

  const runFeedbackAction = useCallback(
    async (action: () => Promise<void>) => {
      setFeedbackActionBusy(true);
      try {
        await action();
        const feedback = await fetchDevFeedback();
        setFeedbackItems(feedback);
        setSelectedFeedbackId((prev) =>
          prev && feedback.some((item) => item.id === prev)
            ? prev
            : (feedback.find((item) => {
                if (feedbackBucket === "trash") return item.deletedAt;
                if (feedbackBucket === "resolved") {
                  return !item.deletedAt && item.status === "resolved";
                }
                return !item.deletedAt && item.status === "open";
              })?.id ?? null),
        );
      } finally {
        setFeedbackActionBusy(false);
      }
    },
    [feedbackBucket],
  );

  const handleDeleteCloudUser = useCallback(async (user: DevCloudUser) => {
    const label = user.displayName ?? user.email;
    const confirmed = window.confirm(
      `Eliminare definitivamente l'account di ${label}?\n\nVerranno rimossi profilo, amici, presenza e dati cloud collegati. L'azione non è reversibile.`,
    );
    if (!confirmed) return;

    setDeleteUserBusy(true);
    try {
      await deleteDevCloudUser(user.userId);
      const cloud = await fetchDevCloudUsers();
      setCloudUsers(cloud);
      setSelectedCloudId((prev) => {
        if (prev && cloud.some((u) => u.userId === prev)) return prev;
        return cloud[0]?.userId ?? null;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setDeleteUserBusy(false);
    }
  }, []);

  const stats =
    tab === "feedback"
      ? [
          { label: "Da fare", value: inboxCount, icon: MessageSquare },
          { label: "Risolti", value: resolvedCount, icon: CheckCircle2 },
          { label: "Cestino", value: trashCount, icon: Trash2 },
        ]
      : [
          { label: "Utenti auth", value: cloudUsers.length, icon: Users },
          { label: "Con profilo", value: registeredCount, icon: Shield },
          { label: "Solo auth", value: unregisteredCount, icon: UserRound },
        ];

  if (loading) {
    return (
      <>
        <DevHero onRefresh={() => void load()} refreshing />
        <DevLoadingState />
      </>
    );
  }

  if (error) {
    return (
      <>
        <DevHero onRefresh={() => void load()} />
        <DevErrorBanner message={error} />
      </>
    );
  }

  return (
    <>
      <DevHero onRefresh={() => void load()} refreshing={loading} />
      <DevStatsGrid stats={stats} />

      <div className="page-px mx-auto mt-8 flex max-w-5xl justify-center">
        <ProfileTabBar tabs={MAIN_TABS} active={tab} onChange={setTab} />
      </div>

      <DevFilterRow
        trailing={
          <DevSearchInput
            value={query}
            onChange={setQuery}
            placeholder={
              tab === "feedback"
                ? "Cerca messaggio, oggetto o profilo…"
                : "Cerca email, nome o profilo…"
            }
          />
        }
      >
        {tab === "feedback" &&
          (
            [
              ["inbox", "Da fare"],
              ["resolved", "Risolti"],
              ["trash", "Cestino"],
            ] as const
          ).map(([id, label]) => (
            <DevChip
              key={id}
              active={feedbackBucket === id}
              onClick={() => {
                setFeedbackBucket(id);
                setSelectedFeedbackId(null);
              }}
            >
              {label}
            </DevChip>
          ))}
      </DevFilterRow>

      {tab === "feedback" && feedbackBucket !== "trash" && (
        <DevFilterRow>
          {(
            [
              ["all", "Tutti"],
              ["bug", "Bug"],
              ["feedback", "Feedback"],
              ["feature", "Funzioni"],
              ["title", "Titoli"],
            ] as const
          ).map(([id, label]) => (
            <DevChip
              key={id}
              active={feedbackTypeFilter === id}
              onClick={() => setFeedbackTypeFilter(id)}
            >
              {label}
            </DevChip>
          ))}
        </DevFilterRow>
      )}

      {tab === "feedback" && feedbackWarning && <DevWarningBanner message={feedbackWarning} />}

      {tab === "cloud" && (
        <DevMasterDetail
          sidebar={
            <DevSidebar title={`Utenti (${filteredCloud.length})`}>
              {filteredCloud.length === 0 ? (
                <p className="px-3 py-8 text-center text-[13px] text-text-muted">
                  Nessun utente trovato.
                </p>
              ) : (
                filteredCloud.map((user) => (
                  <DevListItem
                    key={user.userId}
                    selected={user.userId === selectedCloudId}
                    onClick={() => setSelectedCloudId(user.userId)}
                    title={user.displayName ?? user.email}
                    subtitle={user.email}
                    meta={`${user.friends.length} amici · ${user.recentWatches.length} visioni${user.appVersion ? ` · v${user.appVersion}` : ""}`}
                    leading={
                      <DevUserAvatar
                        name={user.displayName ?? user.email}
                        online={user.hasProfile ? isCloudUserOnline(user) : undefined}
                      />
                    }
                  />
                ))
              )}
            </DevSidebar>
          }
          detail={
            <DevDetailPane
              empty={
                <ProfileEmptyState
                  icon={Users}
                  title="Seleziona un utente"
                  description="Scegli un account dalla lista per vedere dettagli, amici e visioni."
                />
              }
            >
              {selectedCloudUser && (
                <CloudUserDetail
                  user={selectedCloudUser}
                  deleteBusy={deleteUserBusy}
                  onDelete={() => void handleDeleteCloudUser(selectedCloudUser)}
                />
              )}
            </DevDetailPane>
          }
        />
      )}

      {tab === "local" && (
        <DevMasterDetail
          sidebar={
            <DevSidebar title={`Profili (${filteredLocal.length})`}>
              {filteredLocal.length === 0 ? (
                <p className="px-3 py-8 text-center text-[13px] text-text-muted">
                  Nessun profilo locale.
                </p>
              ) : (
                filteredLocal.map((profile) => (
                  <DevListItem
                    key={profile.id}
                    selected={profile.id === selectedLocalId}
                    onClick={() => setSelectedLocalId(profile.id)}
                    title={profile.name}
                    subtitle={profile.role}
                    meta={`${profile.friends.length} amici · ${profile.recentSessions.length} visioni`}
                    leading={<DevUserAvatar name={profile.name} />}
                  />
                ))
              )}
            </DevSidebar>
          }
          detail={
            <DevDetailPane
              empty={
                <ProfileEmptyState
                  icon={UserRound}
                  title="Seleziona un profilo"
                  description="Scegli un profilo locale per vedere amici e cronologia visioni."
                />
              }
            >
              {selectedLocalProfile && <LocalProfileDetail profile={selectedLocalProfile} />}
            </DevDetailPane>
          }
        />
      )}

      {tab === "feedback" && (
        <DevMasterDetail
          sidebar={
            <DevSidebar
              title={`${
                feedbackBucket === "trash"
                  ? "Cestino"
                  : feedbackBucket === "resolved"
                    ? "Risolti"
                    : "Da fare"
              } (${filteredFeedback.length})`}
            >
              {filteredFeedback.length === 0 ? (
                <p className="px-3 py-8 text-center text-[13px] text-text-muted">
                  Nessun feedback trovato.
                </p>
              ) : (
                filteredFeedback.map((item) => (
                  <DevListItem
                    key={item.id}
                    selected={item.id === selectedFeedbackId}
                    onClick={() => setSelectedFeedbackId(item.id)}
                    title={item.subject ?? item.message}
                    subtitle={`${item.profileName} · ${item.profileRole}`}
                    meta={formatWhen(item.createdAt)}
                    leading={
                      <span
                        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border ${feedbackTypeBadge(item.type)}`}
                      >
                        <FeedbackTypeIcon type={item.type} />
                      </span>
                    }
                  />
                ))
              )}
            </DevSidebar>
          }
          detail={
            <DevDetailPane
              empty={
                <ProfileEmptyState
                  icon={MessageSquare}
                  title="Nessun messaggio"
                  description="Seleziona un feedback dalla lista per leggerlo e gestirlo."
                />
              }
            >
              {selectedFeedback && (
                <FeedbackDetail
                  item={selectedFeedback}
                  bucket={feedbackBucket}
                  busy={feedbackActionBusy}
                  onResolve={() =>
                    void runFeedbackAction(() =>
                      setFeedbackStatus(selectedFeedback.id, "resolved"),
                    )
                  }
                  onReopen={() =>
                    void runFeedbackAction(() => setFeedbackStatus(selectedFeedback.id, "open"))
                  }
                  onTrash={() =>
                    void runFeedbackAction(() => moveFeedbackToTrash(selectedFeedback.id))
                  }
                  onRestore={() =>
                    void runFeedbackAction(() => restoreFeedbackFromTrash(selectedFeedback.id))
                  }
                />
              )}
            </DevDetailPane>
          }
        />
      )}
    </>
  );
}
