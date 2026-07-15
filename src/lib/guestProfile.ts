import type { Profile } from "../types/profile";

export const GUEST_PROFILE_ID = "branchefy-guest-session";

export const GUEST_PROFILE: Profile = {
  id: GUEST_PROFILE_ID,
  name: "Ospite",
  role: "other",
  avatarColor: "#94a3b8",
  accentColor: "#64748b",
  avatarStyle: "initial",
  createdAt: "guest",
  hasPin: false,
};

export function isGuestProfile(profile: Pick<Profile, "id"> | null | undefined): boolean {
  return profile?.id === GUEST_PROFILE_ID;
}
