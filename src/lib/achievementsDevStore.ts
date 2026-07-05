import type {
  AchievementUnlock,
  ProfileAchievementStats,
  ProfileAchievementsState,
} from "./achievements";
import {
  ACHIEVEMENT_DEFINITIONS,
  statForCategory,
} from "./achievements";

const COMPLETIONS_KEY = "branchefy-dev-completions";
const UNLOCKS_KEY = "branchefy-dev-achievement-unlocks";

type CompletionStore = Record<
  string,
  Record<string, { kind: string; title: string; completedAt: string }>
>;
type UnlockStore = Record<string, Record<string, string>>;

function readCompletions(): CompletionStore {
  try {
    const raw = localStorage.getItem(COMPLETIONS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as CompletionStore;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeCompletions(store: CompletionStore) {
  localStorage.setItem(COMPLETIONS_KEY, JSON.stringify(store));
}

function readUnlocks(): UnlockStore {
  try {
    const raw = localStorage.getItem(UNLOCKS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as UnlockStore;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeUnlocks(store: UnlockStore) {
  localStorage.setItem(UNLOCKS_KEY, JSON.stringify(store));
}

function devStats(
  profileId: string,
  cloudFriendsCount: number,
): ProfileAchievementStats {
  const completions = Object.keys(readCompletions()[profileId] ?? {}).length;
  return {
    friendsCount: cloudFriendsCount,
    completionsCount: completions,
    listCount: 0,
  };
}

function syncDev(profileId: string, cloudFriendsCount: number): AchievementUnlock[] {
  const stats = devStats(profileId, cloudFriendsCount);
  const unlocks = { ...readUnlocks() };
  const profileUnlocks = { ...(unlocks[profileId] ?? {}) };
  const newlyUnlocked: AchievementUnlock[] = [];
  const now = new Date().toISOString();

  for (const rule of ACHIEVEMENT_DEFINITIONS) {
    if (profileUnlocks[rule.id]) continue;
    if (statForCategory(stats, rule.category) < rule.threshold) continue;
    profileUnlocks[rule.id] = now;
    newlyUnlocked.push({ id: rule.id, unlockedAt: now });
  }

  unlocks[profileId] = profileUnlocks;
  writeUnlocks(unlocks);
  return newlyUnlocked;
}

export function getDevAchievementsState(
  profileId: string,
  cloudFriendsCount: number,
): ProfileAchievementsState {
  const stats = devStats(profileId, cloudFriendsCount);
  const profileUnlocks = readUnlocks()[profileId] ?? {};
  const unlocked = Object.entries(profileUnlocks).map(([id, unlockedAt]) => ({
    id,
    unlockedAt,
  }));
  return { stats, unlocked };
}

export function recordDevCompletion(
  profileId: string,
  completionKey: string,
  kind: string,
  title: string,
  cloudFriendsCount: number,
): AchievementUnlock[] {
  const store = readCompletions();
  const profile = { ...(store[profileId] ?? {}) };
  if (!profile[completionKey]) {
    profile[completionKey] = {
      kind,
      title,
      completedAt: new Date().toISOString(),
    };
    store[profileId] = profile;
    writeCompletions(store);
  }
  return syncDev(profileId, cloudFriendsCount);
}

export function syncDevAchievements(
  profileId: string,
  cloudFriendsCount: number,
): AchievementUnlock[] {
  return syncDev(profileId, cloudFriendsCount);
}
