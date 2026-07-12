import { listCloudFriends } from "./cloudFriends";
import { fetchFriendsPresence } from "./cloudPresence";
import type { CloudFriend, FriendPresence } from "../types/cloud";

export interface BootFriendsPayload {
  friends: CloudFriend[];
  presence: Record<string, FriendPresence>;
  fetchedAt: number;
}

let cache: BootFriendsPayload | null = null;
let inflight: Promise<BootFriendsPayload | null> | null = null;

export function hasBootFriendsCache(): boolean {
  return cache != null;
}

export function getBootFriendsCache(): BootFriendsPayload | null {
  return cache;
}

/** Precarica lista amici + presence (durante intro/prepare o schermata profili). */
export function prefetchBootFriends(): Promise<BootFriendsPayload | null> {
  if (cache) return Promise.resolve(cache);

  if (!inflight) {
    inflight = (async () => {
      try {
        const list = await listCloudFriends();
        const ids = list.map((f) => f.userId);
        const presence =
          ids.length > 0 ? await fetchFriendsPresence(ids) : {};
        cache = { friends: list, presence, fetchedAt: Date.now() };
        return cache;
      } catch {
        return null;
      } finally {
        inflight = null;
      }
    })();
  }

  return inflight;
}

export function clearBootFriendsCache() {
  cache = null;
  inflight = null;
}
