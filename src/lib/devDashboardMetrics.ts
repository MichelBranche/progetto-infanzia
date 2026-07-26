import type { DevCloudUser } from "../types/devAdmin";
import type { AppFeedbackRecord } from "../types/feedback";
import { isPresenceOnline } from "./cloudPresence";

export type DayBucket = {
  key: string;
  label: string;
  newUsers: number;
  newProfiles: number;
};

export type PresenceSlice = {
  id: "online" | "away" | "offline" | "no_profile";
  label: string;
  count: number;
  color: string;
};

export type PlatformSlice = {
  id: string;
  label: string;
  count: number;
};

/** App realmente aperta: heartbeat fresco e non invisibile/offline. */
export function isAppOpenPresence(user: DevCloudUser): boolean {
  if (!user.hasProfile) return false;
  const status = (user.presenceStatus ?? "").toLowerCase();
  if (status === "invisible" || status === "offline") return false;
  return isPresenceOnline(user.lastSeenAt);
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function dayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseDate(iso?: string): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

function shortDayLabel(d: Date): string {
  return d.toLocaleDateString("it-IT", { day: "numeric", month: "short" });
}

export function buildDaySeries(users: DevCloudUser[], days = 14): DayBucket[] {
  const today = startOfDay(new Date());
  const buckets = new Map<string, DayBucket>();

  for (let i = days - 1; i >= 0; i -= 1) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const key = dayKey(d);
    buckets.set(key, {
      key,
      label: shortDayLabel(d),
      newUsers: 0,
      newProfiles: 0,
    });
  }

  for (const user of users) {
    const created = parseDate(user.authCreatedAt);
    if (created) {
      const key = dayKey(startOfDay(created));
      const bucket = buckets.get(key);
      if (bucket) bucket.newUsers += 1;
    }
    if (user.hasProfile) {
      const profileAt = parseDate(user.profileCreatedAt) ?? created;
      if (profileAt) {
        const key = dayKey(startOfDay(profileAt));
        const bucket = buckets.get(key);
        if (bucket) bucket.newProfiles += 1;
      }
    }
  }

  return Array.from(buckets.values());
}

export function buildPresenceSlices(users: DevCloudUser[]): PresenceSlice[] {
  let online = 0;
  let away = 0;
  let offline = 0;
  let noProfile = 0;

  for (const user of users) {
    if (!user.hasProfile) {
      noProfile += 1;
      continue;
    }
    if (!isAppOpenPresence(user)) {
      offline += 1;
      continue;
    }
    const status = (user.presenceStatus ?? "").toLowerCase();
    if (status === "away") away += 1;
    else online += 1; // online, dnd, o default con heartbeat fresco
  }

  return [
    { id: "online", label: "Attivi", count: online, color: "#34d399" },
    { id: "away", label: "App aperta (away)", count: away, color: "#fbbf24" },
    { id: "offline", label: "Offline", count: offline, color: "#94a3b8" },
    { id: "no_profile", label: "Solo auth", count: noProfile, color: "#fb923c" },
  ];
}

export function buildPlatformSlices(users: DevCloudUser[]): PlatformSlice[] {
  const map = new Map<string, number>();
  for (const user of users) {
    if (!user.hasProfile) continue;
    const raw = (user.platform ?? "sconosciuta").toLowerCase();
    const label = platformBucketLabel(raw);
    map.set(label, (map.get(label) ?? 0) + 1);
  }
  return Array.from(map.entries())
    .map(([label, count]) => ({ id: label.toLowerCase(), label, count }))
    .sort((a, b) => b.count - a.count);
}

function platformBucketLabel(raw: string): string {
  if (raw === "web" || raw === "browser") return "Web";
  if (raw === "web-mobile") return "Web mobile";
  if (raw.startsWith("desktop") || raw === "windows" || raw === "macos" || raw === "linux") {
    if (raw.includes("windows") || raw === "windows") return "Desktop · Windows";
    if (raw.includes("macos") || raw === "macos") return "Desktop · macOS";
    if (raw.includes("linux") || raw === "linux") return "Desktop · Linux";
    return "Desktop";
  }
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

export function isWebShellPlatform(platform?: string): boolean {
  if (!platform) return false;
  const p = platform.toLowerCase();
  return p === "web" || p === "web-mobile" || p === "browser" || p.startsWith("web-");
}

export function computeWebShellMetrics(users: DevCloudUser[]) {
  const withProfile = users.filter((u) => u.hasProfile);
  const webUsers = withProfile.filter((u) => isWebShellPlatform(u.platform));
  const desktopUsers = withProfile.filter((u) => {
    const p = (u.platform ?? "").toLowerCase();
    return (
      p.startsWith("desktop") ||
      p === "windows" ||
      p === "macos" ||
      p === "linux"
    );
  });
  const webOpen = webUsers.filter((u) => isAppOpenPresence(u)).length;
  const webMobile = webUsers.filter(
    (u) => (u.platform ?? "").toLowerCase() === "web-mobile",
  ).length;
  const webDesktopBrowser = webUsers.length - webMobile;

  return {
    webUsers: webUsers.length,
    webMobile,
    webDesktopBrowser,
    webOpen,
    desktopUsers: desktopUsers.length,
    unknownShell: Math.max(
      0,
      withProfile.length - webUsers.length - desktopUsers.length,
    ),
  };
}

export function computeDevOverviewKpis(
  users: DevCloudUser[],
  feedback: AppFeedbackRecord[],
  localProfileCount: number,
) {
  const now = Date.now();
  const weekAgo = now - 7 * 24 * 60 * 60 * 1000;
  const dayAgo = now - 24 * 60 * 60 * 1000;

  let registered = 0;
  let online = 0;
  let away = 0;
  let newThisWeek = 0;
  let newToday = 0;
  let signedInToday = 0;

  for (const user of users) {
    if (user.hasProfile) {
      registered += 1;
      if (isAppOpenPresence(user)) {
        const status = (user.presenceStatus ?? "").toLowerCase();
        if (status === "away") away += 1;
        else online += 1;
      }
    }
    const created = parseDate(user.authCreatedAt);
    if (created) {
      const t = created.getTime();
      if (t >= weekAgo) newThisWeek += 1;
      if (t >= dayAgo) newToday += 1;
    }
    const lastSignIn = parseDate(user.lastSignInAt);
    if (lastSignIn && lastSignIn.getTime() >= dayAgo) signedInToday += 1;
  }

  const openFeedback = feedback.filter(
    (item) => !item.deletedAt && item.status === "open",
  ).length;

  const appOpen = online + away;

  return {
    totalUsers: users.length,
    registered,
    authOnly: users.length - registered,
    online: appOpen,
    activeOnline: online,
    away,
    presenceLive: appOpen,
    newThisWeek,
    newToday,
    signedInToday,
    openFeedback,
    localProfiles: localProfileCount,
  };
}
