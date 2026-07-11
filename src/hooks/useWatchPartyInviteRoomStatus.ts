import { useEffect, useState } from "react";
import type { WatchPartyInvitePayload } from "../lib/cloudWatchPartyInvite";
import {
  subscribeWatchPartyInviteRoomStatus,
  type WatchPartyRoomStatus,
  watchPartyRoomStatusLabel,
} from "../lib/watchPartyRoomStatus";

export function useWatchPartyInviteRoomStatus(
  payload: WatchPartyInvitePayload,
): {
  status: WatchPartyRoomStatus;
  statusLabel: string;
  canJoin: boolean;
} {
  const [status, setStatus] = useState<WatchPartyRoomStatus>("checking");

  useEffect(() => {
    setStatus("checking");
    return subscribeWatchPartyInviteRoomStatus(payload, setStatus);
  }, [payload.hostIp, payload.relay, payload.roomCode]);

  return {
    status,
    statusLabel: watchPartyRoomStatusLabel(status),
    canJoin: status === "active",
  };
}
