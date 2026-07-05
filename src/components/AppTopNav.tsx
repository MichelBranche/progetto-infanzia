import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type RefObject } from "react";
import { AnimatePresence, motion } from "framer-motion";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import {
  Bell,
  CircleUser,
  LogOut,
  MoreHorizontal,
  RefreshCw,
  Search,
  Users,
  X,
} from "lucide-react";
import { getNavSections, type NavItem } from "../data/nav";
import { useAddons } from "../context/AddonsContext";
import type { Profile } from "../types/profile";
import { isParentProfile, roleLabel } from "../types/profile";
import { ProfileAvatar } from "./ProfileAvatar";
import { AppTopNavMoreMenu, animateAppTopNavMoreMenuClose } from "./AppTopNavMoreMenu";
import {
  animateNavLinkHover,
  useAppTopNavEntrance,
} from "../hooks/useAppTopNavMotion";

gsap.registerPlugin(useGSAP);

export const APP_NAV_HEIGHT = 64;

interface AppTopNavProps {
  activeId: string;
  profile: Profile;
  devMode?: boolean;
  onNavigate: (id: string) => void;
  badgeCounts?: Record<string, number>;
  alertDots?: readonly string[];
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onOpenSearch: () => void;
  onCloseSearch?: () => void;
  searchActive: boolean;
  onRescan: () => void;
  onSwitchProfile: () => void;
  onLogout: () => void;
  scanning: boolean;
  scrollContainerRef?: RefObject<HTMLElement | null>;
  immersive?: boolean;
}

const PRIMARY_NAV_IDS = [
  "home",
  "film",
  "serie",
  "cartoni",
  "anime",
  "manga",
  "capsula",
] as const;

function NavPill({
  item,
  active,
  onNavigate,
  badgeCount,
}: {
  item: NavItem;
  active: boolean;
  onNavigate: (id: string) => void;
  badgeCount?: number;
}) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const indicatorRef = useRef<HTMLSpanElement>(null);

  useGSAP(
    () => {
      if (!active || !indicatorRef.current) return;
      gsap.fromTo(
        indicatorRef.current,
        { scaleX: 0, opacity: 0.4 },
        { scaleX: 1, opacity: 1, duration: 0.32, ease: "power3.out" },
      );
    },
    { dependencies: [active] },
  );

  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={() => onNavigate(item.id)}
      onMouseEnter={() => {
        if (buttonRef.current) animateNavLinkHover(buttonRef.current, true);
      }}
      onMouseLeave={() => {
        if (buttonRef.current) animateNavLinkHover(buttonRef.current, false);
      }}
      aria-current={active ? "page" : undefined}
      className={`app-top-nav__link relative shrink-0 px-2.5 py-2 text-[14px] tracking-[-0.01em] sm:px-3 sm:text-[15px] ${
        active
          ? "font-semibold text-white"
          : "font-medium text-white/90 hover:text-white"
      }`}
    >
      {item.label}
      {active && (
        <span
          ref={indicatorRef}
          className="absolute inset-x-2 bottom-0.5 block h-[2px] origin-center rounded-full bg-white"
          aria-hidden
        />
      )}
      {badgeCount != null && badgeCount > 0 && (
        <span className="ml-1.5 text-[10px] tabular-nums text-accent">
          {badgeCount}
        </span>
      )}
    </button>
  );
}

