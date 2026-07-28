import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Activity,
  Bug,
  CheckCircle2,
  Film,
  Lightbulb,
  Loader2,
  Megaphone,
  MessageSquare,
  RefreshCw,
  RotateCcw,
  Shield,
  ShieldBan,
  Skull,
  Terminal,
  Trash2,
  UserRound,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { formatDuration } from "../types/media";
import {
  banDevCloudUser,
  banDevIp,
  fetchDevCloudUsers,
  fetchDevFeedback,
  fetchDevLocalDashboard,
  deleteDevCloudUser,
  moveFeedbackToTrash,
  restoreFeedbackFromTrash,
  setFeedbackStatus,
  unbanDevCloudUser,
  unbanDevIp,
} from "../lib/devAdminApi";
import type {
  BanDurationHours,
  DevCloudUser,
  DevLocalProfileInsight,
} from "../types/devAdmin";
import { formatPlatformLabel } from "../lib/feedbackApi";
import { isAppOpenPresence } from "../lib/devDashboardMetrics";
import {
  feedbackDaysUntilPurge,
  feedbackTypeLabel,
  FEEDBACK_TRASH_RETENTION_DAYS,
  type AppFeedbackRecord,
  type FeedbackBucket,
  type FeedbackType,
} from "../types/feedback";
import {
  SettingsButton,
  SettingsField,
  SettingsInput,
  SettingsNavItem,
  SettingsPill,
  SettingsShell,
} from "./settings/SettingsUi";
import {
  DevActionBar,
  DevActionButton,
  DevBadge,
  DevChip,
  DevDetailHeader,
  DevDetailPane,
  DevErrorBanner,
  DevFilterRow,
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
} from "./dev/DevConsoleUi";
import { BroadcastAdminPanel } from "./dev/BroadcastAdminPanel";
import { DevOverviewPanel } from "./dev/DevOverviewPanel";
import { DevTop10Panel } from "./dev/DevTop10Panel";
import { DevPrankPanel } from "./dev/DevPrankPanel";

type DevTab = "overview" | "cloud" | "top10" | "feedback" | "broadcasts" | "pranks";

const LIVE_POLL_MS = 20_000;

const MAIN_TABS: Array<{
  id: DevTab;
  label: string;
  icon: LucideIcon;
  title: string;
  subtitle: string;
}> = [
  {
    id: "overview",
    label: "Overview",
    icon: Activity,
    title: "Overview",
    subtitle: "Metriche live: utenti nuovi, online e attività",
  },
  {
    id: "cloud",
    label: "Utenti cloud",
    icon: Users,
    title: "Utenti cloud",
    subtitle: "Account auth, profilo app, amici e visioni",
  },
  {
    id: "top10",
    label: "Top 10",
    icon: Film,
    title: "Top 10 Home",
    subtitle: "Sorgente della riga Top 10 vista da tutti",
  },
  {
    id: "feedback",
    label: "Feedback",
    icon: MessageSquare,
    title: "Feedback",
    subtitle: "Segnalazioni e richieste degli utenti",
  },
  {
    id: "broadcasts",
    label: "Messaggi",
    icon: Megaphone,
    title: "Messaggi admin",
    subtitle: "Popup a tutti gli utenti a nome di Amministrazione Branchefy",
  },
  {
    id: "pranks",
    label: "Scherzi",
    icon: Skull,
    title: "Scherzi utenti",
    subtitle: "Jumpscare e troll mirati a un singolo utente",
  },
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
  if (isAppOpenPresence(user)) {
    const status = (user.presenceStatus ?? "").toLowerCase();
    if (status === "away") return "Assente · app aperta";
    if (status === "dnd") return "Non disturbare · app aperta";
    return "Online · app aperta";
  }
  if (user.lastSeenAt) return `Visto ${formatWhen(user.lastSeenAt)}`;
  return "Offline";
}

