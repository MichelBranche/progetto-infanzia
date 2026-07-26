import { getSupabase } from "./supabaseClient";
import type { AdminPrank, AdminPrankKind } from "../types/adminPrank";

function mapPrank(row: Record<string, unknown>): AdminPrank {
  return {
    id: String(row.id ?? ""),
    targetUserId: String(row.target_user_id ?? row.targetUserId ?? ""),
    kind: String(row.kind ?? "jumpscare") as AdminPrankKind,
    message: row.message ? String(row.message) : undefined,
    createdAt: String(row.created_at ?? row.createdAt ?? ""),
    expiresAt: String(row.expires_at ?? row.expiresAt ?? ""),
  };
}

function isFresh(prank: AdminPrank): boolean {
  if (!prank.id || !prank.kind) return false;
  const ends = Date.parse(prank.expiresAt);
  if (Number.isFinite(ends) && ends <= Date.now()) return false;
  return true;
}

export async function sendAdminPrank(input: {
  targetUserId: string;
  kind: AdminPrankKind;
  message?: string;
}): Promise<AdminPrank> {
  const supabase = getSupabase();
  if (!supabase) throw new Error("Cloud non configurato");

  const { data, error } = await supabase.rpc("send_admin_prank", {
    p_target_user_id: input.targetUserId,
    p_kind: input.kind,
    p_message: input.message?.trim() || null,
  });

  if (error) throw new Error(error.message);
  if (!data || typeof data !== "object") {
    throw new Error("Risposta scherzo non valida");
  }
  return mapPrank(data as Record<string, unknown>);
}

export async function ackAdminPrank(id: string): Promise<void> {
  const supabase = getSupabase();
  if (!supabase || !id) return;
  await supabase.rpc("ack_admin_prank", { p_id: id });
}

export async function fetchPendingAdminPranks(
  userId: string,
): Promise<AdminPrank[]> {
  const supabase = getSupabase();
  if (!supabase || !userId) return [];

  const { data, error } = await supabase
    .from("admin_pranks")
    .select("id, target_user_id, kind, message, created_at, expires_at")
    .eq("target_user_id", userId)
    .is("consumed_at", null)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: true })
    .limit(5);

  if (error || !Array.isArray(data)) return [];
  return data
    .map((row) => mapPrank(row as Record<string, unknown>))
    .filter(isFresh);
}

export function subscribeAdminPranks(
  userId: string,
  onPrank: (prank: AdminPrank) => void,
): () => void {
  const supabase = getSupabase();
  if (!supabase || !userId) return () => {};

  const channelName = `admin-pranks:${userId}`;
  for (const existing of supabase.getChannels()) {
    if (existing.topic === channelName || existing.topic === `realtime:${channelName}`) {
      void supabase.removeChannel(existing);
    }
  }

  const channel = supabase
    .channel(channelName)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "admin_pranks",
        filter: `target_user_id=eq.${userId}`,
      },
      (payload) => {
        const prank = mapPrank(payload.new as Record<string, unknown>);
        if (!isFresh(prank)) return;
        onPrank(prank);
      },
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}
