import { useMemo, useRef, useState, useCallback, useEffect } from "react";
import { Film, Home, MoreHorizontal, Search, Tv } from "lucide-react";
import { getNavSections, type NavItem } from "../data/nav";
import { useAddons } from "../context/AddonsContext";
import type { Profile } from "../types/profile";
import { useGlassNavIndicator } from "../hooks/useGlassNavIndicator";
import {
  AppTopNavMoreMenu,
  animateAppTopNavMoreMenuClose,
} from "./AppTopNavMoreMenu";

const MOBILE_PRIMARY = [
  { id: "home", label: "Home", icon: Home },
  { id: "film", label: "Film", icon: Film },
  { id: "serie", label: "Serie", icon: Tv },
  { id: "more", label: "Altro", icon: MoreHorizontal },
  { id: "search", label: "Cerca", icon: Search },
] as const;

interface AppMobileNavBarProps {
  activeId: string;
  profile: Profile;
  devMode?: boolean;
  onNavigate: (id: string) => void;
  onOpenSearch: () => void;
  hidden?: boolean;
}

export function AppMobileNavBar({
  activeId,
  profile,
  devMode = false,
  onNavigate,
  onOpenSearch,
  hidden = false,
}: AppMobileNavBarProps) {
  const navRef = useRef<HTMLElement>(null);
  const morePanelRef = useRef<HTMLDivElement>(null);
  const dockRef = useRef<HTMLDivElement>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const { hasStreaming } = useAddons();

  const sections = getNavSections(profile, hasStreaming, devMode);
  const primaryNav = useMemo(() => {
    const map = new Map<string, NavItem>();
    for (const section of sections) {
      for (const item of section.items) map.set(item.id, item);
    }
    return MOBILE_PRIMARY.map((entry) => map.get(entry.id)).filter(
      (item): item is NavItem => item != null,
    );
  }, [sections]);

  const moreNav = useMemo(() => {
    const primary = new Set<string>(MOBILE_PRIMARY.map((item) => item.id));
    const out: NavItem[] = [];
    for (const section of sections) {
      for (const item of section.items) {
        if (primary.has(item.id)) continue;
        if (out.some((entry) => entry.id === item.id)) continue;
        out.push(item);
      }
    }
    return out;
  }, [sections]);

  const closeMoreMenu = useCallback(() => {
    animateAppTopNavMoreMenuClose(morePanelRef, () => setMoreOpen(false));
  }, []);

  useEffect(() => {
    if (!moreOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!dockRef.current?.contains(target)) {
        closeMoreMenu();
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeMoreMenu();
    };
    window.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [moreOpen, closeMoreMenu]);

  const moreIds = useMemo(() => {
    const primary = new Set<string>(MOBILE_PRIMARY.map((item) => item.id));
    const ids = new Set<string>();
    for (const section of sections) {
      for (const item of section.items) {
        if (!primary.has(item.id) && item.id !== "search") ids.add(item.id);
      }
    }
    return ids;
  }, [sections]);

  const indicatorKey = useMemo(() => {
    if (moreOpen) return "more";
    if (activeId === "search") return "search";
    if (moreIds.has(activeId)) return "more";
    if (MOBILE_PRIMARY.some((item) => item.id === activeId)) return activeId;
    return "";
  }, [activeId, moreIds, moreOpen]);

  const { register, indicator } = useGlassNavIndicator(
    navRef,
    indicatorKey,
    [activeId, hidden, moreOpen],
  );

  if (hidden) return null;

  return (
    <div
      ref={dockRef}
      className="mobile-nav-dock pointer-events-none fixed inset-x-0 bottom-0 z-50 md:hidden"
    >
      {moreOpen && (
        <AppTopNavMoreMenu
          panelRef={morePanelRef}
          activeId={activeId}
          primaryNav={primaryNav}
          moreNav={moreNav}
          includePrimary={false}
          className="mobile-profile-menu left-1/2 -translate-x-1/2"
          onNavigate={(id) => {
            onNavigate(id);
            closeMoreMenu();
          }}
          onSelect={closeMoreMenu}
        />
      )}

      <nav
        ref={navRef}
        aria-label="Navigazione mobile"
        className="mobile-nav-bar glass-header mobile-nav-layout pointer-events-auto mx-auto flex items-center gap-0.5 p-1.5"
      >
        <div
          className="lf-nav-slider pill-glow"
          style={{
            transform: `translate3d(${indicator.x}px, 0, 0)`,
            width: indicator.width,
            opacity: indicator.opacity,
          }}
          aria-hidden
        />

        {MOBILE_PRIMARY.map((item) => {
          const Icon = item.icon;
          const itemId = item.id;
          const active =
            itemId === "more"
              ? moreIds.has(activeId) || moreOpen
              : itemId === "search"
                ? activeId === "search"
                : activeId === itemId && !moreOpen;

          return (
            <button
              key={itemId}
              ref={(el) => register(itemId, el)}
              type="button"
              aria-current={active ? "page" : undefined}
              onClick={() => {
                if (itemId === "search") onOpenSearch();
                else if (itemId === "more") {
                  if (moreOpen) closeMoreMenu();
                  else setMoreOpen(true);
                } else onNavigate(itemId);
              }}
              className={`lf-nav-link lf-nav-link--sliding flex flex-col items-center gap-0.5 px-3 py-1.5 text-[10px] ${
                active ? "lf-nav-link--sliding-active" : ""
              }`}
            >
              <Icon className="h-[18px] w-[18px]" strokeWidth={active ? 2.25 : 1.85} />
              <span className="leading-none">{item.label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
