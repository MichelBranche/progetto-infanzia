import { isTauri } from "@tauri-apps/api/core";
import type { ProfileCustomizeValue } from "../components/profile/ProfileCustomizeForm";
import { profileCustomizeToUpdate } from "../components/profile/ProfileCustomizeForm";
import type { Profile } from "../types/profile";
import { isDbStoredAvatar } from "./profileAvatar";
import { setProfileAvatar, updateProfile } from "./profilesApi";

function shouldApplyAvatarUpload(path: string): boolean {
  if (!path) return false;
  if (path.startsWith("data:")) return true;
  if (isDbStoredAvatar(path)) return false;
  return true;
}

/** Salva nome, stile avatar e foto (Tauri salva i JPEG via comando dedicato). */
export async function applyProfileCustomization(
  profileId: string,
  value: ProfileCustomizeValue,
): Promise<Profile> {
  const input = profileCustomizeToUpdate(value);

  // Su Tauri update_profile non sostituisce la foto: va impostata a parte.
  const metadataInput =
    isTauri() && value.avatarStyle === "photo"
      ? { ...input, avatarImagePath: undefined }
      : input;

  let profile = await updateProfile(profileId, metadataInput);

  if (
    value.avatarStyle === "photo" &&
    value.avatarImagePath &&
    shouldApplyAvatarUpload(value.avatarImagePath)
  ) {
    profile = await setProfileAvatar(profileId, value.avatarImagePath);
  }

  return profile;
}
