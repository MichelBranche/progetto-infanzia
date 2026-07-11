import type { AppTopNavFriendEntry } from "../hooks/useAppTopNavFriendsList";
import type { CloudProfile } from "../types/cloud";
import type { WatchPartySession } from "../types/watchParty";

export function hostSessionInviteHostIp(
  session: WatchPartySession | null,
): string | undefined {
  if (!session) return undefined;
  return session.room.hostIp ?? session.hostIp;
}

export function canShowHostPartyInvites(
  hostSession: WatchPartySession | null,
  cloudProfile: CloudProfile | null,
): boolean {
  if (!hostSession || hostSession.role !== "host") return false;
  if (!cloudProfile) return false;
  if (hostSession.relay === "lan" && !hostSessionInviteHostIp(hostSession)) {
    return false;
  }
  return true;
}

export function canInviteFriendToHostSession(
  friend: AppTopNavFriendEntry,
  hostSession: WatchPartySession | null,
  cloudProfile: CloudProfile | null,
): boolean {
  if (!canShowHostPartyInvites(hostSession, cloudProfile)) return false;
  return friend.kind === "cloud" && Boolean(friend.userId);
}
