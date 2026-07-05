import { invoke, isTauri } from "@tauri-apps/api/core";
import type {
  AchievementUnlock,
  ProfileAchievementsState,
} from "./achievements";
import {
  getDevAchievementsState,
  recordDevCompletion,
  syncDevAchievements,
} from "./achievementsDevStore";

export async function getAchievementsState(
  profileId: string,
  cloudFriendsCount = 0,
): Promise<ProfileAchievementsState> {
  if (!isTauri()) {
    return getDevAchievementsState(profileId, cloudFriendsCount);
  }
  return invoke<ProfileAchievementsState>("get_achievements_state_cmd", {
    profileId,
    cloudFriendsCount,
  });
}

export async function syncAchievements(
  profileId: string,
  cloudFriendsCount = 0,
): Promise<AchievementUnlock[]> {
  if (!isTauri()) {
    return syncDevAchievements(profileId, cloudFriendsCount);
  }
  return invoke<AchievementUnlock[]>("sync_achievements_cmd", {
    profileId,
    cloudFriendsCount,
  });
}

export async function recordCompletion(
  profileId: string,
  completionKey: string,
  kind: string,
  title: string,
  cloudFriendsCount = 0,
): Promise<AchievementUnlock[]> {
  if (!isTauri()) {
    return recordDevCompletion(profileId, completionKey, kind, title, cloudFriendsCount);
  }
  return invoke<AchievementUnlock[]>("record_completion_cmd", {
    profileId,
    completionKey,
    kind,
    title,
    cloudFriendsCount,
  });
}
