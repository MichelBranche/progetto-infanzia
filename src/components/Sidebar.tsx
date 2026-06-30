import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Activity,
  ChevronRight,
  Clapperboard,
  Clock,
  Film,
  Home,
  Library,
  Plus,
  Search,
  Settings,
  Sparkles,
  Tv,
  Wifi,
  Users,
  User,
  type LucideIcon,
} from "lucide-react";
import { getNavSections, type NavItem } from "../data/nav";
import { useAddons } from "../context/AddonsContext";
import type { Profile } from "../types/profile";
import { roleLabel } from "../types/profile";
import { ProfileAvatar } from "./ProfileAvatar";

const SIDEBAR_PIN_KEY = "branchefy-sidebar-pinned";
export const SIDEBAR_COLLAPSED_W = 56;
export const SIDEBAR_EXPANDED_W = 220;

const iconMap: Record<string, LucideIcon> = {
  Home,
  Plus,
  Library,
  Settings,
  Activity,
  Search,
  Film,
  Sparkles,
  Tv,
  Clock,
  Wifi,
  Users,
  User,
  Anime: Clapperboard,
};

interface SidebarProps {
  activeId: string;
  profile: Profile;
  onNavigate: (id: string) => void;
  badgeCounts?: Record<string, number>;
  hasAnime?: boolean;
}

function NavButton({
  item,
  isActive,
  expanded,
  onNavigate,
  badgeCount,
}: {
  item: NavItem;
  isActive: boolean;
  expanded: boolean;
  onNavigate: (id: string) => void;
  badgeCount?: number;
}) {
  const Icon = iconMap[item.icon];
  const showBadge = badgeCount != null && badgeCount > 0;

  return (
    <motion.button
      type="button"
      onClick={() => onNavigate(item.id)}
      title={expanded ? undefined : item.label}
      aria-current={isActive ? "page" : undefined}
      aria-label={item.label}
      className={`group relative flex w-full items-center rounded-xl transition-colors ${
        expanded ? "gap-3 px-2.5 py-2" : "justify-center p-2"
      } ${
        isActive
          ? "text-text-primary"
          : "text-text-muted hover:bg-white/[0.05] hover:text-text-secondary"
      }`}
      whileTap={{ scale: 0.97 }}
    >
      {isActive && (
        <motion.span
          layoutId="sidebar-active-pill"
          className="absolute inset-0 rounded-xl bg-white/[0.06] ring-1 ring-white/[0.08]"
          transition={{ type: "spring", stiffness: 420, damping: 34 }}
        />
      )}
      {isActive && (
        <motion.span
          layoutId="sidebar-active-bar"
          className="absolute left-0 top-1/2 h-4 w-[2px] -translate-y-1/2 rounded-full bg-accent"
          transition={{ type: "spring", stiffness: 420, damping: 34 }}
        />
      )}

      <span
        className={`relative flex shrink-0 items-center justify-center rounded-lg transition-colors ${
          expanded ? "h-8 w-8" : "h-9 w-9"
        } ${
          item.accent
            ? isActive
              ? "bg-accent/20 text-accent ring-1 ring-accent/30"
              : "bg-accent/10 text-accent/90 ring-1 ring-accent/20 group-hover:bg-accent/15"
            : ""
        }`}
      >
        <Icon
          className={expanded ? "h-[16px] w-[16px]" : "h-[18px] w-[18px]"}
          strokeWidth={isActive ? 2 : 1.5}
        />
        {showBadge && !expanded && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-0.5 text-[9px] font-bold leading-none text-void">
            {badgeCount > 9 ? "9+" : badgeCount}
          </span>
        )}
      </span>

      <AnimatePresence>
        {expanded && (
          <motion.span
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -6 }}
            transition={{ duration: 0.15 }}
            className="relative flex min-w-0 flex-1 items-center gap-2 truncate text-left text-[13px] font-medium"
          >
            <span className="truncate">{item.label}</span>
            {showBadge && (
              <span className="ml-auto shrink-0 rounded-full bg-accent/15 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-accent">
                {badgeCount > 99 ? "99+" : badgeCount}
              </span>
            )}
          </motion.span>
        )}
      </AnimatePresence>
    </motion.button>
  );
}

