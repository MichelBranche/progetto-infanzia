import { invoke } from "@tauri-apps/api/core";
import { getSupabase } from "./supabaseClient";
import { isDevAdminEmail } from "./devAdmin";
import type { DevCloudUser, DevLocalDashboard } from "../types/devAdmin";
import type { AppFeedbackRecord, FeedbackStatus, FeedbackType } from "../types/feedback";

async function assertDevAdmin() {
  const supabase = getSupabase();
  if (!supabase) throw new Error("Cloud non configurato");

  const { data: sessionData } = await supabase.auth.getSession();
  const email = sessionData.session?.user?.email;
  if (!isDevAdminEmail(email)) {
    throw new Error("Accesso riservato allo sviluppatore");
  }
  return supabase;
}

function mapCloudUser(row: Record<string, unknown>): DevCloudUser {
  const recent = Array.isArray(row.recent_watches)
    ? row.recent_watches.map((item: Record<string, unknown>) => ({
        titleName: String(item.title_name ?? ""),
        contentType: item.content_type ? String(item.content_type) : undefined,
        episodeLabel: item.episode_label
          ? String(item.episode_label)
          : undefined,
        secondsWatched: Number(item.seconds_watched ?? 0),
        watchedAt: String(item.watched_at ?? ""),
      }))
    : [];

  const top = Array.isArray(row.top_titles)
    ? row.top_titles.map((item: Record<string, unknown>) => ({
        titleName: String(item.title_name ?? ""),
        totalSeconds: Number(item.total_seconds ?? 0),
        playCount: Number(item.play_count ?? 0),
      }))
    : [];

  const friends = Array.isArray(row.friends)
    ? row.friends.map((item: Record<string, unknown>) => ({
        friendId: String(item.friend_id ?? ""),
        displayName: String(item.display_name ?? ""),
        email: String(item.email ?? ""),
        friendCode: String(item.friend_code ?? ""),
      }))
    : [];

  return {
    userId: String(row.user_id ?? ""),
    email: String(row.email ?? ""),
    authCreatedAt: String(row.auth_created_at ?? ""),
    lastSignInAt: row.last_sign_in_at
      ? String(row.last_sign_in_at)
      : undefined,
    emailConfirmed: Boolean(row.email_confirmed),
    hasProfile: Boolean(row.has_profile),
    displayName: row.display_name ? String(row.display_name) : undefined,
    friendCode: row.friend_code ? String(row.friend_code) : undefined,
    profileCreatedAt: row.profile_created_at
      ? String(row.profile_created_at)
      : undefined,
    friendsCount: Number(row.friends_count ?? 0),
    presenceStatus: row.presence_status
      ? String(row.presence_status)
      : undefined,
    lastSeenAt: row.last_seen_at ? String(row.last_seen_at) : undefined,
    presenceActivity: row.presence_activity
      ? String(row.presence_activity)
      : undefined,
    appVersion: row.app_version ? String(row.app_version) : undefined,
    platform: row.platform ? String(row.platform) : undefined,
    friends,
    recentWatches: recent,
    topTitles: top,
  };
}

export async function fetchDevCloudUsers(): Promise<DevCloudUser[]> {
  const supabase = getSupabase();
  if (!supabase) throw new Error("Cloud non configurato");

  const { data: sessionData } = await supabase.auth.getSession();
  const email = sessionData.session?.user?.email;
  if (!isDevAdminEmail(email)) {
    throw new Error("Accesso riservato allo sviluppatore");
  }

  const { data, error } = await supabase.rpc("dev_users_overview");
  if (error) throw new Error(error.message);

  const rows = Array.isArray(data) ? data : [];
  return rows.map((row) => mapCloudUser(row as Record<string, unknown>));
}

export async function deleteDevCloudUser(userId: string): Promise<void> {
  const supabase = await assertDevAdmin();
  const { error } = await supabase.rpc("dev_delete_user_account", {
    target_user_id: userId,
  });
  if (error) throw new Error(error.message);
}

export async function fetchDevLocalDashboard(): Promise<DevLocalDashboard> {
  return invoke<DevLocalDashboard>("dev_local_dashboard_cmd");
}

function mapFeedbackRow(row: Record<string, unknown>): AppFeedbackRecord {
  const context = row.context_json;
  return {
    id: String(row.id ?? ""),
    userId: row.user_id ? String(row.user_id) : undefined,
    profileName: String(row.profile_name ?? ""),
    profileRole: String(row.profile_role ?? ""),
    type: String(row.feedback_type ?? "feedback") as FeedbackType,
    status: (row.status === "resolved" ? "resolved" : "open") as FeedbackStatus,
    subject: row.subject ? String(row.subject) : undefined,
    message: String(row.message ?? ""),
    context:
      context && typeof context === "object"
        ? (context as AppFeedbackRecord["context"])
        : undefined,
    appVersion: row.app_version ? String(row.app_version) : undefined,
    platform: row.platform ? String(row.platform) : undefined,
    createdAt: String(row.created_at ?? ""),
    resolvedAt: row.resolved_at ? String(row.resolved_at) : undefined,
    deletedAt: row.deleted_at ? String(row.deleted_at) : undefined,
  };
}

const FEEDBACK_SELECT =
  "id, user_id, profile_name, profile_role, feedback_type, status, subject, message, context_json, app_version, platform, created_at, resolved_at, deleted_at";

export async function purgeExpiredFeedbackTrash(): Promise<number> {
  const supabase = await assertDevAdmin();
  const { data, error } = await supabase.rpc("dev_feedback_purge_trash");
  if (error) {
    if (error.message.includes("dev_feedback_purge_trash")) return 0;
    throw new Error(error.message);
  }
  return Number(data ?? 0);
}

export async function fetchDevFeedback(): Promise<AppFeedbackRecord[]> {
  const supabase = await assertDevAdmin();
  await purgeExpiredFeedbackTrash().catch(() => 0);

  const { data, error } = await supabase
    .from("app_feedback")
    .select(FEEDBACK_SELECT)
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) throw new Error(error.message);
  return (data ?? []).map((row) =>
    mapFeedbackRow(row as Record<string, unknown>),
  );
}

export async function setFeedbackStatus(
  id: string,
  status: FeedbackStatus,
): Promise<void> {
  const supabase = await assertDevAdmin();
  const { error } = await supabase
    .from("app_feedback")
    .update({
      status,
      resolved_at: status === "resolved" ? new Date().toISOString() : null,
    })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function moveFeedbackToTrash(id: string): Promise<void> {
  const supabase = await assertDevAdmin();
  const { error } = await supabase
    .from("app_feedback")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function restoreFeedbackFromTrash(id: string): Promise<void> {
  const supabase = await assertDevAdmin();
  const { error } = await supabase
    .from("app_feedback")
    .update({ deleted_at: null })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function checkDevAdminAccess(): Promise<boolean> {
  const supabase = getSupabase();
  if (!supabase) return false;
  const { data } = await supabase.auth.getSession();
  if (!isDevAdminEmail(data.session?.user?.email)) return false;
  try {
    const { error } = await supabase.rpc("dev_users_overview");
    return !error;
  } catch {
    return false;
  }
}
