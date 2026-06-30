export interface FriendRecord {
  friendCode: string;
  displayName: string;
  lastHost?: string;
  addedAt: string;
}

export interface WatchPartyContent {
  mediaId: string;
  title: string;
  streamUrl: string;
  isHls: boolean;
  posterUrl?: string;
  contentKind: string;
}

export interface WatchPartyMember {
  profileId: string;
  name: string;
  isHost: boolean;
}

export interface WatchPartyRoom {
  code: string;
  hostProfileId: string;
  hostName: string;
  hostIp?: string;
  content: WatchPartyContent;
  playing: boolean;
  positionSecs: number;
  members: WatchPartyMember[];
  updatedAt?: string;
}

export type WatchPartyRole = "host" | "guest";

export interface WatchPartySession {
  role: WatchPartyRole;
  room: WatchPartyRoom;
  hostIp?: string;
  /** lan = WebSocket locale, cloud = Supabase realtime */
  relay?: "lan" | "cloud";
}

export interface WatchPartySyncMessage {
  type: "sync";
  playing: boolean;
  position: number;
  sentAt: number;
}

export interface WatchPartyContentMessage {
  type: "content";
  content: WatchPartyContent;
}

export interface WatchPartyMembersMessage {
  type: "members";
  members: WatchPartyMember[];
}

export type WatchPartyWsMessage =
  | WatchPartySyncMessage
  | WatchPartyContentMessage
  | WatchPartyMembersMessage
  | { type: "error"; message: string };
