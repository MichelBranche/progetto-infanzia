import { getSupabase } from "./supabaseClient";
import type { WatchPartySession } from "../types/watchParty";

export interface WatchPartyInvitePayload {
  roomCode: string;
  title: string;
  hostId: string;
  hostName: string;
  relay: "cloud" | "lan";
  hostIp?: string;
  sentAt: number;
}

function inviteChannelName(userId: string): string {
  return `wp-invite:${userId}`;
}

export async function sendWatchPartyInvite(
  targetUserId: string,
  session: WatchPartySession,
  hostId: string,
  hostName: string,
): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) throw new Error("Cloud non configurato");
  if (session.role !== "host") {
    throw new Error("Solo l'host può invitare amici");
  }

  const relay = session.relay ?? "cloud";
  const hostIp = session.room.hostIp ?? session.hostIp;
  if (relay === "lan" && !hostIp) {
    throw new Error("IP host non disponibile per invito LAN");
  }

  const payload: WatchPartyInvitePayload = {
    roomCode: session.room.code,
    title: session.room.content.title,
    hostId,
    hostName,
    relay,
    hostIp: relay === "lan" ? hostIp : undefined,
    sentAt: Date.now(),
  };

  const channel = supabase.channel(inviteChannelName(targetUserId), {
    config: { broadcast: { self: false } },
  });

  await new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      reject(new Error("Timeout invito watch party"));
    }, 8000);

    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        window.clearTimeout(timeout);
        void channel
          .send({ type: "broadcast", event: "party-invite", payload })
          .then(() => {
            void supabase.removeChannel(channel);
            resolve();
          })
          .catch((err) => {
            void supabase.removeChannel(channel);
            reject(err);
          });
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        window.clearTimeout(timeout);
        void supabase.removeChannel(channel);
        reject(new Error("Canale invito non disponibile"));
      }
    });
  });
}

export function subscribeWatchPartyInvites(
  userId: string,
  onInvite: (payload: WatchPartyInvitePayload) => void,
): () => void {
  const supabase = getSupabase();
  if (!supabase || !userId) return () => {};

  const channelName = inviteChannelName(userId);

  for (const existing of supabase.getChannels()) {
    if (existing.topic === channelName) {
      void supabase.removeChannel(existing);
    }
  }

  const channel = supabase
    .channel(channelName, { config: { broadcast: { self: false } } })
    .on("broadcast", { event: "party-invite" }, ({ payload }) => {
      const body = payload as WatchPartyInvitePayload;
      if (!body?.roomCode || !body.hostId) return;
      if (body.hostId === userId) return;
      onInvite(body);
    })
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}
