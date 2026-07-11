import type { WatchPartyInvitePayload } from "./cloudWatchPartyInvite";

export const WATCH_PARTY_JOIN_EVENT = "branchefy:join-watch-party-invite";
const PENDING_INVITE_KEY = "branchefy-pending-wp-invite";

export function requestJoinWatchPartyFromInvite(
  payload: WatchPartyInvitePayload,
): void {
  sessionStorage.setItem(PENDING_INVITE_KEY, JSON.stringify(payload));
  window.dispatchEvent(new CustomEvent(WATCH_PARTY_JOIN_EVENT));
}

export function consumePendingWatchPartyInvite(): WatchPartyInvitePayload | null {
  const raw = sessionStorage.getItem(PENDING_INVITE_KEY);
  if (!raw) return null;
  sessionStorage.removeItem(PENDING_INVITE_KEY);
  try {
    return JSON.parse(raw) as WatchPartyInvitePayload;
  } catch {
    return null;
  }
}
