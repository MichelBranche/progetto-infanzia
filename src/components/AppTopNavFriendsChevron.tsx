import { useRef } from "react";
import { ChevronDown } from "lucide-react";
import { useFriendsMenu } from "../context/FriendsMenuContext";

export function AppTopNavFriendsChevron() {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const { open, toggleMenu } = useFriendsMenu();

  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        toggleMenu(buttonRef.current);
      }}
      aria-expanded={open}
      aria-haspopup="menu"
      aria-label="Menu amici e presenza"
      className={`app-top-nav__friends-chevron flex h-9 w-9 items-center justify-center rounded-full transition-colors ${
        open
          ? "bg-white/[0.12] text-white"
          : "text-white/70 hover:bg-white/[0.08] hover:text-white"
      }`}
    >
      <ChevronDown
        className={`h-[18px] w-[18px] transition-transform duration-300 ${
          open ? "rotate-180" : ""
        }`}
        strokeWidth={2}
      />
    </button>
  );
}