function isCloudUserOnline(user: DevCloudUser) {
  return isAppOpenPresence(user);
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
      return "border-border bg-fill-muted text-text-muted";
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

const BAN_DURATION_OPTIONS: Array<{
  hours: BanDurationHours;
  label: string;
}> = [
  { hours: 24, label: "1 giorno" },
  { hours: 168, label: "7 giorni" },
  { hours: 720, label: "30 giorni" },
  { hours: null, label: "Permanente" },
];

function CloudUserDetail({
  user,
  deleteBusy,
  banBusy,
  onDelete,
  onBan,
  onUnban,
  onBanIp,
  onUnbanIp,
}: {
  user: DevCloudUser;
  deleteBusy: boolean;
  banBusy: boolean;
  onDelete: () => void;
  onBan: (input: {
    reason: string;
    durationHours: BanDurationHours;
    banIps: boolean;
  }) => void;
  onUnban: () => void;
  onBanIp: (input: {
    ip: string;
    reason: string;
    durationHours: BanDurationHours;
  }) => void;
  onUnbanIp: (ip: string) => void;
}) {
  const [banReason, setBanReason] = useState("");
  const [banDuration, setBanDuration] = useState<BanDurationHours>(24);
  const [banIps, setBanIps] = useState(true);
  const [manualIp, setManualIp] = useState("");
  const [manualIpReason, setManualIpReason] = useState("");
  const [manualIpDuration, setManualIpDuration] =
    useState<BanDurationHours>(24);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6">
      <DevDetailHeader
        title={user.displayName ?? user.email}
        subtitle={user.email}
        avatar={
          <DevUserAvatar
            name={user.displayName ?? user.email}
            imageUrl={user.avatarUrl}
            online={user.hasProfile ? isCloudUserOnline(user) : undefined}
          />
        }
        badges={
          <>
            {user.banned ? (
              <DevBadge tone="warm">Bannato</DevBadge>
            ) : user.hasProfile ? (
              <DevBadge tone="mint">Registrato</DevBadge>
            ) : (
              <DevBadge tone="warm">Solo auth</DevBadge>
            )}
            {user.hasProfile && user.banned ? (
              <DevBadge tone="mint">Registrato</DevBadge>
            ) : null}
          </>
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
            ? [{ label: "Piattaforma", value: formatPlatformLabel(user.platform) }]
            : []),
          ...(user.banned
            ? [
                {
                  label: "Ban",
                  value: user.banExpiresAt
                    ? `Scade ${formatWhen(user.banExpiresAt)}`
                    : "Permanente",
                },
                ...(user.banReason
                  ? [{ label: "Motivo ban", value: user.banReason }]
                  : []),
              ]
            : []),
        ]}
      />

      <section className="space-y-3 rounded-2xl border border-warm/20 bg-warm/[0.04] p-4">
        <ProfileSectionLabel>Ban account + IP</ProfileSectionLabel>
        {user.banned ? (
          <DevActionBar>
            <DevActionButton
              tone="mint"
              disabled={banBusy}
              onClick={onUnban}
              icon={banBusy ? Loader2 : Shield}
            >
              {banBusy ? "Sbanno…" : "Sbanna utente (+ IP collegati)"}
            </DevActionButton>
          </DevActionBar>
        ) : (
          <>
            <SettingsField label="Motivo (opzionale)">
              <SettingsInput
                value={banReason}
                onChange={(e) => setBanReason(e.target.value)}
                placeholder="Es. abuso, spam, evasion…"
              />
            </SettingsField>
            <div className="flex flex-wrap gap-2">
              {BAN_DURATION_OPTIONS.map((opt) => (
                <SettingsPill
                  key={String(opt.hours)}
                  active={banDuration === opt.hours}
                  onClick={() => setBanDuration(opt.hours)}
                >
                  {opt.label}
                </SettingsPill>
              ))}
            </div>
            <label className="flex items-center gap-2 text-[12px] text-text-secondary">
              <input
                type="checkbox"
                checked={banIps}
                onChange={(e) => setBanIps(e.target.checked)}
                className="rounded border-border"
              />
              Includi ban IP noti (anti-evasion)
            </label>
            <DevActionBar>
              <DevActionButton
                tone="danger"
                disabled={banBusy}
                onClick={() =>
                  onBan({
                    reason: banReason,
                    durationHours: banDuration,
                    banIps,
                  })
                }
                icon={banBusy ? Loader2 : ShieldBan}
              >
                {banBusy ? "Ban in corso…" : "Banna utente"}
              </DevActionButton>
            </DevActionBar>
          </>
        )}

        <div className="pt-2">
          <p className="mb-2 text-[12px] font-medium text-text-secondary">
            IP noti ({user.knownIps.length})
          </p>
          {user.knownIps.length === 0 ? (
            <p className="text-[12px] text-text-muted">
              Nessun IP registrato ancora (serve heartbeat dopo deploy
              access-ip).
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {user.knownIps.map((ip) => (
                <div
                  key={ip}
                  className="flex items-center gap-2 rounded-full border border-border bg-fill-muted px-3 py-1 text-[11px]"
                >
                  <span className="font-mono text-text-primary">{ip}</span>
                  <button
                    type="button"
                    disabled={banBusy}
                    onClick={() => onUnbanIp(ip)}
                    className="text-mint hover:underline"
                  >
                    unban
                  </button>
                  <button
                    type="button"
                    disabled={banBusy}
                    onClick={() =>
                      onBanIp({
                        ip,
                        reason: banReason || `Ban IP di ${user.email}`,
                        durationHours: banDuration,
                      })
                    }
                    className="text-warm hover:underline"
                  >
                    ban
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-2 border-t border-white/[0.06] pt-3">
          <p className="text-[12px] font-medium text-text-secondary">
            Ban IP manuale
          </p>
          <SettingsInput
            value={manualIp}
            onChange={(e) => setManualIp(e.target.value)}
            placeholder="Es. 203.0.113.10"
          />
          <SettingsInput
            value={manualIpReason}
            onChange={(e) => setManualIpReason(e.target.value)}
            placeholder="Motivo IP (opzionale)"
          />
          <div className="flex flex-wrap gap-2">
            {BAN_DURATION_OPTIONS.map((opt) => (
              <SettingsPill
                key={`ip-${String(opt.hours)}`}
                active={manualIpDuration === opt.hours}
                onClick={() => setManualIpDuration(opt.hours)}
              >
                {opt.label}
              </SettingsPill>
            ))}
          </div>
          <DevActionButton
            tone="warm"
            disabled={banBusy || !manualIp.trim()}
            onClick={() =>
              onBanIp({
                ip: manualIp.trim(),
                reason: manualIpReason,
                durationHours: manualIpDuration,
              })
            }
            icon={banBusy ? Loader2 : ShieldBan}
          >
            Banna IP
          </DevActionButton>
        </div>
      </section>

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
                leading={
                  <DevUserAvatar name={friend.displayName} imageUrl={friend.avatarUrl} />
                }
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
      <div className="rounded-2xl border border-border bg-fill-muted px-5 py-4">
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
            ? [{ label: "Piattaforma", value: formatPlatformLabel(item.platform) }]
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

export function DevConsolePage() {
  const [tab, setTab] = useState<DevTab>("overview");
  const [query, setQuery] = useState("");
  const [feedbackTypeFilter, setFeedbackTypeFilter] = useState<FeedbackType | "all">("all");
  const [feedbackBucket, setFeedbackBucket] = useState<FeedbackBucket>("inbox");
  const [feedbackActionBusy, setFeedbackActionBusy] = useState(false);
  const [deleteUserBusy, setDeleteUserBusy] = useState(false);
  const [banUserBusy, setBanUserBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cloudUsers, setCloudUsers] = useState<DevCloudUser[]>([]);
  const [localProfiles, setLocalProfiles] = useState<DevLocalProfileInsight[]>([]);
  const [feedbackItems, setFeedbackItems] = useState<AppFeedbackRecord[]>([]);
  const [feedbackWarning, setFeedbackWarning] = useState<string | null>(null);
  const [selectedCloudId, setSelectedCloudId] = useState<string | null>(null);
  const [selectedFeedbackId, setSelectedFeedbackId] = useState<string | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = Boolean(opts?.silent);
    if (silent) setRefreshing(true);
    else {
      setLoading(true);
      setError(null);
    }
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
      setLastUpdatedAt(Date.now());
      setSelectedCloudId((prev) =>
        prev && cloud.some((u) => u.userId === prev) ? prev : (cloud[0]?.userId ?? null),
      );
      setSelectedFeedbackId((prev) =>
        prev && feedback.some((item) => item.id === prev)
          ? prev
          : (feedback[0]?.id ?? null),
      );
      if (silent) setError(null);
    } catch (err) {
      if (!silent) {
        setError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (tab !== "overview") return;
    const id = window.setInterval(() => {
      void load({ silent: true });
    }, LIVE_POLL_MS);
    return () => window.clearInterval(id);
  }, [tab, load]);

  const filteredCloud = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return cloudUsers;
    return cloudUsers.filter(
      (user) =>
        user.email.toLowerCase().includes(q) ||
        user.displayName?.toLowerCase().includes(q),
    );
  }, [cloudUsers, query]);

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

  const refreshCloudUsers = useCallback(async () => {
    const cloud = await fetchDevCloudUsers();
    setCloudUsers(cloud);
  }, []);

  const handleBanCloudUser = useCallback(
    async (
      user: DevCloudUser,
      input: {
        reason: string;
        durationHours: BanDurationHours;
        banIps: boolean;
      },
    ) => {
      const label = user.displayName ?? user.email;
      const durationLabel =
        BAN_DURATION_OPTIONS.find((o) => o.hours === input.durationHours)
          ?.label ?? "permanente";
      const confirmed = window.confirm(
        `Bannare ${label} (${durationLabel})?\n${
          input.banIps ? "Verranno bannati anche gli IP noti." : ""
        }`,
      );
      if (!confirmed) return;

      setBanUserBusy(true);
      setError(null);
      try {
        const result = await banDevCloudUser({
          userId: user.userId,
          reason: input.reason,
          durationHours: input.durationHours,
          banIps: input.banIps,
        });
        await refreshCloudUsers();
        if (input.banIps && result.ipsBanned === 0) {
          setError(
            "Utente bannato, ma nessun IP noto da bloccare (l’utente deve aver fatto login dopo il deploy access-ip).",
          );
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setBanUserBusy(false);
      }
    },
    [refreshCloudUsers],
  );

  const handleUnbanCloudUser = useCallback(
    async (user: DevCloudUser) => {
      setBanUserBusy(true);
      setError(null);
      try {
        await unbanDevCloudUser(user.userId, true);
        await refreshCloudUsers();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setBanUserBusy(false);
      }
    },
    [refreshCloudUsers],
  );

  const handleBanIp = useCallback(
    async (input: {
      ip: string;
      reason: string;
      durationHours: BanDurationHours;
    }) => {
      setBanUserBusy(true);
      setError(null);
      try {
        await banDevIp(input);
        await refreshCloudUsers();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setBanUserBusy(false);
      }
    },
    [refreshCloudUsers],
  );

  const handleUnbanIp = useCallback(
    async (ip: string) => {
      setBanUserBusy(true);
      setError(null);
      try {
        await unbanDevIp(ip);
        await refreshCloudUsers();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setBanUserBusy(false);
      }
    },
    [refreshCloudUsers],
  );

  const activeMeta = MAIN_TABS.find((t) => t.id === tab) ?? MAIN_TABS[0];
  const ActiveIcon = activeMeta.icon;

  const stats =
    tab === "overview" || tab === "top10" || tab === "pranks"
      ? []
      : tab === "broadcasts"
      ? [
          { label: "Messaggi", value: "—", icon: Megaphone },
          { label: "Utenti auth", value: cloudUsers.length, icon: Users },
          { label: "Feedback", value: feedbackItems.length, icon: MessageSquare },
        ]
      : tab === "feedback"
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

  const sidebar = (
    <>
      <div className="flex items-center gap-2.5 px-4 pb-3 pt-4 lg:px-5 lg:pb-5 lg:pt-6">
        <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-text-primary text-void">
          <Terminal className="h-4 w-4" strokeWidth={2.25} />
        </span>
        <div className="min-w-0">
          <p className="font-display text-[15px] font-semibold tracking-[-0.03em] text-text-primary">
            Area Dev
          </p>
          <p className="text-[11px] text-text-muted">Console privata</p>
        </div>
      </div>

      <nav
        className="flex gap-1 overflow-x-auto px-3 pb-3 scrollbar-hide lg:flex-1 lg:flex-col lg:overflow-visible lg:px-3 lg:pb-4"
        aria-label="Sezioni area dev"
      >
        {MAIN_TABS.map((item) => (
          <div key={item.id} className="shrink-0 lg:w-full">
            <SettingsNavItem
              icon={item.icon}
              label={item.label}
              active={tab === item.id}
              onClick={() => setTab(item.id)}
            />
          </div>
        ))}
      </nav>

      <div className="mt-auto hidden border-t border-border px-5 py-4 lg:block">
        <p className="text-[12px] leading-relaxed text-text-secondary">
          Solo account sviluppatore. I dati cloud richiedono sessione admin.
        </p>
      </div>
    </>
  );

  return (
    <div className="page-px relative pb-[max(5.5rem,var(--mobile-nav-height))] pt-[calc(var(--app-nav-height)+0.85rem)] sm:pb-20 sm:pt-[calc(var(--app-nav-height)+1.5rem)]">
      <div className="mx-auto w-full max-w-6xl">
        <SettingsShell sidebar={sidebar}>
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border px-5 py-5 sm:px-7 sm:py-6">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-text-muted">
                {activeMeta.label}
              </p>
              <h1 className="font-display mt-1 text-[clamp(1.65rem,3vw,2.15rem)] font-semibold tracking-[-0.045em] text-text-primary">
                {activeMeta.title}
              </h1>
              <p className="mt-1 text-[13px] text-text-muted sm:text-[14px]">
                {activeMeta.subtitle}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <SettingsButton
                variant="secondary"
                onClick={() => void load({ silent: !loading && cloudUsers.length > 0 })}
                disabled={loading || refreshing}
                className="px-4 py-2"
              >
                {loading || refreshing ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5" strokeWidth={2} />
                )}
                Aggiorna
              </SettingsButton>
              <span className="hidden h-11 w-11 shrink-0 items-center justify-center rounded-full bg-fill-strong text-text-primary sm:flex">
                <ActiveIcon className="h-5 w-5" strokeWidth={1.85} />
              </span>
            </div>
          </div>

          <div className="space-y-4 p-4 sm:p-6 lg:p-7">
            {loading ? (
              <DevLoadingState />
            ) : error ? (
              <DevErrorBanner message={error} />
            ) : (
              <AnimatePresence mode="wait">
                <motion.div
                  key={tab}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                  className="space-y-4"
                >
                  {stats.length > 0 && <DevStatsGrid stats={stats} />}

                  {tab === "overview" && (
                    <DevOverviewPanel
                      cloudUsers={cloudUsers}
                      feedbackItems={feedbackItems}
                      localProfileCount={localProfiles.length}
                      lastUpdatedAt={lastUpdatedAt}
                      live
                    />
                  )}

                  {tab !== "broadcasts" &&
                    tab !== "overview" &&
                    tab !== "top10" &&
                    tab !== "pranks" && (
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
                      {tab === "feedback"
                        ? (
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
                          ))
                        : null}
                    </DevFilterRow>
                  )}

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

                  {tab === "feedback" && feedbackWarning && (
                    <DevWarningBanner message={feedbackWarning} />
                  )}

                  {tab === "broadcasts" && <BroadcastAdminPanel />}

                  {tab === "pranks" && <DevPrankPanel />}

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
                                meta={`${user.banned ? "BANNATO · " : ""}${user.friends.length} amici · ${user.recentWatches.length} visioni${user.appVersion ? ` · v${user.appVersion}` : ""}`}
                                leading={
                                  <DevUserAvatar
                                    name={user.displayName ?? user.email}
                                    imageUrl={user.avatarUrl}
                                    online={
                                      user.hasProfile ? isCloudUserOnline(user) : undefined
                                    }
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
                              banBusy={banUserBusy}
                              onDelete={() =>
                                void handleDeleteCloudUser(selectedCloudUser)
                              }
                              onBan={(input) =>
                                void handleBanCloudUser(selectedCloudUser, input)
                              }
                              onUnban={() =>
                                void handleUnbanCloudUser(selectedCloudUser)
                              }
                              onBanIp={(input) => void handleBanIp(input)}
                              onUnbanIp={(ip) => void handleUnbanIp(ip)}
                            />
                          )}
                        </DevDetailPane>
                      }
                    />
                  )}

                  {tab === "top10" && <DevTop10Panel />}

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
                          )}
                        </DevDetailPane>
                      }
                    />
                  )}
                </motion.div>
              </AnimatePresence>
            )}
          </div>
        </SettingsShell>
      </div>
    </div>
  );
}
