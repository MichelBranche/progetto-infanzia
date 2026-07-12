import { isTauri } from "@tauri-apps/api/core";
import { isWebShell, runtimeInvoke as invoke } from "./runtimeInvoke";
import type { CreateProfileInput, Profile, UpdateProfileInput } from "../types/profile";
import { invalidateProfileAvatarCache } from "./profileAvatar";
import {
  createDevProfile,
  deleteDevProfile,
  fetchDevProfiles,
  removeDevProfilePin,
  setDevProfilePin,
  updateDevProfile,
  verifyDevProfilePin,
} from "./profilesDevStore";
import {
  createWebProfile,
  deleteWebProfile,
  fetchWebProfileAvatarDataUrl,
  fetchWebProfiles,
  removeWebProfilePin,
  setWebProfilePin,
  updateWebProfile,
  verifyWebProfilePin,
} from "./profilesWebStore";

export async function fetchProfiles(): Promise<Profile[]> {
  if (isTauri()) {
    return invoke<Profile[]>("get_profiles");
  }
  if (isWebShell()) {
    return fetchWebProfiles();
  }
  return fetchDevProfiles();
}

export async function createProfile(input: CreateProfileInput): Promise<Profile> {
  if (isTauri()) {
    return invoke<Profile>("create_profile_cmd", { input });
  }
  if (isWebShell()) {
    return createWebProfile(input);
  }
  return createDevProfile(input);
}

export async function updateProfile(
  id: string,
  input: UpdateProfileInput,
): Promise<Profile> {
  if (isTauri()) {
    return invoke<Profile>("update_profile_cmd", { id, input });
  }
  if (isWebShell()) {
    return updateWebProfile(id, input);
  }
  return updateDevProfile(id, input);
}

export async function deleteProfile(id: string): Promise<void> {
  if (isTauri()) {
    return invoke("delete_profile_cmd", { id });
  }
  if (isWebShell()) {
    return deleteWebProfile(id);
  }
  deleteDevProfile(id);
}

export async function verifyProfilePin(id: string, pin: string): Promise<boolean> {
  if (isTauri()) {
    return invoke<boolean>("verify_profile_pin_cmd", { id, pin });
  }
  if (isWebShell()) {
    return verifyWebProfilePin(id, pin);
  }
  return verifyDevProfilePin(id, pin);
}

export async function setProfilePin(
  profileId: string,
  pin: string,
  currentPin?: string,
): Promise<void> {
  if (isTauri()) {
    return invoke("set_profile_pin_cmd", {
      profileId,
      pin,
      currentPin: currentPin ?? null,
    });
  }
  if (isWebShell()) {
    return setWebProfilePin(profileId, pin, currentPin);
  }
  setDevProfilePin(profileId, pin, currentPin);
}

export async function removeProfilePin(
  profileId: string,
  currentPin: string,
): Promise<void> {
  if (isTauri()) {
    return invoke("remove_profile_pin_cmd", { profileId, currentPin });
  }
  if (isWebShell()) {
    return removeWebProfilePin(profileId, currentPin);
  }
  removeDevProfilePin(profileId, currentPin);
}

export async function setProfileAvatar(
  profileId: string,
  sourcePath: string,
): Promise<Profile> {
  let profile: Profile;
  if (isTauri()) {
    profile = await invoke<Profile>("set_profile_avatar_cmd", { profileId, sourcePath });
    invalidateProfileAvatarCache(profileId);
  } else if (isWebShell() && sourcePath.startsWith("data:")) {
    const comma = sourcePath.indexOf(",");
    const base64 = sourcePath.slice(comma + 1);
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    profile = await setProfileAvatarFromBytes(profileId, bytes);
  } else if (isWebShell()) {
    throw new Error("Su web carica solo immagini JPEG dal dispositivo.");
  } else {
    profile = await updateDevProfile(profileId, {
      avatarStyle: "photo",
      avatarImagePath: sourcePath,
    });
  }

  if (sourcePath.startsWith("data:")) {
    const { syncDataUrlAvatarToCloud } = await import("./cloudAvatar");
    await syncDataUrlAvatarToCloud(sourcePath).catch((err) => {
      console.warn("[cloudAvatar] upload failed:", err);
    });
  } else {
    const { syncLocalProfileAvatarToCloud } = await import("./cloudAvatar");
    await syncLocalProfileAvatarToCloud(profileId).catch((err) => {
      console.warn("[cloudAvatar] upload failed:", err);
    });
  }

  return profile;
}

export async function setProfileAvatarFromBytes(
  profileId: string,
  bytes: Uint8Array,
): Promise<Profile> {
  if (isTauri()) {
    const profile = await invoke<Profile>("set_profile_avatar_bytes_cmd", {
      profileId,
      bytes: Array.from(bytes),
    });
    invalidateProfileAvatarCache(profileId);
    const { syncLocalProfileAvatarToCloud } = await import("./cloudAvatar");
    await syncLocalProfileAvatarToCloud(profileId).catch(() => {});
    return profile;
  }

  const blob = new Blob([bytes], { type: "image/jpeg" });
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error("Impossibile leggere l'immagine."));
    };
    reader.onerror = () => reject(new Error("Impossibile leggere l'immagine."));
    reader.readAsDataURL(blob);
  });

  if (isWebShell()) {
    return updateWebProfile(profileId, {
      avatarStyle: "photo",
      avatarImagePath: dataUrl,
    });
  }

  return updateDevProfile(profileId, {
    avatarStyle: "photo",
    avatarImagePath: dataUrl,
  });
}

export async function fetchProfileAvatarDataUrl(
  profileId: string,
): Promise<string | null> {
  if (isTauri()) {
    return invoke<string | null>("get_profile_avatar_data_url_cmd", { profileId });
  }
  if (isWebShell()) {
    return fetchWebProfileAvatarDataUrl(profileId);
  }
  const profiles = await fetchDevProfiles();
  const profile = profiles.find((p) => p.id === profileId);
  if (profile?.avatarImagePath?.startsWith("data:")) {
    return profile.avatarImagePath;
  }
  return null;
}
