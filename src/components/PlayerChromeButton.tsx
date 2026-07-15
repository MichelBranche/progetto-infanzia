import { motion } from "framer-motion";
import type { ReactNode } from "react";

const SPRING = { type: "spring" as const, stiffness: 520, damping: 28 };

interface PlayerChromeButtonProps {
  onClick: () => void;
  children: ReactNode;
  className?: string;
  size?: "md" | "lg";
  variant?: "icon" | "pill";
  disabled?: boolean;
  title?: string;
  "aria-label"?: string;
}

export function PlayerChromeButton({
  onClick,
  children,
  className = "",
  size = "md",
  variant = "icon",
  disabled = false,
  title,
  "aria-label": ariaLabel,
}: PlayerChromeButtonProps) {
  const dimension =
    variant === "pill"
      ? "min-h-11 gap-2 rounded-full px-3 py-2"
      : size === "lg"
        ? "h-12 w-12"
        : "h-11 w-11";

  return (
    <motion.button
      type="button"
      title={title}
      aria-label={ariaLabel}
      disabled={disabled}
      whileTap={disabled ? undefined : { scale: 0.9 }}
      whileHover={disabled ? undefined : { scale: 1.07 }}
      transition={SPRING}
      onTouchStart={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        if (!disabled) onClick();
      }}
      className={`flex shrink-0 touch-manipulation items-center justify-center rounded-full border border-white/15 bg-black/50 text-white/90 shadow-[0_4px_24px_rgba(0,0,0,0.35)] backdrop-blur-md transition-colors hover:bg-black/70 hover:text-white disabled:cursor-default disabled:opacity-40 ${dimension} ${className}`}
    >
      {children}
    </motion.button>
  );
}
