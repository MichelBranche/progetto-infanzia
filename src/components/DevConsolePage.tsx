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
  Terminal,
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

type DevTab = "cloud" | "local" | "feedback";

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
          {user.appVersion && (
            <div className="flex justify-between gap-3 rounded-lg bg-black/20 px-3 py-2">
              <dt className="text-text-muted">Versione app</dt>
              <dd className="font-mono text-text-primary">v{user.appVersion}</dd>
            </div>
          )}
          {user.platform && (
            <div className="flex justify-between gap-3 rounded-lg bg-black/20 px-3 py-2">
              <dt className="text-text-muted">Piattaforma</dt>
              <dd className="capitalize text-text-primary">{user.platform}</dd>
            </div>
          )}
        </dl>
        <div className="mt-5 border-t border-white/[0.06] pt-4">
          <button
            type="button"
            disabled={deleteBusy}
            onClick={onDelete}
            className="inline-flex items-center gap-2 rounded-full border border-red-500/30 bg-red-500/10 px-4 py-2 text-[12px] font-medium text-red-300 transition-colors hover:bg-red-500/15 disabled:opacity-50"
          >
            {deleteBusy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Trash2 className="h-3.5 w-3.5" />
            )}
            Elimina account
          </button>
        </div>
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
      <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] px-5 py-4">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-wider ${feedbackTypeBadge(item.type)}`}
          >
            <FeedbackTypeIcon type={item.type} />
            {feedbackTypeLabel(item.type)}
          </span>
          {item.status === "resolved" && !inTrash && (
            <span className="rounded-full border border-mint/25 bg-mint/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-mint">
              Risolto
            </span>
          )}
          {inTrash && (
            <span className="rounded-full border border-white/15 bg-white/[0.04] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-text-muted">
              Nel cestino
            </span>
          )}
          <span className="text-[12px] text-text-muted">{formatWhen(item.createdAt)}</span>
        </div>
        {item.subject && (
          <h3 className="font-display mt-3 text-xl font-semibold text-text-primary">
            {item.subject}
          </h3>
        )}
        <p className="mt-3 whitespace-pre-wrap text-[14px] leading-relaxed text-text-secondary">
          {item.message}
        </p>
      </div>

      <dl className="grid gap-2 text-[12px] sm:grid-cols-2">
        <div className="flex justify-between gap-3 rounded-lg bg-black/20 px-3 py-2">
          <dt className="text-text-muted">Profilo</dt>
          <dd className="text-right text-text-primary">
            {item.profileName}
            <span className="text-text-muted"> · {item.profileRole}</span>
          </dd>
        </div>
        {item.appVersion && (
          <div className="flex justify-between gap-3 rounded-lg bg-black/20 px-3 py-2">
            <dt className="text-text-muted">Versione app</dt>
            <dd className="font-mono text-text-primary">{item.appVersion}</dd>
          </div>
        )}
        {item.platform && (
          <div className="flex justify-between gap-3 rounded-lg bg-black/20 px-3 py-2">
            <dt className="text-text-muted">Piattaforma</dt>
            <dd className="capitalize text-text-primary">{item.platform}</dd>
          </div>
        )}
        {item.context?.activeNav && (
          <div className="flex justify-between gap-3 rounded-lg bg-black/20 px-3 py-2">
            <dt className="text-text-muted">Sezione attiva</dt>
            <dd className="text-text-primary">{item.context.activeNav}</dd>
          </div>
        )}
        {item.userId && (
          <div className="flex justify-between gap-3 rounded-lg bg-black/20 px-3 py-2 sm:col-span-2">
            <dt className="text-text-muted">User ID</dt>
            <dd className="truncate font-mono text-[11px] text-text-secondary">
              {item.userId}
            </dd>
          </div>
        )}
        {item.resolvedAt && (
          <div className="flex justify-between gap-3 rounded-lg bg-black/20 px-3 py-2">
            <dt className="text-text-muted">Risolto il</dt>
            <dd className="text-text-primary">{formatWhen(item.resolvedAt)}</dd>
          </div>
        )}
        {inTrash && item.deletedAt && (
          <div className="flex justify-between gap-3 rounded-lg bg-black/20 px-3 py-2 sm:col-span-2">
            <dt className="text-text-muted">Eliminazione definitiva</dt>
            <dd className="text-text-primary">
              {purgeDays === 0
                ? "In corso al prossimo aggiornamento"
                : `Tra ${purgeDays} giorni (${FEEDBACK_TRASH_RETENTION_DAYS} giorni nel cestino)`}
            </dd>
          </div>
        )}
      </dl>

      <div className="flex flex-wrap gap-2 border-t border-white/[0.06] pt-4">
        {!inTrash && item.status === "open" && (
          <button
            type="button"
            disabled={busy}
            onClick={onResolve}
            className="inline-flex items-center gap-2 rounded-full border border-mint/25 bg-mint/10 px-4 py-2 text-[12px] font-medium text-mint transition-colors hover:bg-mint/15 disabled:opacity-50"
          >
            {busy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <CheckCircle2 className="h-3.5 w-3.5" />
            )}
            Segna come risolto
          </button>
        )}
        {!inTrash && item.status === "resolved" && (
          <button
            type="button"
            disabled={busy}
            onClick={onReopen}
            className="inline-flex items-center gap-2 rounded-full border border-white/10 px-4 py-2 text-[12px] font-medium text-text-secondary transition-colors hover:bg-white/[0.04] disabled:opacity-50"
          >
            {busy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RotateCcw className="h-3.5 w-3.5" />
            )}
            Riapri
          </button>
        )}
        {!inTrash && (
          <button
            type="button"
            disabled={busy}
            onClick={onTrash}
            className="inline-flex items-center gap-2 rounded-full border border-warm/25 bg-warm/10 px-4 py-2 text-[12px] font-medium text-warm transition-colors hover:bg-warm/15 disabled:opacity-50"
          >
            {busy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Trash2 className="h-3.5 w-3.5" />
            )}
            Sposta nel cestino
          </button>
        )}
        {inTrash && (
          <button
            type="button"
            disabled={busy}
            onClick={onRestore}
            className="inline-flex items-center gap-2 rounded-full border border-accent/25 bg-accent/10 px-4 py-2 text-[12px] font-medium text-accent transition-colors hover:bg-accent/15 disabled:opacity-50"
          >
            {busy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RotateCcw className="h-3.5 w-3.5" />
            )}
            Ripristina
          </button>
        )}
      </div>
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
  const [feedbackTypeFilter, setFeedbackTypeFilter] = useState<FeedbackType | "all">(
    "all",
  );
  const [feedbackBucket, setFeedbackBucket] = useState<FeedbackBucket>("inbox");
  const [feedbackActionBusy, setFeedbackActionBusy] = useState(false);
  const [deleteUserBusy, setDeleteUserBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cloudUsers, setCloudUsers] = useState<DevCloudUser[]>([]);
  const [localProfiles, setLocalProfiles] = useState<DevLocalProfileInsight[]>(
    [],
  );
  const [feedbackItems, setFeedbackItems] = useState<AppFeedbackRecord[]>([]);
  const [feedbackWarning, setFeedbackWarning] = useState<string | null>(null);
  const [selectedCloudId, setSelectedCloudId] = useState<string | null>(null);
  const [selectedLocalId, setSelectedLocalId] = useState<string | null>(null);
  const [selectedFeedbackId, setSelectedFeedbackId] = useState<string | null>(
    null,
  );

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

      if (cloudResult.status === "rejected") {
        throw cloudResult.reason;
      }
      if (localResult.status === "rejected") {
        throw localResult.reason;
      }

      const cloud = cloudResult.value;
      const local = localResult.value;
      const feedback =
        feedbackResult.status === "fulfilled" ? feedbackResult.value : [];

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
        prev && cloud.some((u) => u.userId === prev)
          ? prev
          : (cloud[0]?.userId ?? null),
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
    return localProfiles.filter((profile) =>
      profile.name.toLowerCase().includes(q),
    );
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

      if (feedbackTypeFilter !== "all" && item.type !== feedbackTypeFilter) {
        return false;
      }
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
  const inboxCount = feedbackItems.filter(
    (item) => !item.deletedAt && item.status === "open",
  ).length;
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

  const handleDeleteCloudUser = useCallback(
    async (user: DevCloudUser) => {
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
    },
    [],
  );

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
              Utenti cloud, profili locali e feedback inviati dagli utenti
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
        {stats.map((stat) => (
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
          {(
            [
              ["cloud", "Utenti cloud"],
              ["local", "Profili locali"],
              ["feedback", "Feedback"],
            ] as const
          ).map(([id, label]) => (
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
              {label}
            </button>
          ))}
        </div>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={
            tab === "feedback"
              ? "Cerca messaggio, oggetto o profilo…"
              : "Cerca email, nome o profilo…"
          }
          className="w-full rounded-full border border-white/10 bg-black/20 px-4 py-2.5 text-[13px] text-text-primary outline-none placeholder:text-text-muted focus:border-accent/40 sm:max-w-xs"
        />
      </div>

      {tab === "feedback" && feedbackWarning && (
        <div className="mb-5 rounded-2xl border border-warm/25 bg-warm/10 px-4 py-3 text-[13px] text-warm">
          {feedbackWarning}
        </div>
      )}

      {tab === "feedback" && (
        <div className="mb-5 flex flex-wrap gap-2">
          {(
            [
              ["inbox", "Da fare"],
              ["resolved", "Risolti"],
              ["trash", "Cestino"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => {
                setFeedbackBucket(id);
                setSelectedFeedbackId(null);
              }}
              className={`rounded-full border px-3 py-1.5 text-[11px] font-medium transition-colors ${
                feedbackBucket === id
                  ? "border-accent/40 bg-accent/15 text-accent"
                  : "border-white/10 text-text-muted hover:border-white/20 hover:text-text-secondary"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {tab === "feedback" && feedbackBucket !== "trash" && (
        <div className="mb-5 flex flex-wrap gap-2">
          {(
            [
              ["all", "Tutti"],
              ["bug", "Bug"],
              ["feedback", "Feedback"],
              ["feature", "Funzioni"],
              ["title", "Titoli"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setFeedbackTypeFilter(id)}
              className={`rounded-full border px-3 py-1.5 text-[11px] font-medium transition-colors ${
                feedbackTypeFilter === id
                  ? "border-accent/40 bg-accent/15 text-accent"
                  : "border-white/10 text-text-muted hover:border-white/20 hover:text-text-secondary"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      )}

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
                          {user.appVersion ? ` · v${user.appVersion}` : ""}
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
              <CloudUserDetail
                user={selectedCloudUser}
                deleteBusy={deleteUserBusy}
                onDelete={() => void handleDeleteCloudUser(selectedCloudUser)}
              />
            ) : (
              <p className="flex min-h-[240px] items-center justify-center text-[14px] text-text-muted">
                Seleziona un utente dalla lista
              </p>
            )}
          </div>
        </div>
      ) : tab === "local" ? (
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
      ) : (
        <div className="grid min-h-[420px] gap-4 lg:grid-cols-[minmax(240px,300px)_1fr]">
          <div className="flex max-h-[min(70vh,680px)] flex-col overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.02]">
            <p className="border-b border-white/[0.06] px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">
              {feedbackBucket === "trash"
                ? "Cestino"
                : feedbackBucket === "resolved"
                  ? "Risolti"
                  : "Da fare"}{" "}
              ({filteredFeedback.length})
            </p>
            <ul className="min-h-0 flex-1 overflow-y-auto p-2">
              {filteredFeedback.length === 0 ? (
                <li className="px-3 py-6 text-center text-[13px] text-text-muted">
                  Nessun feedback trovato.
                </li>
              ) : (
                filteredFeedback.map((item) => {
                  const selected = item.id === selectedFeedbackId;
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedFeedbackId(item.id)}
                        className={`mb-1 w-full rounded-xl px-3 py-3 text-left transition-colors ${
                          selected
                            ? "bg-accent/15 ring-1 ring-accent/30"
                            : "hover:bg-white/[0.04]"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span
                            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-medium uppercase tracking-wider ${feedbackTypeBadge(item.type)}`}
                          >
                            <FeedbackTypeIcon type={item.type} />
                            {feedbackTypeLabel(item.type)}
                          </span>
                          {item.status === "resolved" && feedbackBucket !== "trash" && (
                            <span className="text-[9px] font-medium uppercase tracking-wider text-mint">
                              Risolto
                            </span>
                          )}
                          <span className="text-[10px] text-text-muted">
                            {formatWhen(item.createdAt)}
                          </span>
                        </div>
                        <p className="mt-2 truncate font-medium text-text-primary">
                          {item.subject ?? item.message}
                        </p>
                        <p className="mt-0.5 truncate text-[11px] text-text-muted">
                          {item.profileName} · {item.profileRole}
                        </p>
                      </button>
                    </li>
                  );
                })
              )}
            </ul>
          </div>

          <div className="min-h-0 rounded-2xl border border-white/[0.07] bg-white/[0.01] p-4 sm:p-5">
            {selectedFeedback ? (
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
                  void runFeedbackAction(() =>
                    setFeedbackStatus(selectedFeedback.id, "open"),
                  )
                }
                onTrash={() =>
                  void runFeedbackAction(() =>
                    moveFeedbackToTrash(selectedFeedback.id),
                  )
                }
                onRestore={() =>
                  void runFeedbackAction(() =>
                    restoreFeedbackFromTrash(selectedFeedback.id),
                  )
                }
              />
            ) : (
              <p className="flex min-h-[240px] items-center justify-center text-[14px] text-text-muted">
                Nessun messaggio da mostrare
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
