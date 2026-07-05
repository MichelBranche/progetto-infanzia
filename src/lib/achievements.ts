import type { LucideIcon } from "lucide-react";
import { Film, Library, Trophy, Users } from "lucide-react";

export type AchievementCategory = "friends" | "completions" | "list";

export interface AchievementDefinition {
  id: string;
  category: AchievementCategory;
  threshold: number;
  title: string;
  description: string;
  icon: LucideIcon;
}

export interface AchievementUnlock {
  id: string;
  unlockedAt: string;
}

export interface ProfileAchievementStats {
  friendsCount: number;
  completionsCount: number;
  listCount: number;
}

export interface ProfileAchievementsState {
  stats: ProfileAchievementStats;
  unlocked: AchievementUnlock[];
}

export const ACHIEVEMENT_DEFINITIONS: AchievementDefinition[] = [
  {
    id: "friends_1",
    category: "friends",
    threshold: 1,
    title: "Primo amico",
    description: "Aggiungi il tuo primo amico.",
    icon: Users,
  },
  {
    id: "friends_5",
    category: "friends",
    threshold: 5,
    title: "Cerchia ristretta",
    description: "Hai 5 amici nella tua lista.",
    icon: Users,
  },
  {
    id: "friends_10",
    category: "friends",
    threshold: 10,
    title: "Popolare",
    description: "Hai 10 amici connessi.",
    icon: Users,
  },
  {
    id: "friends_25",
    category: "friends",
    threshold: 25,
    title: "Social star",
    description: "Hai 25 amici su Branchefy.",
    icon: Users,
  },
  {
    id: "watch_1",
    category: "completions",
    threshold: 1,
    title: "Prima visione",
    description: "Completa il tuo primo film, episodio o titolo.",
    icon: Film,
  },
  {
    id: "watch_5",
    category: "completions",
    threshold: 5,
    title: "Cinefilo",
    description: "Completa 5 titoli dall'inizio alla fine.",
    icon: Film,
  },
  {
    id: "watch_10",
    category: "completions",
    threshold: 10,
    title: "Maratoneta",
    description: "Completa 10 titoli.",
    icon: Film,
  },
  {
    id: "watch_25",
    category: "completions",
    threshold: 25,
    title: "Devoto seriale",
    description: "Completa 25 titoli.",
    icon: Film,
  },
  {
    id: "watch_50",
    category: "completions",
    threshold: 50,
    title: "Leggenda del divano",
    description: "Completa 50 titoli.",
    icon: Film,
  },
  {
    id: "list_1",
    category: "list",
    threshold: 1,
    title: "Da non perdere",
    description: "Salva il primo titolo nella tua lista.",
    icon: Library,
  },
  {
    id: "list_5",
    category: "list",
    threshold: 5,
    title: "Curatore",
    description: "Hai 5 titoli in lista.",
    icon: Library,
  },
  {
    id: "list_10",
    category: "list",
    threshold: 10,
    title: "Collezionista",
    description: "Hai 10 titoli in lista.",
    icon: Library,
  },
  {
    id: "list_25",
    category: "list",
    threshold: 25,
    title: "Archivista",
    description: "Hai 25 titoli in lista.",
    icon: Library,
  },
];

export const ACHIEVEMENT_BY_ID = Object.fromEntries(
  ACHIEVEMENT_DEFINITIONS.map((item) => [item.id, item]),
) as Record<string, AchievementDefinition>;

export const ACHIEVEMENT_CATEGORY_LABELS: Record<AchievementCategory, string> = {
  friends: "Amici",
  completions: "Visioni complete",
  list: "La mia lista",
};

export const ACHIEVEMENT_CATEGORY_ICONS: Record<AchievementCategory, LucideIcon> = {
  friends: Users,
  completions: Film,
  list: Library,
};

export function statForCategory(
  stats: ProfileAchievementStats,
  category: AchievementCategory,
): number {
  switch (category) {
    case "friends":
      return stats.friendsCount;
    case "completions":
      return stats.completionsCount;
    case "list":
      return stats.listCount;
    default:
      return 0;
  }
}

export function isWatchCompletedRatio(positionSecs: number, durationSecs?: number): boolean {
  if (durationSecs == null || durationSecs <= 0) return false;
  if (positionSecs <= 5) return false;
  return positionSecs / durationSecs >= 0.92;
}

export function streamingCompletionKey(input: {
  catalogPrefix: string;
  contentType: string;
  titleId: string;
  slug: string;
  videoId: string;
}): string {
  return `stream:${input.catalogPrefix.trim()}:${input.contentType.trim()}:${input.titleId.trim()}:${input.slug.trim()}:${input.videoId.trim()}`;
}

export function unlockedAchievementIds(unlocked: AchievementUnlock[]): Set<string> {
  return new Set(unlocked.map((item) => item.id));
}

export function nextAchievementInCategory(
  category: AchievementCategory,
  stats: ProfileAchievementStats,
  unlockedIds: Set<string>,
): AchievementDefinition | null {
  return (
    ACHIEVEMENT_DEFINITIONS.find(
      (item) =>
        item.category === category &&
        !unlockedIds.has(item.id) &&
        statForCategory(stats, category) < item.threshold,
    ) ?? null
  );
}

export function categoryProgress(
  category: AchievementCategory,
  stats: ProfileAchievementStats,
): { current: number; next?: AchievementDefinition } {
  const current = statForCategory(stats, category);
  const next = ACHIEVEMENT_DEFINITIONS.find(
    (item) => item.category === category && current < item.threshold,
  );
  return { current, next };
}

export function achievementProgressLabel(
  category: AchievementCategory,
  stats: ProfileAchievementStats,
): string {
  const { current, next } = categoryProgress(category, stats);
  if (!next) return `${current} completati`;
  return `${current} / ${next.threshold}`;
}

export const ACHIEVEMENTS_TAB_ICON = Trophy;
