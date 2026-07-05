import { invoke } from "@tauri-apps/api/core";

export interface ProfileLimits {
  profileId: string;
  dailyLimitMins: number;
  bedtimeStart?: string;
  bedtimeEnd?: string;
}

export interface UpdateProfileLimitsInput {
  dailyLimitMins?: number;
  bedtimeStart?: string;
  bedtimeEnd?: string;
}

export interface WatchSession {
  id: string;
  profileId: string;
  mediaId: string;
  mediaTitle: string;
  startedAt: string;
  endedAt?: string;
  secondsWatched: number;
  completed: boolean;
  sourceKind: string;
}

export interface CanPlayResult {
  allowed: boolean;
  reason?: string;
}

export async function canPlayMedia(
  profileId: string,
  mediaId: string,
): Promise<CanPlayResult> {
  return invoke<CanPlayResult>("can_play_media_cmd", { profileId, mediaId });
}

export async function fetchProfileLimits(
  profileId: string,
): Promise<ProfileLimits> {
  return invoke<ProfileLimits>("get_profile_limits_cmd", { profileId });
}

export async function updateProfileLimits(
  parentProfileId: string,
  childProfileId: string,
  input: UpdateProfileLimitsInput,
): Promise<ProfileLimits> {
  return invoke<ProfileLimits>("update_profile_limits_cmd", {
    parentProfileId,
    childProfileId,
    input,
  });
}

export async function fetchWatchHistory(
  parentProfileId: string,
  childProfileId: string,
  limit = 50,
): Promise<WatchSession[]> {
  return invoke<WatchSession[]>("get_watch_history_cmd", {
    parentProfileId,
    childProfileId,
    limit,
  });
}

export async function startWatchSession(
  profileId: string,
  mediaId: string,
): Promise<string> {
  return invoke<string>("start_watch_session_cmd", { profileId, mediaId });
}

export async function updateWatchSession(
  sessionId: string,
  secondsWatched: number,
): Promise<void> {
  return invoke("update_watch_session_cmd", { sessionId, secondsWatched });
}

export async function startAddonWatchSession(
  profileId: string,
  contentType: string,
  videoId: string,
  title: string,
): Promise<string> {
  return invoke<string>("start_addon_watch_session_cmd", {
    profileId,
    contentType,
    videoId,
    title,
  });
}

import type { AchievementUnlock } from "./achievements";

export async function endWatchSession(
  sessionId: string,
  completed: boolean,
): Promise<AchievementUnlock[]> {
  return invoke<AchievementUnlock[]>("end_watch_session_cmd", { sessionId, completed });
}
