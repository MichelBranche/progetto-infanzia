export type ProfileRole = "parent" | "child" | "other";

export type ProfileAvatarStyle = "emoji" | "initial" | "gradient" | "photo";

export interface Profile {
  id: string;
  name: string;
  role: ProfileRole;
  avatarColor: string;
  accentColor?: string;
  avatarStyle?: ProfileAvatarStyle;
  avatarEmoji?: string;
  /** Percorso file locale (Tauri) o data URL (browser dev). */
  avatarImagePath?: string;
  createdAt: string;
  hasPin: boolean;
}

export interface CreateProfileInput {
  name: string;
  role: ProfileRole;
  avatarColor: string;
  accentColor?: string;
  avatarStyle?: ProfileAvatarStyle;
  avatarEmoji?: string;
}

export interface UpdateProfileInput {
  name?: string;
  role?: ProfileRole;
  avatarColor?: string;
  accentColor?: string | null;
  avatarStyle?: ProfileAvatarStyle;
  avatarEmoji?: string | null;
  avatarImagePath?: string | null;
}

export const PROFILE_COLORS = [
  "#6b7fff",
  "#3ddbd9",
  "#ff8a6b",
  "#b8a4ff",
  "#ffc947",
  "#ff6b9d",
  "#4ade80",
  "#f472b6",
  "#38bdf8",
  "#a78bfa",
  "#fb7185",
  "#34d399",
  "#fbbf24",
  "#94a3b8",
  "#f97316",
  "#818cf8",
] as const;

export const PROFILE_EMOJIS = [
  "👨",
  "👩",
  "👦",
  "👧",
  "🧒",
  "👶",
  "🦸",
  "🧙",
  "🐻",
  "⭐",
  "🎬",
  "🎨",
  "🎮",
  "🎧",
  "📚",
  "🦁",
  "🐼",
  "🦊",
  "🐶",
  "🐱",
  "🌟",
  "🍿",
  "🎭",
  "🏆",
] as const;

export const ACTIVE_PROFILE_KEY = "branchefy-active-profile";

export function isParentProfile(profile: Profile): boolean {
  return profile.role === "parent";
}

export function roleLabel(role: ProfileRole): string {
  switch (role) {
    case "parent":
      return "Genitore";
    case "child":
      return "Bambino";
    default:
      return "Ospite";
  }
}

export function profileInitial(name: string): string {
  return name.trim().charAt(0).toUpperCase() || "?";
}