export function Sidebar({
  activeId,
  profile,
  onNavigate,
  badgeCounts,
  hasAnime = false,
}: SidebarProps) {
  const { hasStreaming } = useAddons();
  const sections = getNavSections(profile, hasStreaming, hasAnime);
  const [pinned, setPinned] = useState(() => {
    try {
      return localStorage.getItem(SIDEBAR_PIN_KEY) === "true";
    } catch {
      return false;
    }
  });
  const [hovered, setHovered] = useState(false);

  const expanded = pinned || hovered;
  const layoutWidth = pinned ? SIDEBAR_EXPANDED_W : SIDEBAR_COLLAPSED_W;
  const panelWidth = expanded ? SIDEBAR_EXPANDED_W : SIDEBAR_COLLAPSED_W;
  const isFlyout = expanded && !pinned;

  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_PIN_KEY, String(pinned));
    } catch {
      // ignore
    }
  }, [pinned]);

  useEffect(() => {
    document.documentElement.style.setProperty(
      "--sidebar-layout-width",
      `${layoutWidth}px`,
    );
  }, [layoutWidth]);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 900px)");
    const onChange = () => {
      if (mq.matches) setPinned(false);
    };
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  return (
    <aside
      className="relative z-30 h-full shrink-0 transition-[width] duration-200 ease-out"
      style={{ width: layoutWidth }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div
        className={`flex h-full flex-col overflow-hidden border-r border-white/[0.08] bg-void/90 shadow-[4px_0_32px_rgba(0,0,0,0.35)] backdrop-blur-xl transition-[width] duration-200 ease-out ${
          isFlyout ? "absolute inset-y-0 left-0 z-50" : "relative"
        }`}
        style={{ width: panelWidth }}
      >
        <div
          className={`flex shrink-0 items-center pt-6 pb-5 ${
            expanded ? "px-3" : "justify-center px-0"
          }`}
        >
          <motion.button
            type="button"
            onClick={() => onNavigate("home")}
            className={`flex items-center rounded-xl transition-colors hover:bg-white/[0.04] ${
              expanded ? "w-full gap-3 px-1 py-1" : "justify-center p-1"
            }`}
            whileTap={{ scale: 0.97 }}
            aria-label="Home Branchefy"
          >
            <div className="relative flex h-8 w-8 shrink-0 items-center justify-center">
              <div className="absolute inset-0 rounded-full border border-accent/35" />
              <div className="absolute inset-[5px] rounded-full bg-accent" />
            </div>
            <AnimatePresence>
              {expanded && (
                <motion.div
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -8 }}
                  transition={{ duration: 0.15 }}
                  className="min-w-0 text-left"
                >
                  <p className="font-display truncate text-[14px] font-semibold tracking-[-0.02em] text-text-primary">
                    Branchefy
                  </p>
                  <p className="truncate text-[10px] text-text-muted">v0.1</p>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.button>
        </div>

        <nav className="scrollbar-hide flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-2 pb-3">
          {sections.map((section, sectionIndex) => (
            <div key={section.id}>
              {sectionIndex > 0 && (
                <div
                  className={`mb-3 h-px bg-white/[0.06] ${expanded ? "mx-1" : "mx-2"}`}
                />
              )}
              {expanded && section.label && (
                <p className="mb-1.5 px-2.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-text-muted">
                  {section.label}
                </p>
              )}
              <div className="flex flex-col gap-0.5">
                {section.items.map((item) => (
                  <NavButton
                    key={item.id}
                    item={item}
                    isActive={activeId === item.id}
                    expanded={expanded}
                    onNavigate={onNavigate}
                    badgeCount={badgeCounts?.[item.id]}
                  />
                ))}
              </div>
            </div>
          ))}
        </nav>

        <div className="shrink-0 border-t border-white/[0.06] p-2">
          <button
            type="button"
            onClick={() => setPinned((value) => !value)}
            title={pinned ? "Comprimi barra laterale" : "Espandi barra laterale"}
            aria-label={pinned ? "Comprimi barra laterale" : "Espandi barra laterale"}
            aria-pressed={pinned}
            className={`mb-2 flex w-full items-center rounded-lg border border-white/[0.06] bg-white/[0.03] text-text-muted transition-colors hover:border-white/10 hover:bg-white/[0.05] hover:text-text-secondary ${
              expanded ? "gap-2 px-2.5 py-1.5 text-[11px]" : "justify-center p-1.5"
            }`}
          >
            <ChevronRight
              className={`h-3.5 w-3.5 shrink-0 transition-transform ${
                expanded ? (pinned ? "rotate-180" : "") : ""
              }`}
              strokeWidth={2}
            />
            {expanded && (
              <span className="truncate">{pinned ? "Comprimi" : "Passa sopra per espandere"}</span>
            )}
          </button>

          <div
            className={`flex items-center rounded-xl border border-white/[0.06] bg-void/60 ${
              expanded ? "gap-2.5 px-2 py-2" : "justify-center p-1.5"
            }`}
          >
            <button
              type="button"
              onClick={() => onNavigate("profile")}
              className={`flex min-w-0 flex-1 items-center rounded-lg transition-colors hover:bg-white/[0.04] ${
                expanded ? "gap-2.5" : "justify-center"
              }`}
              title="Il mio profilo"
            >
              <ProfileAvatar profile={profile} size="sm" />
              {expanded && (
                <div className="min-w-0 flex-1 text-left">
                  <p className="truncate text-[12px] font-medium text-text-primary">
                    {profile.name}
                  </p>
                  <p className="truncate text-[10px] text-text-muted">
                    {roleLabel(profile.role)}
                  </p>
                </div>
              )}
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}
