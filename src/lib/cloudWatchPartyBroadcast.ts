import { getSupabase } from "./supabaseClient";
import type {
  WatchPartyContent,
  WatchPartyMember,
  WatchPartyRole,
} from "../types/watchParty";

export interface WatchPartyBroadcastSync {
  playing: boolean;
  position: number;
  sentAt: number;
}

export interface WatchPartyBroadcastStateResponse extends WatchPartyBroadcastSync {
  content?: WatchPartyContent;
}

export interface WatchPartyBroadcastHandlers {
  onSync?: (msg: WatchPartyBroadcastSync) => void;
  onContent?: (content: WatchPartyContent) => void;
  onStateRequest?: (requesterId: string) => void;
  onStateResponse?: (msg: WatchPartyBroadcastStateResponse) => void;
  onRoomClosed?: () => void;
  onMembers?: (members: WatchPartyMember[]) => void;
  onStatus?: (status: string) => void;
}

export interface WatchPartyBroadcastConnection {
  sendSync: (sync: WatchPartyBroadcastSync) => void;
  sendContent: (content: WatchPartyContent) => void;
  requestState: () => void;
  sendStateResponse: (payload: WatchPartyBroadcastStateResponse) => void;
  sendRoomClosed: () => void;
  close: () => void;
}

const noopConnection: WatchPartyBroadcastConnection = {
  sendSync: () => {},
  sendContent: () => {},
  requestState: () => {},
  sendStateResponse: () => {},
  sendRoomClosed: () => {},
  close: () => {},
};

function channelName(code: string): string {
  return `watch-party:${code.trim().toUpperCase()}`;
}

function mapPresence(
  state: Record<string, Array<Record<string, unknown>>>,
): WatchPartyMember[] {
  const byId = new Map<string, WatchPartyMember>();
  for (const presences of Object.values(state)) {
    for (const row of presences) {
      const profileId = String(row.profileId ?? "");
      if (!profileId) continue;
      byId.set(profileId, {
        profileId,
        name: String(row.name ?? "Utente"),
        isHost: Boolean(row.isHost),
      });
    }
  }
  return [...byId.values()];
}

export function connectWatchPartyBroadcast(
  code: string,
  role: WatchPartyRole,
  profileId: string,
  profileName: string,
  handlers: WatchPartyBroadcastHandlers,
): WatchPartyBroadcastConnection {
  const supabase = getSupabase();
  if (!supabase) return noopConnection;

  const channel = supabase.channel(channelName(code), {
    config: {
      broadcast: { self: false },
      presence: { key: profileId },
    },
  });

  channel
    .on("broadcast", { event: "sync" }, ({ payload }) => {
      handlers.onSync?.(payload as WatchPartyBroadcastSync);
    })
    .on("broadcast", { event: "content" }, ({ payload }) => {
      const body = payload as { content?: WatchPartyContent };
      if (body.content) handlers.onContent?.(body.content);
    })
    .on("broadcast", { event: "state-request" }, ({ payload }) => {
      const body = payload as { requesterId?: string };
      if (body.requesterId) handlers.onStateRequest?.(body.requesterId);
    })
    .on("broadcast", { event: "state-response" }, ({ payload }) => {
      handlers.onStateResponse?.(payload as WatchPartyBroadcastStateResponse);
    })
    .on("broadcast", { event: "room-closed" }, () => {
      handlers.onRoomClosed?.();
    })
    .on("presence", { event: "sync" }, () => {
      handlers.onMembers?.(mapPresence(channel.presenceState()));
    })
    .on("presence", { event: "join" }, () => {
      handlers.onMembers?.(mapPresence(channel.presenceState()));
    })
    .on("presence", { event: "leave" }, () => {
      handlers.onMembers?.(mapPresence(channel.presenceState()));
    })
    .subscribe(async (status) => {
      handlers.onStatus?.(status);
      if (status === "SUBSCRIBED") {
        await channel.track({
          profileId,
          name: profileName,
          isHost: role === "host",
        });
        if (role === "guest") {
          channel.send({
            type: "broadcast",
            event: "state-request",
            payload: { requesterId: profileId },
          });
        }
      }
    });

  const send = (event: string, payload: unknown) => {
    void channel.send({ type: "broadcast", event, payload });
  };

  return {
    sendSync: (sync) => send("sync", sync),
    sendContent: (content) => send("content", { content }),
    requestState: () => send("state-request", { requesterId: profileId }),
    sendStateResponse: (payload) => send("state-response", payload),
    sendRoomClosed: () => send("room-closed", {}),
    close: () => {
      void supabase.removeChannel(channel);
    },
  };
}
