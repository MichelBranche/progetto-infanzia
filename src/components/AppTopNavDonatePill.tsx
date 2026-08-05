import { useRef } from "react";
import { HeartHandshake } from "lucide-react";
import { requestOpenSupportNotice } from "../lib/supportNotice";
import { animateToolbarIconHover } from "../hooks/useAppTopNavMotion";

type AppTopNavDonatePillProps = {
  compact?: boolean;
  className?: string;
};

export function AppTopNavDonatePill({
  compact = false,
  className = "",
}: AppTopNavDonatePillProps) {
  const buttonRef = useRef<HTMLButtonElement>(null);

  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={() => requestOpenSupportNotice()}
      onMouseEnter={() => {
        if (buttonRef.current) animateToolbarIconHover(buttonRef.current, true);
      }}
      onMouseLeave={() => {
        if (buttonRef.current) animateToolbarIconHover(buttonRef.current, false);
      }}
      aria-haspopup="dialog"
      aria-label="Sostieni Branchefy"
      title="Sostieni Branchefy"
      className={`glass-header app-top-nav__donate-pill flex shrink-0 items-center gap-1.5 rounded-full transition-[transform,background-color,border-color] duration-300 ${
        compact ? "h-11 px-2.5" : "h-10 px-3"
      } ${className}`.trim()}
    >
      <span className="app-top-nav__donate-pill-icon flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent/15 text-accent">
        <HeartHandshake className="h-3.5 w-3.5" strokeWidth={2} />
      </span>
      <span className="app-top-nav__chrome-fg-strong text-[12px] font-semibold tracking-wide">
        Dona
      </span>
    </button>
  );
}
