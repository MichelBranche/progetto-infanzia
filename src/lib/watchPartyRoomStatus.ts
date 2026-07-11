import { fetchCloudWatchParty, subscribeCloudWatchParty } from "./cloudWatchParty";
import type { WatchPartyInvitePayload } from "./cloudWatchPartyInvite";
import { getWatchParty, lanWatchPartyWsUrl } from "./watchPartyApi";

export type WatchPartyRoomStatus =
  | "checking"
  | "active"
  | "closed"
  | "unavailable";

const LAN_PROBE_MS = 3500;
const CLOUD_POLL_MS = 20_000;

export function watchPartyRoomStatusLabel(status: WatchPartyRoomStatus): string {
  switch (status) {
    case "active":
      return "Stanza attiva";
    case "closed":
      return "Stanza chiusa";
    case "unavailable":
      return "Stato non verificabile";
    default:
      return "Verifica stanza…";
  }
}

export async function checkCloudWatchPartyRoomStatus(
  code: string,
): Promise<Exclude<WatchPartyRoomStatus, "checking">> {
  try {
    const room = await fetchCloudWatchParty(code);
    return room ? "active" : "closed";
  } catch {
    return "unavailable";
  }
}

export async function probeLanWatchPartyRoom(
  hostIp: string,
  roomCode: string,
): Promise<Exclude<WatchPartyRoomStatus, "checking">> {
  const host = hostIp.trim() || "127.0.0.1";
  const code = roomCode.trim().toUpperCase();
  if (!code) return "closed";

  try {
    await getWatchParty(code);
    return "active";
  } catch {
    // Stanza non locale: prova WebSocket sull'host LAN.
  }

  return new Promise((resolve) => {
    let settled = false;
    const finish = (value: Exclude<WatchPartyRoomStatus, "checking">) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      try {
        ws.close();
      } catch {
        // ignore
      }
      resolve(value);
    };

    const ws = new WebSocket(
      lanWatchPartyWsUrl(host, code, "status-probe", "Status"),
    );
    const timeout = window.setTimeout(() => finish("closed"), LAN_PROBE_MS);

    ws.onmessage = () => finish("active");
    ws.onerror = () => finish("closed");
    ws.onclose = () => {
      if (!settled) finish("closed");
    };
  });
}

export async function checkWatchPartyInviteRoomStatus(
  payload: WatchPartyInvitePayload,
): Promise<Exclude<WatchPartyRoomStatus, "checking">> {
  if (payload.relay === "lan") {
    return probeLanWatchPartyRoom(payload.hostIp ?? "127.0.0.1", payload.roomCode);
  }
  return checkCloudWatchPartyRoomStatus(payload.roomCode);
}

export function subscribeWatchPartyInviteRoomStatus(
  payload: WatchPartyInvitePayload,
  onStatus: (status: Exclude<WatchPartyRoomStatus, "checking">) => void,
): () => void {
  if (payload.relay === "lan") {
    let cancelled = false;
    const refresh = async () => {
      if (cancelled) return;
      const next = await probeLanWatchPartyRoom(
        payload.hostIp ?? "127.0.0.1",
        payload.roomCode,
      );
      if (!cancelled) onStatus(next);
    };
    void refresh();
    const id = window.setInterval(() => void refresh(), CLOUD_POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }

  let cancelled = false;
  const refresh = async () => {
    if (cancelled) return;
    const next = await checkCloudWatchPartyRoomStatus(payload.roomCode);
    if (!cancelled) onStatus(next);
  };

  void refresh();
  const pollId = window.setInterval(() => void refresh(), CLOUD_POLL_MS);
  const unsubRealtime = subscribeCloudWatchParty(
    payload.roomCode,
    () => {
      if (!cancelled) onStatus("active");
    },
    undefined,
    () => {
      if (!cancelled) onStatus("closed");
    },
  );

  return () => {
    cancelled = true;
    window.clearInterval(pollId);
    unsubRealtime();
  };
}
