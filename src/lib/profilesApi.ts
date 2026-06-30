import { invoke, isTauri } from "@tauri-apps/api/core";
import type { CreateProfileInput, Profile, UpdateProfileInput } from "../types/profile";
import {
  createDevProfile,
  deleteDevProfile,
  fetchDevProfiles,
  removeDevProfilePin,
  setDevProfilePin,
  updateDevProfile,
  verifyDevProfilePin,
} from "./profilesDevStore";

export async function fetchProfiles(): Promise<Profile[]> {
  if (isTauri()) {
    return invoke<Profile[]>("get_profiles");
  }
  return fetchDevProfiles();
}

export async function createProfile(input: CreateProfileInput): Promise<Profile> {
  if (isTauri()) {
    return invoke<Profile>("create_profile_cmd", { input });
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
  return updateDevProfile(id, input);
}

export async function deleteProfile(id: string): Promise<void> {
  if (isTauri()) {
    return invoke("delete_profile_cmd", { id });
  }
  deleteDevProfile(id);
}

export async function verifyProfilePin(id: string, pin: string): Promise<boolean> {
  if (isTauri()) {
    return invoke<boolean>("verify_profile_pin_cmd", { id, pin });
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
  setDevProfilePin(profileId, pin, currentPin);
}

export async function removeProfilePin(
  profileId: string,
  currentPin: string,
): Promise<void> {
  if (isTauri()) {
    return invoke("remove_profile_pin_cmd", { profileId, currentPin });
  }
  removeDevProfilePin(profileId, currentPin);
}
