import { motion } from "framer-motion";
import type { Profile } from "../types/profile";
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

export function ProfileAvatar({
  profile,
  size = "md",
  selected,
}: ProfileAvatarProps) {
  return (
    <motion.div
      className={`relative flex ${sizes[size]} items-center justify-center rounded-xl font-display font-semibold text-white transition-shadow ${
        selected ? "ring-2 ring-text-primary ring-offset-2 ring-offset-void" : ""
      }`}
      style={{ backgroundColor: profile.avatarColor }}
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.97 }}
    >
      {profile.avatarEmoji ?? profileInitial(profile.name)}
    </motion.div>
  );
}
