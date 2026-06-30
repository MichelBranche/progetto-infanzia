import { getSupabase } from "./supabaseClient";
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

export async function createCloudWatchParty(
  hostId: string,
  hostName: string,
  content: WatchPartyContent,
): Promise<WatchPartyRoom> {
  const supabase = getSupabase();
  if (!supabase) throw new Error("Cloud non configurato");

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
      return mapRoom({
        ...data,
        content: data.content as WatchPartyContent,
      });
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

export async function closeCloudWatchParty(
  code: string,
  hostId: string,
): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) return;

  await supabase
    .from("watch_party_rooms")
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq("code", code.toUpperCase())
    .eq("host_id", hostId);
}

export function subscribeCloudWatchParty(
  code: string,
  onUpdate: (room: WatchPartyRoom) => void,
  onStatus?: (status: string) => void,
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
        };
        onUpdate(mapRoom(row));
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
): () => void {
  let cancelled = false;

  const tick = async () => {
    if (cancelled) return;
    try {
      const room = await fetchCloudWatchParty(code);
      if (room) onUpdate(room);
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
