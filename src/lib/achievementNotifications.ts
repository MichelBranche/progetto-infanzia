import type { AchievementUnlock } from "./achievements";
import { ACHIEVEMENT_BY_ID } from "./achievements";
import type { AppNotification } from "../context/NotificationContext";

export function achievementUnlockNotifications(
  unlocks: AchievementUnlock[],
): Omit<AppNotification, "id">[] {
  return unlocks.map((unlock) => ({
    kind: "success" as const,
    title: "Traguardo sbloccato",
    message: ACHIEVEMENT_BY_ID[unlock.id]?.title ?? unlock.id,
  }));
}
