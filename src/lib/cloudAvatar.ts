import { isCloudEnabled } from "./cloudConfig";
import { getCurrentCloudProfile } from "./cloudAuth";
import {
  fetchProfileAvatarDataUrl,
  fetchProfiles,
  setProfileAvatarFromBytes,
} from "./profilesApi";
import {
  isAllowedProfileAvatarBytes,
  PROFILE_AVATAR_MAX_BYTES,
  primeProfileAvatarCache,
} from "./profileAvatar";
import { getSupabase } from "./supabaseClient";
import type { CloudFriend, LanFriendPresence } from "../types/cloud";
import type { Profile } from "../types/profile";

const BUCKET = "profile-avatars";

function avatarObjectPath(userId: string): string {
  return `${userId}/avatar.jpg`;
}

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const comma = dataUrl.indexOf(",");
  if (comma < 0) throw new Error("Immagine non valida");
  const base64 = dataUrl.slice(comma + 1);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function withCacheBuster(publicUrl: string): string {
  const separator = publicUrl.includes("?") ? "&" : "?";
  return `${publicUrl}${separator}v=${Date.now()}`;
}

export async function uploadCloudAvatar(jpegBytes: Uint8Array): Promise<string> {
  const supabase = getSupabase();
  if (!supabase) throw new Error("Cloud non configurato");

  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData.session?.user?.id;
  if (!userId) throw new Error("Accedi al tuo account cloud");

  if (!isAllowedProfileAvatarBytes(jpegBytes)) {
    throw new Error("Formato non supportato. Carica solo immagini JPEG (.jpg).");
  }
  if (jpegBytes.length > PROFILE_AVATAR_MAX_BYTES) {
    throw new Error("L'immagine è troppo grande (max 1 MB).");
  }

  const objectPath = avatarObjectPath(userId);
  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(objectPath, jpegBytes, {
      upsert: true,
      contentType: "image/jpeg",
      cacheControl: "3600",
    });

  if (uploadError) throw new Error(uploadError.message);

  const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(objectPath);
  const avatarUrl = withCacheBuster(urlData.publicUrl);

  const { error: profileError } = await supabase
    .from("cloud_profiles")
    .update({ avatar_url: avatarUrl })
    .eq("id", userId);

  if (profileError) throw new Error(profileError.message);

  return avatarUrl;
}

export async function clearCloudAvatar(): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) return;

  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData.session?.user?.id;
  if (!userId) return;

  await supabase.storage.from(BUCKET).remove([avatarObjectPath(userId)]);
  await supabase.from("cloud_profiles").update({ avatar_url: null }).eq("id", userId);
}

export async function downloadCloudAvatarToLocalProfile(
  profileId: string,
  avatarUrl: string,
): Promise<Profile | null> {
  const response = await fetch(avatarUrl);
  if (!response.ok) {
    throw new Error("Impossibile scaricare la foto profilo cloud");
  }

  const buffer = await response.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  if (!isAllowedProfileAvatarBytes(bytes)) {
    throw new Error("La foto profilo cloud non è un JPEG valido");
  }

  const profile = await setProfileAvatarFromBytes(profileId, bytes);
  const dataUrl = await fetchProfileAvatarDataUrl(profileId);
  if (dataUrl) primeProfileAvatarCache(profileId, dataUrl);
  window.dispatchEvent(new CustomEvent("branchefy:profiles-changed"));
  return profile;
}

export async function maybeImportCloudAvatar(profileId: string): Promise<Profile | null> {
  if (!isCloudEnabled()) return null;

  const cloud = await getCurrentCloudProfile();
  if (!cloud?.avatarUrl) return null;

  const profiles = await fetchProfiles();
  const local = profiles.find((p) => p.id === profileId);
  if (!local) return null;

  const hasPhoto =
    local.avatarStyle === "photo" &&
    Boolean(local.avatarImagePath);
  if (hasPhoto) return null;

  try {
    return await downloadCloudAvatarToLocalProfile(profileId, cloud.avatarUrl);
  } catch (err) {
    console.warn("[cloudAvatar] import failed:", err);
    return null;
  }
}

export async function importCloudAvatarToMatchingProfile(): Promise<Profile | null> {
  if (!isCloudEnabled()) return null;

  const cloud = await getCurrentCloudProfile();
  if (!cloud?.avatarUrl) return null;

  const profiles = await fetchProfiles();
  const target = profiles.find(
    (p) =>
      !(p.avatarStyle === "photo" && p.avatarImagePath) &&
      (p.role === "parent" || p.name === cloud.displayName),
  );
  if (!target) return null;

  try {
    return await downloadCloudAvatarToLocalProfile(target.id, cloud.avatarUrl);
  } catch (err) {
    console.warn("[cloudAvatar] import failed:", err);
    return null;
  }
}

export function enrichLanFriendsWithCloudAvatars(
  lanFriends: LanFriendPresence[],
  cloudFriends: CloudFriend[],
): LanFriendPresence[] {
  if (cloudFriends.length === 0) return lanFriends;

  const byName = new Map<string, string>();
  const byCode = new Map<string, string>();
  for (const friend of cloudFriends) {
    if (friend.avatarUrl) {
      byName.set(friend.displayName.trim().toLowerCase(), friend.avatarUrl);
      byCode.set(friend.friendCode.toUpperCase(), friend.avatarUrl);
    }
  }

  return lanFriends.map((friend) => {
    if (friend.avatarUrl) return friend;
    const fromName = byName.get(friend.displayName.trim().toLowerCase());
    const fromCode = byCode.get(friend.friendCode.toUpperCase());
    const avatarUrl = fromName ?? fromCode;
    return avatarUrl ? { ...friend, avatarUrl } : friend;
  });
}

function notifyCloudProfileChanged() {
  window.dispatchEvent(new CustomEvent("branchefy:cloud-profile-changed"));
}

export async function syncLocalProfileAvatarToCloud(profileId: string): Promise<string | null> {
  if (!isCloudEnabled()) return null;

  const supabase = getSupabase();
  if (!supabase) return null;

  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session?.user?.id) return null;

  const dataUrl = await fetchProfileAvatarDataUrl(profileId);
  if (!dataUrl) return null;

  const url = await uploadCloudAvatar(dataUrlToBytes(dataUrl));
  notifyCloudProfileChanged();
  return url;
}

export async function syncDataUrlAvatarToCloud(dataUrl: string): Promise<string | null> {
  if (!isCloudEnabled()) return null;

  const supabase = getSupabase();
  if (!supabase) return null;

  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session?.user?.id) return null;

  const url = await uploadCloudAvatar(dataUrlToBytes(dataUrl));
  notifyCloudProfileChanged();
  return url;
}
