import type { FriendPresence } from "../types/cloud";
import { isPresenceOnline, PRESENCE_ONLINE_MS } from "./cloudPresence";

function relativeTime(iso: string): string {
  const diff = Date.now() - Date.parse(iso);
  if (Number.isNaN(diff) || diff < 0) return "di recente";
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "adesso";
  if (mins < 60) return `${mins} min fa`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} h fa`;
  const days = Math.floor(hours / 24);
  return `${days} g fa`;
}

export function formatPresenceLabel(
  presence?: FriendPresence,
): string | undefined {
  if (!presence?.lastSeenAt) return undefined;

  if (isPresenceOnline(presence.lastSeenAt)) {
    if (presence.status === "away") return "Assente · app aperta";
    if (presence.activity) return presence.activity;
    return "Online su Branchefy";
  }

  return `Visto ${relativeTime(presence.lastSeenAt)}`;
}

export { PRESENCE_ONLINE_MS };
