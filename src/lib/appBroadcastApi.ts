import { getSupabase } from "./supabaseClient";
import { isCloudEnabled } from "./cloudConfig";
import type { AppBroadcast, AppBroadcastInput } from "../types/appBroadcast";

const DISMISS_PREFIX = "branchefy-broadcast-dismissed:";

function mapBroadcastRow(row: Record<string, unknown>): AppBroadcast {
  return {
    id: String(row.id ?? ""),
    title: String(row.title ?? ""),
    body: String(row.body ?? ""),
    messageType: String(row.message_type ?? "info") as AppBroadcast["messageType"],
    startsAt: String(row.starts_at ?? ""),
    endsAt: String(row.ends_at ?? ""),
    dismissible: Boolean(row.dismissible ?? true),
    enabled: Boolean(row.enabled ?? true),
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? ""),
  };
}

function toDbPayload(input: AppBroadcastInput) {
  return {
    title: input.title.trim(),
    body: input.body.trim(),
    message_type: input.messageType,
    starts_at: input.startsAt,
    ends_at: input.endsAt,
    dismissible: input.dismissible,
    enabled: input.enabled,
    updated_at: new Date().toISOString(),
  };
}

export function isBroadcastDismissed(id: string): boolean {
  try {
    return localStorage.getItem(`${DISMISS_PREFIX}${id}`) === "1";
  } catch {
    return false;
  }
}

export function dismissBroadcast(id: string): void {
  try {
    localStorage.setItem(`${DISMISS_PREFIX}${id}`, "1");
  } catch {
    // ignore
  }
}

export function clearExpiredBroadcastDismissals(activeId?: string): void {
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (key?.startsWith(DISMISS_PREFIX)) keys.push(key);
    }
    for (const key of keys) {
      const id = key.slice(DISMISS_PREFIX.length);
      if (id !== activeId) localStorage.removeItem(key);
    }
  } catch {
    // ignore
  }
}

export async function fetchActiveAppBroadcast(): Promise<AppBroadcast | null> {
  if (!isCloudEnabled()) return null;
  const supabase = getSupabase();
  if (!supabase) return null;

  const { data, error } = await supabase.rpc("get_active_app_broadcast");
  if (error || !data || typeof data !== "object") return null;
  return mapBroadcastRow(data as Record<string, unknown>);
}

export async function fetchDevBroadcasts(): Promise<AppBroadcast[]> {
  const supabase = getSupabase();
  if (!supabase) throw new Error("Cloud non configurato");

  const { data, error } = await supabase
    .from("app_broadcasts")
    .select(
      "id, title, body, message_type, starts_at, ends_at, dismissible, enabled, created_at, updated_at",
    )
    .order("starts_at", { ascending: false })
    .limit(100);

  if (error) throw new Error(error.message);
  return (data ?? []).map((row) =>
    mapBroadcastRow(row as Record<string, unknown>),
  );
}

export async function createDevBroadcast(
  input: AppBroadcastInput,
): Promise<AppBroadcast> {
  const supabase = getSupabase();
  if (!supabase) throw new Error("Cloud non configurato");

  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData.session?.user?.id ?? null;

  const { data, error } = await supabase
    .from("app_broadcasts")
    .insert({
      ...toDbPayload(input),
      created_by: userId,
    })
    .select(
      "id, title, body, message_type, starts_at, ends_at, dismissible, enabled, created_at, updated_at",
    )
    .single();

  if (error) throw new Error(error.message);
  return mapBroadcastRow(data as Record<string, unknown>);
}

export async function updateDevBroadcast(
  id: string,
  input: AppBroadcastInput,
): Promise<AppBroadcast> {
  const supabase = getSupabase();
  if (!supabase) throw new Error("Cloud non configurato");

  const { data, error } = await supabase
    .from("app_broadcasts")
    .update(toDbPayload(input))
    .eq("id", id)
    .select(
      "id, title, body, message_type, starts_at, ends_at, dismissible, enabled, created_at, updated_at",
    )
    .single();

  if (error) throw new Error(error.message);
  return mapBroadcastRow(data as Record<string, unknown>);
}

export async function deleteDevBroadcast(id: string): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) throw new Error("Cloud non configurato");
  const { error } = await supabase.from("app_broadcasts").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export function subscribeAppBroadcasts(onChange: () => void): () => void {
  const supabase = getSupabase();
  if (!supabase) return () => {};

  const channel = supabase
    .channel("app-broadcasts-global")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "app_broadcasts" },
      () => onChange(),
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}

export function isBroadcastActiveNow(
  broadcast: AppBroadcast,
  now = Date.now(),
): boolean {
  if (!broadcast.enabled) return false;
  const starts = Date.parse(broadcast.startsAt);
  const ends = Date.parse(broadcast.endsAt);
  if (Number.isNaN(starts) || Number.isNaN(ends)) return false;
  return starts <= now && ends > now;
}

export function formatBroadcastWindow(startsAt: string, endsAt: string): string {
  const fmt = (iso: string) =>
    new Date(iso).toLocaleString("it-IT", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  return `${fmt(startsAt)} → ${fmt(endsAt)}`;
}
