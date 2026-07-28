import type { ReactNode } from "react";

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

/** Bottone chrome senza Framer — scale CSS, niente spring sul main thread. */
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
    <button
      type="button"
      title={title}
      aria-label={ariaLabel}
      disabled={disabled}
      onTouchStart={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        if (!disabled) onClick();
      }}
      className={`player-chrome-btn flex shrink-0 touch-manipulation items-center justify-center rounded-full border border-white/15 bg-black/55 text-white/90 shadow-[0_4px_24px_rgba(0,0,0,0.35)] transition-[background-color,color,transform] duration-100 hover:bg-black/70 hover:text-white active:scale-95 disabled:cursor-default disabled:opacity-40 disabled:active:scale-100 ${dimension} ${className}`}
    >
      {children}
    </button>
  );
}
