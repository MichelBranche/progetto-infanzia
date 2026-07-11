import {
  createProfile,
  fetchProfiles,
  updateProfile,
} from "./profilesApi";
import {
  downloadCloudAvatarToLocalProfile,
  syncLocalProfileAvatarToCloud,
} from "./cloudAvatar";
import { syncStreamingProgressWithCloud } from "./cloudStreamingProgress";
import { ACTIVE_PROFILE_KEY, PROFILE_COLORS, PROFILE_EMOJIS } from "../types/profile";
import type { CloudProfile } from "../types/cloud";
import type { Profile } from "../types/profile";

const LINK_KEY = "branchefy:cloud-profile-links";

function readProfileLinks(): Record<string, string> {
  try {
    const raw = localStorage.getItem(LINK_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, string>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeProfileLink(cloudUserId: string, profileId: string) {
  const links = readProfileLinks();
  links[cloudUserId] = profileId;
  localStorage.setItem(LINK_KEY, JSON.stringify(links));
}

function pickLinkedProfile(
  profiles: Profile[],
  cloud: CloudProfile,
): Profile | undefined {
  const linkedId = readProfileLinks()[cloud.id];
  if (linkedId) {
    const linked = profiles.find((p) => p.id === linkedId);
    if (linked) return linked;
  }

  const activeId = sessionStorage.getItem(ACTIVE_PROFILE_KEY);
  if (activeId) {
    const active = profiles.find((p) => p.id === activeId);
    if (active) return active;
  }

  return (
    profiles.find((p) => p.role === "parent") ??
    profiles.find(
      (p) => p.name.trim().toLowerCase() === cloud.displayName.trim().toLowerCase(),
    ) ??
    profiles[0]
  );
}

export async function syncCloudAccountWithApp(
  cloud: CloudProfile,
): Promise<Profile | null> {
  let profiles = await fetchProfiles();
  let target = pickLinkedProfile(profiles, cloud);

  if (!target) {
    target = await createProfile({
      name: cloud.displayName,
      role: "parent",
      avatarColor: PROFILE_COLORS[0],
      avatarEmoji: PROFILE_EMOJIS[0],
      avatarStyle: "gradient",
    });
    profiles = await fetchProfiles();
  }

  writeProfileLink(cloud.id, target.id);

  const name = cloud.displayName.trim();
  if (name && target.name !== name) {
    target = await updateProfile(target.id, { name });
  }

  if (cloud.avatarUrl) {
    try {
      const withAvatar = await downloadCloudAvatarToLocalProfile(
        target.id,
        cloud.avatarUrl,
      );
      if (withAvatar) target = withAvatar;
    } catch (err) {
      console.warn("[cloudProfileSync] avatar import failed:", err);
    }
  } else {
    await syncLocalProfileAvatarToCloud(target.id).catch(() => {});
  }

  await syncStreamingProgressWithCloud(target.id).catch((err) => {
    console.warn("[cloudProfileSync] progress sync failed:", err);
  });

  window.dispatchEvent(
    new CustomEvent("branchefy:cloud-sync-complete", {
      detail: { profileId: target.id },
    }),
  );
  window.dispatchEvent(new CustomEvent("branchefy:profiles-changed"));
  window.dispatchEvent(new CustomEvent("branchefy:streaming-progress-changed"));

  return target;
}
