import { getSupabase } from "./supabaseClient";
import { deleteWatchPartyChat, ensureWatchPartyChat } from "./cloudChat";
import type { WatchPartyContent, WatchPartyRoom } from "../types/watchParty";

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function randomCode(len: number): string {
  let out = "";
  for (let i = 0; i < len; i++) {
    out += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return out;
}

function mapRoom(row: {
  code: string;
  host_id: string;
  host_name: string;
  content: WatchPartyContent;
  playing: boolean;
  position_secs: number;
  updated_at?: string;
}): WatchPartyRoom {
  return {
    code: row.code,
    hostProfileId: row.host_id,
    hostName: row.host_name,
    content: row.content,
    playing: row.playing,
    positionSecs: row.position_secs,
    members: [],
    updatedAt: row.updated_at,
  };
}

function mapRpcRoom(data: Record<string, unknown>): WatchPartyRoom {
  return mapRoom({
    code: String(data.code ?? ""),
    host_id: String(data.host_id ?? ""),
    host_name: String(data.host_name ?? ""),
    content: data.content as WatchPartyContent,
    playing: Boolean(data.playing),
    position_secs: Number(data.position_secs ?? 0),
    updated_at: data.updated_at ? String(data.updated_at) : undefined,
  });
}

/** Registra membership e restituisce la stanza (ingresso ospite). */
export async function joinCloudWatchParty(
  code: string,
): Promise<WatchPartyRoom | null> {
  const supabase = getSupabase();
  if (!supabase) return null;

  const { data, error } = await supabase.rpc("join_watch_party_room", {
    lookup_code: code.trim().toUpperCase(),
  });

  if (error) throw new Error(error.message);
  if (!data || typeof data !== "object") return null;

  return mapRpcRoom(data as Record<string, unknown>);
}

export async function createCloudWatchParty(
  hostId: string,
  hostName: string,
  content: WatchPartyContent,
): Promise<WatchPartyRoom> {
  const supabase = getSupabase();
  if (!supabase) throw new Error("Cloud non configurato");

  // Un host ha al massimo una stanza: rimuovi eventuali stanze precedenti e le chat collegate.
  const { data: oldRooms } = await supabase
    .from("watch_party_rooms")
    .select("code")
    .eq("host_id", hostId);

  if (oldRooms?.length) {
    await Promise.all(
      oldRooms.map((row) => deleteWatchPartyChat(String(row.code)).catch(() => undefined)),
    );
  }

  await supabase.from("watch_party_rooms").delete().eq("host_id", hostId);

  for (let attempt = 0; attempt < 8; attempt++) {
    const code = randomCode(6);
    const { data, error } = await supabase
      .from("watch_party_rooms")
      .insert({
        code,
        host_id: hostId,
        host_name: hostName,
        content,
        playing: false,
        position_secs: 0,
        is_active: true,
      })
      .select("*")
      .single();

    if (!error && data) {
      const room = mapRoom({
        ...data,
        content: data.content as WatchPartyContent,
      });
      void ensureWatchPartyChat(room.code).catch(() => {});
      return room;
    }
    if (error && !error.message.includes("duplicate")) {
      throw new Error(error.message);
    }
  }

  throw new Error("Impossibile creare la stanza cloud");
}

export async function fetchCloudWatchParty(
  code: string,
): Promise<WatchPartyRoom | null> {
  const supabase = getSupabase();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("watch_party_rooms")
    .select("*")
    .eq("code", code.toUpperCase())
    .eq("is_active", true)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;

  return mapRoom({
    ...data,
    content: data.content as WatchPartyContent,
  });
}

export async function updateCloudWatchPartySync(
  code: string,
  hostId: string,
  playing: boolean,
  position: number,
): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) return;

  const { error } = await supabase
    .from("watch_party_rooms")
    .update({
      playing,
      position_secs: position,
      updated_at: new Date().toISOString(),
    })
    .eq("code", code.toUpperCase())
    .eq("host_id", hostId);

  if (error) throw new Error(error.message);
}

/** Heartbeat leggero: mantiene la stanza viva per la pulizia server, non per la sync. */
export async function touchCloudWatchPartyRoom(
  code: string,
  hostId: string,
  playing: boolean,
  position: number,
): Promise<void> {
  await updateCloudWatchPartySync(code, hostId, playing, position);
}

export async function closeCloudWatchParty(
  code: string,
  hostId: string,
): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) return;

  const normalized = code.toUpperCase();
  await deleteWatchPartyChat(normalized).catch(() => undefined);

  await supabase
    .from("watch_party_rooms")
    .delete()
    .eq("code", normalized)
    .eq("host_id", hostId);
}

export function subscribeCloudWatchParty(
  code: string,
  onUpdate: (room: WatchPartyRoom) => void,
  onStatus?: (status: string) => void,
  onClosed?: () => void,
): () => void {
  const supabase = getSupabase();
  if (!supabase) return () => {};

  const channel = supabase
    .channel(`watch-party-${code.toUpperCase()}`)
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "watch_party_rooms",
        filter: `code=eq.${code.toUpperCase()}`,
      },
      (payload) => {
        const row = payload.new as {
          code: string;
          host_id: string;
          host_name: string;
          content: WatchPartyContent;
          playing: boolean;
          position_secs: number;
          updated_at: string;
          is_active?: boolean;
        };
        if (row.is_active === false) {
          onClosed?.();
          return;
        }
        onUpdate(mapRoom(row));
      },
    )
    .on(
      "postgres_changes",
      {
        // I filtri non vengono applicati agli eventi DELETE: confronto manuale.
        event: "DELETE",
        schema: "public",
        table: "watch_party_rooms",
      },
      (payload) => {
        const old = payload.old as { code?: string } | null;
        if (old?.code === code.toUpperCase()) {
          onClosed?.();
        }
      },
    )
    .subscribe((status) => {
      onStatus?.(status);
    });

  return () => {
    void supabase.removeChannel(channel);
  };
}

const CLOUD_POLL_MS = 2000;

/** Polling di riserva se Realtime non è disponibile (rete / dashboard Supabase). */
export function pollCloudWatchParty(
  code: string,
  onUpdate: (room: WatchPartyRoom) => void,
  onClosed?: () => void,
): () => void {
  let cancelled = false;
  let missing = 0;

  const tick = async () => {
    if (cancelled) return;
    try {
      const room = await fetchCloudWatchParty(code);
      if (room) {
        missing = 0;
        onUpdate(room);
      } else {
        // Dopo qualche giro a vuoto la stanza è stata chiusa/eliminata.
        missing += 1;
        if (missing >= 3) onClosed?.();
      }
    } catch {
      // ignora errori transitori di rete
    }
  };

  void tick();
  const id = window.setInterval(() => void tick(), CLOUD_POLL_MS);

  return () => {
    cancelled = true;
    window.clearInterval(id);
  };
}
