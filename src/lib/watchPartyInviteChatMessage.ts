import type { WatchPartyInvitePayload } from "./cloudWatchPartyInvite";
import type { WatchPartySession } from "../types/watchParty";

export const WATCH_PARTY_INVITE_CHAT_PREFIX = "branchefy:watch-party-invite:";

export function buildWatchPartyInviteChatBody(
  payload: WatchPartyInvitePayload,
): string {
  return `${WATCH_PARTY_INVITE_CHAT_PREFIX}${JSON.stringify(payload)}`;
}

export function parseWatchPartyInviteChatBody(
  body: string,
): WatchPartyInvitePayload | null {
  const trimmed = body.trim();
  if (!trimmed.startsWith(WATCH_PARTY_INVITE_CHAT_PREFIX)) return null;
  try {
    const payload = JSON.parse(
      trimmed.slice(WATCH_PARTY_INVITE_CHAT_PREFIX.length),
    ) as WatchPartyInvitePayload;
    if (!payload?.roomCode || !payload.hostId || !payload.title) return null;
    return payload;
  } catch {
    return null;
  }
}

export function isWatchPartyInviteChatBody(body: string): boolean {
  return parseWatchPartyInviteChatBody(body) !== null;
}

export function watchPartyInviteChatPreview(title: string): string {
  return `Invito watch party · ${title}`;
}

export function formatChatMessagePreview(body: string): string {
  const invite = parseWatchPartyInviteChatBody(body);
  if (invite) return watchPartyInviteChatPreview(invite.title);
  const trimmed = body.trim();
  if (trimmed.length <= 120) return trimmed;
  return `${trimmed.slice(0, 117)}…`;
}

export function guestSessionFromInvitePayload(
  payload: WatchPartyInvitePayload,
): WatchPartySession {
  if (payload.relay === "lan" && payload.hostIp) {
    return {
      role: "guest",
      relay: "lan",
      hostIp: payload.hostIp,
      room: {
        code: payload.roomCode,
        hostProfileId: payload.hostId,
        hostName: payload.hostName,
        hostIp: payload.hostIp,
        content: {
          mediaId: `party:${payload.roomCode}`,
          title: payload.title,
          streamUrl: "",
          isHls: false,
          contentKind: "local",
        },
        playing: false,
        positionSecs: 0,
        members: [],
      },
    };
  }

  return {
    role: "guest",
    relay: "cloud",
    room: {
      code: payload.roomCode,
      hostProfileId: payload.hostId,
      hostName: payload.hostName,
      content: {
        mediaId: `party:${payload.roomCode}`,
        title: payload.title,
        streamUrl: "",
        isHls: false,
        contentKind: "streaming",
      },
      playing: false,
      positionSecs: 0,
      members: [],
    },
  };
}
