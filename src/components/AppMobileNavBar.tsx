import { useMemo, useRef, useState, useCallback, useEffect } from "react";
import { Film, Home, MoreHorizontal, Search, Tv } from "lucide-react";
import { getNavSections, type NavItem } from "../data/nav";
import { useAddons } from "../context/AddonsContext";
import type { Profile } from "../types/profile";
import { useMobileNavIndicator } from "../hooks/useMobileNavIndicator";
import { useCompactShell } from "../context/MobileDeviceContext";
import {
  AppMobileNavMoreMenu,
  animateAppMobileNavMoreMenuClose,
} from "./AppMobileNavMoreMenu";

const MOBILE_PRIMARY = [
  { id: "home", label: "Home", icon: Home },
  { id: "film", label: "Film", icon: Film },
  { id: "serie", label: "Serie", icon: Tv },
  { id: "more", label: "Altro", icon: MoreHorizontal },
  { id: "search", label: "Cerca", icon: Search },
] as const;

const MOBILE_MORE_CATEGORY_IDS = ["cartoni", "anime", "manga"] as const;

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
  const { isCompactShell } = useCompactShell();
  const navRef = useRef<HTMLElement>(null);
  const morePanelRef = useRef<HTMLDivElement>(null);
  const moreButtonRef = useRef<HTMLButtonElement>(null);
  const dockRef = useRef<HTMLDivElement>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const { hasStreaming } = useAddons();

  const sections = getNavSections(profile, hasStreaming, devMode);

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

  const mobileMoreCategories = useMemo(
    () =>
      MOBILE_MORE_CATEGORY_IDS.flatMap((id) => {
        const item = moreNav.find((entry) => entry.id === id);
        return item ? [item] : [];
      }),
    [moreNav],
  );

  const closeMoreMenu = useCallback(() => {
    animateAppMobileNavMoreMenuClose(morePanelRef, () => setMoreOpen(false));
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

  const { register, indicator } = useMobileNavIndicator(navRef, indicatorKey, [
    activeId,
    hidden,
    moreOpen,
  ]);

  if (hidden || !isCompactShell) return null;

  return (
    <div
      ref={dockRef}
      className="mobile-nav-dock pointer-events-none fixed inset-x-0 bottom-0 z-50"
    >
      {moreOpen && mobileMoreCategories.length > 0 && (
        <AppMobileNavMoreMenu
          panelRef={morePanelRef}
          anchorRef={moreButtonRef}
          activeId={activeId}
          moreNav={moreNav}
          onClose={closeMoreMenu}
          onNavigate={(id) => {
            onNavigate(id);
            closeMoreMenu();
          }}
        />
      )}

      <nav
        ref={navRef}
        aria-label="Navigazione mobile"
        className="mobile-nav-bar glass-header pointer-events-auto"
      >
        <div
          className="mobile-nav-slider"
          style={{
            transform: `translate3d(${indicator.x}px, ${indicator.y}px, 0)`,
            width: indicator.width,
            height: indicator.height,
            opacity: indicator.opacity,
          }}
          aria-hidden
        />

        <div className="mobile-nav-items">
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
                ref={(el) => {
                  register(itemId, el);
                  if (itemId === "more" && el instanceof HTMLButtonElement) {
                    moreButtonRef.current = el;
                  }
                }}
                type="button"
                aria-current={active ? "page" : undefined}
                aria-label={item.label}
                aria-expanded={itemId === "more" ? moreOpen : undefined}
                aria-haspopup={itemId === "more" ? "menu" : undefined}
                onClick={() => {
                  if (itemId === "search") onOpenSearch();
                  else if (itemId === "more") {
                    if (moreOpen) closeMoreMenu();
                    else if (mobileMoreCategories.length > 0) setMoreOpen(true);
                  } else onNavigate(itemId);
                }}
                className={`mobile-nav-item${active ? " mobile-nav-item--active" : ""}`}
              >
                <Icon
                  className="mobile-nav-item__icon"
                  strokeWidth={active ? 2.35 : 1.9}
                  aria-hidden
                />
                <span className="mobile-nav-item__label">{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
