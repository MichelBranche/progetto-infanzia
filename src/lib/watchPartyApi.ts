import { runtimeInvoke as invoke } from "./runtimeInvoke";
import type {
  FriendRecord,
  WatchPartyContent,
  WatchPartyRoom,
} from "../types/watchParty";

const STREAM_PORT = 17890;

export function localhostWatchPartyWsUrl(
  code: string,
  profileId: string,
  name: string,
): string {
  const params = new URLSearchParams({
    code: code.toUpperCase(),
    profileId,
    name,
  });
  return `ws://127.0.0.1:${STREAM_PORT}/watch-party/ws?${params}`;
}

export function lanWatchPartyWsUrl(
  host: string,
  code: string,
  profileId: string,
  name: string,
): string {
  const params = new URLSearchParams({
    code: code.toUpperCase(),
    profileId,
    name,
  });
  return `ws://${host}:${STREAM_PORT}/watch-party/ws?${params}`;
}

export async function getFriendCode(profileId: string): Promise<string> {
  return invoke<string>("get_friend_code_cmd", { profileId });
}

export async function listFriends(profileId: string): Promise<FriendRecord[]> {
  return invoke<FriendRecord[]>("list_friends_cmd", { profileId });
}

export async function addFriend(
  profileId: string,
  friendCode: string,
  displayName?: string,
): Promise<FriendRecord> {
  return invoke<FriendRecord>("add_friend_cmd", {
    profileId,
    friendCode: friendCode.toUpperCase(),
    displayName: displayName ?? null,
  });
}

export async function removeFriend(
  profileId: string,
  friendCode: string,
): Promise<void> {
  return invoke("remove_friend_cmd", {
    profileId,
    friendCode: friendCode.toUpperCase(),
  });
}

export async function syncLanFriendsPresence(
  profileId: string,
  displayName: string,
  deepScan = false,
  cloudFriendCode?: string,
  avatarUrl?: string,
): Promise<import("../types/cloud").LanFriendPresence[]> {
  return invoke("sync_lan_friends_presence_cmd", {
    profileId,
    displayName,
    deepScan,
    cloudFriendCode: cloudFriendCode ?? null,
    avatarUrl: avatarUrl ?? null,
  });
}

export interface CreateWatchPartyInput {
  profileName: string;
  mediaId: string;
  title: string;
  streamUrl: string;
  isHls: boolean;
  posterUrl?: string;
  contentKind: string;
}

export async function createWatchParty(
  profileId: string,
  input: CreateWatchPartyInput,
): Promise<WatchPartyRoom> {
  return invoke<WatchPartyRoom>("create_watch_party_cmd", { profileId, input });
}

export async function getWatchParty(roomCode: string): Promise<WatchPartyRoom> {
  return invoke<WatchPartyRoom>("get_watch_party_cmd", {
    roomCode: roomCode.toUpperCase(),
  });
}

export async function closeWatchParty(
  profileId: string,
  roomCode: string,
): Promise<void> {
  return invoke("close_watch_party_cmd", {
    profileId,
    roomCode: roomCode.toUpperCase(),
  });
}

export function contentKindFromMedia(
  mediaId: string,
  remotePlayback?: boolean,
): string {
  if (remotePlayback) return "streaming";
  if (mediaId.startsWith("sc:") || mediaId.startsWith("stremio:")) {
    return "streaming";
  }
  return "local";
}

export function watchPartyContentFromPlayer(
  mediaId: string,
  title: string,
  streamUrl: string,
  isHls: boolean,
  posterUrl?: string,
  remotePlayback?: boolean,
): WatchPartyContent {
  return {
    mediaId,
    title,
    streamUrl,
    isHls,
    posterUrl,
    contentKind: contentKindFromMedia(mediaId, remotePlayback),
  };
}
