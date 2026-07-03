import { motion } from "framer-motion";
import type { Profile, ProfileAvatarStyle } from "../types/profile";
import { profileInitial } from "../types/profile";

interface ProfileAvatarProps {
  profile: Profile;
  size?: "sm" | "md" | "lg" | "xl";
  selected?: boolean;
}

const sizes = {
  sm: "h-9 w-9 text-sm",
  md: "h-16 w-16 text-xl",
  lg: "h-24 w-24 text-3xl",
  xl: "h-28 w-28 text-4xl",
};

function resolveStyle(profile: Profile): ProfileAvatarStyle {
  if (profile.avatarStyle) return profile.avatarStyle;
  return profile.avatarEmoji ? "emoji" : "initial";
}

export function ProfileAvatar({
  profile,
  size = "md",
  selected,
}: ProfileAvatarProps) {
  const style = resolveStyle(profile);
  const accent = profile.accentColor ?? profile.avatarColor;

  const backgroundStyle =
    style === "gradient"
      ? {
          background: `linear-gradient(135deg, ${profile.avatarColor} 0%, ${accent} 100%)`,
        }
      : { backgroundColor: profile.avatarColor };

  const content =
    style === "emoji"
      ? (profile.avatarEmoji ?? profileInitial(profile.name))
      : profileInitial(profile.name);

  return (
    <motion.div
      className={`relative flex ${sizes[size]} items-center justify-center rounded-xl font-display font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.12)] transition-shadow ${
        selected ? "ring-2 ring-text-primary ring-offset-2 ring-offset-void" : ""
      }`}
      style={backgroundStyle}
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.97 }}
    >
      {content}
    </motion.div>
  );
}