export function AppTopNav({
  activeId,
  profile,
  devMode = false,
  onNavigate,
  badgeCounts,
  alertDots,
  searchQuery,
  onSearchChange,
  onOpenSearch,
  onCloseSearch,
  searchActive,
  onRescan,
  onSwitchProfile,
  onLogout,
  scanning,
  scrollContainerRef,
  immersive = false,
}: AppTopNavProps) {
  const headerRef = useRef<HTMLElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const { hasStreaming } = useAddons();
  const isParent = isParentProfile(profile);
  const inputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const mobileMenuRef = useRef<HTMLDivElement>(null);
  const altroAnchorRef = useRef<HTMLDivElement>(null);
  const mobileMorePanelRef = useRef<HTMLDivElement>(null);
  const altroMorePanelRef = useRef<HTMLDivElement>(null);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [desktopNav, setDesktopNav] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(min-width: 768px)").matches,
  );

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const onChange = () => setDesktopNav(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  useAppTopNavEntrance(innerRef);

  const sections = getNavSections(profile, hasStreaming, devMode);
  const navById = useMemo(() => {
    const map = new Map<string, NavItem>();
    for (const section of sections) {
      for (const item of section.items) {
        map.set(item.id, item);
      }
    }
    return map;
  }, [sections]);

  const primaryNav = PRIMARY_NAV_IDS.map((id) => navById.get(id)).filter(
    (item): item is NavItem => item != null,
  );

  const moreNav = useMemo(() => {
    const primarySet = new Set<string>(PRIMARY_NAV_IDS);
    const out: NavItem[] = [];
    for (const section of sections) {
      for (const item of section.items) {
        if (item.id === "search" || primarySet.has(item.id)) continue;
        if (out.some((entry) => entry.id === item.id)) continue;
        out.push(item);
      }
    }
    return out;
  }, [sections]);

  const closeMoreMenu = useCallback(() => {
    const panelRef = desktopNav ? altroMorePanelRef : mobileMorePanelRef;
    animateAppTopNavMoreMenuClose(panelRef, () => setMoreOpen(false));
  }, [desktopNav]);

  const toggleMoreMenu = () => {
    if (moreOpen) {
      closeMoreMenu();
      return;
    }
    setProfileMenuOpen(false);
    setMoreOpen(true);
  };

  useEffect(() => {
    const header = headerRef.current;
    if (!header) return;

    let scroller = scrollContainerRef?.current ?? null;
    let raf = 0;
    let attached = false;

    const update = () => {
      if (!scroller) return;
      const scrolled = Math.min(1, Math.max(0, scroller.scrollTop / 140));
      const blend =
        searchActive || !immersive ? 1 : 0.42 + scrolled * 0.58;
      header.style.setProperty("--nav-blend", String(blend));
    };

    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(update);
    };

    const attach = () => {
      scroller = scrollContainerRef?.current ?? null;
      if (!scroller || attached) return attached;
      update();
      scroller.addEventListener("scroll", onScroll, { passive: true });
      attached = true;
      return attached;
    };

    if (!attach()) {
      const retry = window.setInterval(() => {
        if (attach()) window.clearInterval(retry);
      }, 50);
      return () => {
        window.clearInterval(retry);
        if (scroller && attached) {
          scroller.removeEventListener("scroll", onScroll);
        }
        cancelAnimationFrame(raf);
      };
    }

    return () => {
      if (scroller && attached) {
        scroller.removeEventListener("scroll", onScroll);
      }
      cancelAnimationFrame(raf);
    };
  }, [scrollContainerRef, immersive, searchActive]);

  useEffect(() => {
    if (searchActive) {
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [searchActive]);

  useEffect(() => {
    if (!profileMenuOpen && !moreOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!menuRef.current?.contains(target)) setProfileMenuOpen(false);
      if (
        !mobileMenuRef.current?.contains(target) &&
        !altroAnchorRef.current?.contains(target)
      ) {
        if (moreOpen) closeMoreMenu();
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setProfileMenuOpen(false);
        if (moreOpen) closeMoreMenu();
      }
    };
    window.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [profileMenuOpen, moreOpen, closeMoreMenu]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      const typing =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        (target instanceof HTMLElement && target.isContentEditable);
      if (
        event.key === "/" &&
        !typing &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey
      ) {
        event.preventDefault();
        onOpenSearch();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onOpenSearch]);

  useGSAP(
    () => {
      if (!searchActive) return;
      const field = innerRef.current?.querySelector(".app-top-nav__search-field");
      if (!field) return;
      gsap.fromTo(
        field,
        { opacity: 0, y: -8, width: "92%" },
        { opacity: 1, y: 0, width: "100%", duration: 0.35, ease: "power3.out" },
      );
    },
    { dependencies: [searchActive], scope: innerRef },
  );

  return (
    <header
      ref={headerRef}
      className={`app-top-nav fixed inset-x-0 top-0 z-50 ${
        searchActive ? "z-[60]" : ""
      } ${immersive && !searchActive ? "app-top-nav--immersive" : ""}`}
      style={
        {
          height: APP_NAV_HEIGHT,
          "--nav-blend": searchActive || !immersive ? 1 : 0.42,
        } as CSSProperties
      }
    >
      <div
        ref={innerRef}
        className="app-top-nav__inner page-px flex h-full w-full min-w-0 items-center gap-2 sm:gap-3"
      >
        <button
          type="button"
          onClick={() => onNavigate("home")}
          className="app-top-nav__brand group flex shrink-0 items-center gap-2 pr-1 transition-opacity hover:opacity-90"
          aria-label="Home Branchefy"
        >
          <span className="font-display text-[1.2rem] font-bold tracking-[-0.05em] sm:text-[1.35rem]">
            Branchefy
          </span>
        </button>

        {searchActive ? (
          <div className="app-top-nav__search-field flex min-w-0 flex-1 items-center gap-2 border-b border-white/25 pb-1">
            <Search className="h-4 w-4 shrink-0 text-white/55" strokeWidth={1.75} />
            <input
              ref={inputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Titoli, serie, cartoni…"
              className="min-w-0 flex-1 bg-transparent text-[15px] text-white caret-accent outline-none placeholder:text-white/40"
            />
            <button
              type="button"
              onClick={() => {
                if (searchQuery) onSearchChange("");
                else onCloseSearch?.();
              }}
              className="app-top-nav__icon-btn flex h-8 w-8 items-center justify-center rounded-full text-white/60 transition-colors hover:bg-white/10 hover:text-white"
              aria-label={searchQuery ? "Cancella ricerca" : "Chiudi ricerca"}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <>
            <div className="flex min-w-0 flex-1 items-center">
              <div ref={mobileMenuRef} className="relative shrink-0 md:hidden">
                <button
                  type="button"
                  onClick={toggleMoreMenu}
                  aria-expanded={moreOpen}
                  className="app-top-nav__link flex h-9 items-center gap-1 px-2.5 text-[14px] font-medium text-white/90 transition-colors hover:text-white"
                >
                  Menu
                  <MoreHorizontal className="h-4 w-4" />
                </button>
                {moreOpen && !desktopNav && (
                  <AppTopNavMoreMenu
                    panelRef={mobileMorePanelRef}
                    activeId={activeId}
                    primaryNav={primaryNav}
                    moreNav={moreNav}
                    alertDots={alertDots}
                    includePrimary
                    className="left-0"
                    onNavigate={onNavigate}
                    onSelect={closeMoreMenu}
                  />
                )}
              </div>

              <nav
                aria-label="Navigazione principale"
                className="scrollbar-hide hidden min-w-0 flex-1 items-center gap-0 overflow-x-auto md:flex"
              >
                {primaryNav.map((item) => (
                  <NavPill
                    key={item.id}
                    item={item}
                    active={activeId === item.id}
                    onNavigate={onNavigate}
                    badgeCount={badgeCounts?.[item.id]}
                  />
                ))}
              </nav>

              {moreNav.length > 0 && (
                <div
                  ref={altroAnchorRef}
                  className="relative z-[60] hidden shrink-0 md:block"
                >
                  <button
                    type="button"
                    onClick={toggleMoreMenu}
                    aria-expanded={moreOpen}
                    aria-haspopup="menu"
                    className={`app-top-nav__link flex items-center gap-1 px-2.5 py-2 text-[14px] transition-[color,opacity] duration-200 sm:px-3 sm:text-[15px] ${
                      moreNav.some((item) => item.id === activeId) || moreOpen
                        ? "font-semibold text-white"
                        : "font-medium text-white/90 hover:text-white"
                    }`}
                  >
                    Altro
                    <MoreHorizontal
                      className={`h-4 w-4 transition-transform duration-300 ${
                        moreOpen ? "rotate-90" : ""
                      }`}
                    />
                  </button>
                  {moreOpen && desktopNav && (
                    <AppTopNavMoreMenu
                      panelRef={altroMorePanelRef}
                      activeId={activeId}
                      primaryNav={primaryNav}
                      moreNav={moreNav}
                      alertDots={alertDots}
                      includePrimary={false}
                      className="left-0"
                      onNavigate={onNavigate}
                      onSelect={closeMoreMenu}
                    />
                  )}
                </div>
              )}
            </div>

            <div className="app-top-nav__actions ml-auto flex shrink-0 items-center gap-0.5 sm:gap-1">
              <button
                type="button"
                onClick={onOpenSearch}
                className="app-top-nav__icon app-top-nav__icon-btn flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-white/10"
                aria-label="Cerca"
              >
                <Search className="h-[19px] w-[19px]" strokeWidth={1.85} />
              </button>

              <button
                type="button"
                onClick={() => onNavigate("profile")}
                className="app-top-nav__icon app-top-nav__icon-btn hidden h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-white/10 sm:flex"
                aria-label="Profilo e lista"
                title="Profilo e lista"
              >
                <CircleUser className="h-[20px] w-[20px]" strokeWidth={1.75} />
              </button>

              {isParent && (
                <button
                  type="button"
                  onClick={onRescan}
                  disabled={scanning}
                  className="app-top-nav__icon app-top-nav__icon-btn hidden h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-white/10 disabled:opacity-40 md:flex"
                  aria-label="Aggiorna libreria"
                >
                  <RefreshCw
                    className={`h-[19px] w-[19px] ${scanning ? "animate-spin" : ""}`}
                    strokeWidth={1.85}
                  />
                </button>
              )}

              <button
                type="button"
                className="app-top-nav__icon app-top-nav__icon-btn flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-white/10"
                aria-label="Notifiche"
              >
                <Bell className="h-[19px] w-[19px]" strokeWidth={1.85} />
              </button>

              <div ref={menuRef} className="relative shrink-0">
                <button
                  type="button"
                  onClick={() => setProfileMenuOpen((open) => !open)}
                  aria-expanded={profileMenuOpen}
                  className="app-top-nav__icon-btn flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full p-0 ring-2 ring-white/30 transition-[opacity,ring-color] hover:ring-white/50"
                >
                  <ProfileAvatar profile={profile} size="sm" />
                </button>
                <AnimatePresence>
                  {profileMenuOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: -6, scale: 0.98 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -6, scale: 0.98 }}
                      transition={{ duration: 0.18 }}
                      className="absolute right-0 top-[calc(100%+8px)] z-50 min-w-[200px] overflow-hidden rounded-xl border border-white/[0.08] bg-[#0c0c0f] py-1 shadow-[0_20px_60px_rgba(0,0,0,0.55)]"
                      role="menu"
                    >
                      <div className="border-b border-white/[0.06] px-3.5 py-2.5">
                        <p className="font-display text-[13px] font-medium text-text-primary">
                          {profile.name}
                        </p>
                        <p className="text-[10px] uppercase tracking-[0.16em] text-text-muted">
                          {roleLabel(profile.role)}
                        </p>
                      </div>
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setProfileMenuOpen(false);
                          onNavigate("profile");
                        }}
                        className="flex w-full px-3.5 py-2.5 text-left text-[13px] text-text-secondary transition-colors hover:bg-white/[0.04] hover:text-text-primary"
                      >
                        Profilo e lista
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setProfileMenuOpen(false);
                          onSwitchProfile();
                        }}
                        className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-[13px] text-text-secondary transition-colors hover:bg-white/[0.04] hover:text-text-primary"
                      >
                        <Users className="h-4 w-4" />
                        Cambia profilo
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setProfileMenuOpen(false);
                          onLogout();
                        }}
                        className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-[13px] text-text-secondary transition-colors hover:bg-white/[0.04] hover:text-warm"
                      >
                        <LogOut className="h-4 w-4" />
                        Logout
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </>
        )}
      </div>
    </header>
  );
}
