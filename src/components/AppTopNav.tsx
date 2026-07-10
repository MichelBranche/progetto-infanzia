import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import {
  Bell,
  CircleUser,
  Home,
  LogOut,
  MoreHorizontal,
  Search,
  Settings,
  Users,
  X,
} from "lucide-react";
import { getNavSections, type NavItem } from "../data/nav";
import { useAddons } from "../context/AddonsContext";
import type { Profile } from "../types/profile";
import { roleLabel } from "../types/profile";
import { ProfileAvatar } from "./ProfileAvatar";
import { AppTopNavMoreMenu, animateAppTopNavMoreMenuClose } from "./AppTopNavMoreMenu";
import {
  animateNavLinkHover,
  useAppTopNavEntrance,
} from "../hooks/useAppTopNavMotion";
import { useGlassNavIndicator } from "../hooks/useGlassNavIndicator";

gsap.registerPlugin(useGSAP);

export const APP_NAV_BAR_HEIGHT = 68;
/** Altezza totale riservata (barra + distacco dal bordo superiore). */
export const APP_NAV_HEIGHT =
  "var(--app-nav-height)" as const;

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
  onSwitchProfile: () => void;
  onLogout: () => void;
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
  registerRef,
  sliding = false,
}: {
  item: NavItem;
  active: boolean;
  onNavigate: (id: string) => void;
  badgeCount?: number;
  registerRef?: (el: HTMLButtonElement | null) => void;
  sliding?: boolean;
}) {
  const buttonRef = useRef<HTMLButtonElement>(null);

  return (
    <button
      ref={(el) => {
        buttonRef.current = el;
        registerRef?.(el);
      }}
      type="button"
      onClick={() => onNavigate(item.id)}
      onMouseEnter={() => {
        if (buttonRef.current) animateNavLinkHover(buttonRef.current, true);
      }}
      onMouseLeave={() => {
        if (buttonRef.current) animateNavLinkHover(buttonRef.current, false);
      }}
      aria-current={active ? "page" : undefined}
      className={
        sliding
          ? `lf-nav-link lf-nav-link--sliding whitespace-nowrap ${
              active ? "lf-nav-link--sliding-active" : ""
            }`
          : `lf-nav-link ${active ? "lf-nav-link--active" : ""}`
      }
    >
      {sliding && active && item.id === "home" && (
        <Home className="h-4 w-4 shrink-0" strokeWidth={2.25} />
      )}
      {item.label}
      {badgeCount != null && badgeCount > 0 && (
        <span
          className={`ml-1.5 text-[10px] tabular-nums ${
            active ? "text-black/55" : "text-white/70"
          }`}
        >
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
  onSwitchProfile,
  onLogout,
}: AppTopNavProps) {
  const innerRef = useRef<HTMLDivElement>(null);
  const desktopNavRef = useRef<HTMLElement>(null);
  const altroButtonRef = useRef<HTMLButtonElement>(null);
  const { hasStreaming } = useAddons();
  const inputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const mobileProfileMenuRef = useRef<HTMLDivElement>(null);
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

  const indicatorActiveId = useMemo(() => {
    if (moreOpen) return "altro";
    if (moreNav.some((item) => item.id === activeId)) return "altro";
    if (primaryNav.some((item) => item.id === activeId)) return activeId;
    return "";
  }, [activeId, moreNav, moreOpen, primaryNav]);

  const { register: registerNavLink, indicator: navIndicator } =
    useGlassNavIndicator(desktopNavRef, indicatorActiveId, [
      activeId,
      primaryNav.length,
      moreNav.length,
      moreOpen,
      searchActive,
      desktopNav,
    ]);

  const closeMoreMenu = useCallback(() => {
    animateAppTopNavMoreMenuClose(altroMorePanelRef, () => setMoreOpen(false));
  }, []);

  const toggleMoreMenu = () => {
    if (moreOpen) {
      closeMoreMenu();
      return;
    }
    setProfileMenuOpen(false);
    setMoreOpen(true);
  };

  useEffect(() => {
    if (searchActive) {
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [searchActive]);

  useEffect(() => {
    if (!profileMenuOpen && !moreOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        !menuRef.current?.contains(target) &&
        !mobileProfileMenuRef.current?.contains(target)
      ) {
        setProfileMenuOpen(false);
      }
      if (
        !desktopNavRef.current?.contains(target) &&
        !altroMorePanelRef.current?.contains(target)
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
      className={`app-top-nav fixed inset-x-0 z-50 ${
        searchActive ? "z-[60]" : ""
      }`}
    >
      <div
        ref={innerRef}
        className="app-top-nav__inner flex h-full w-full min-w-0 items-center justify-between gap-2 px-6 sm:gap-3 lg:px-12"
      >
        <button
          type="button"
          onClick={() => onNavigate("home")}
          className="app-top-nav__brand group pointer-events-auto flex shrink-0 items-center pr-1"
          aria-label="Home Branchefy"
        >
          <span className="app-top-nav__brand-logo chromatic-logo chromatic-logo--skew">
            B
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
            <div className="ml-auto hidden items-center gap-2 md:flex">
              <div className="relative min-w-0">
                <nav
                  ref={desktopNavRef}
                  aria-label="Navigazione principale"
                  role="tablist"
                  className="glass-header relative flex min-w-0 items-center gap-0.5 overflow-x-auto overflow-y-visible p-1.5 scrollbar-hide"
                >
                  <div
                    className="lf-nav-slider pill-glow"
                    style={{
                      transform: `translate3d(${navIndicator.x}px, 0, 0)`,
                      width: navIndicator.width,
                      opacity: navIndicator.opacity,
                    }}
                    aria-hidden
                  />

                  <div className="relative z-[1] flex min-w-0 items-center gap-0.5">
                    {primaryNav.map((item) => (
                      <NavPill
                        key={item.id}
                        item={item}
                        active={activeId === item.id && !moreOpen}
                        onNavigate={(id) => {
                          if (moreOpen) closeMoreMenu();
                          onNavigate(id);
                        }}
                        badgeCount={badgeCounts?.[item.id]}
                        sliding
                        registerRef={(el) => registerNavLink(item.id, el)}
                      />
                    ))}

                    {moreNav.length > 0 && (
                      <button
                        ref={(el) => {
                          altroButtonRef.current = el;
                          registerNavLink("altro", el);
                        }}
                        type="button"
                        onClick={toggleMoreMenu}
                        onMouseEnter={() => {
                          if (altroButtonRef.current) {
                            animateNavLinkHover(altroButtonRef.current, true);
                          }
                        }}
                        onMouseLeave={() => {
                          if (altroButtonRef.current) {
                            animateNavLinkHover(altroButtonRef.current, false);
                          }
                        }}
                        aria-expanded={moreOpen}
                        aria-haspopup="menu"
                        className={`lf-nav-link lf-nav-link--sliding flex items-center gap-1 whitespace-nowrap ${
                          moreNav.some((item) => item.id === activeId) || moreOpen
                            ? "lf-nav-link--sliding-active"
                            : ""
                        }`}
                      >
                        Altro
                        <MoreHorizontal
                          className={`h-4 w-4 shrink-0 transition-transform duration-300 ${
                            moreOpen ? "rotate-90" : ""
                          }`}
                          strokeWidth={2}
                        />
                      </button>
                    )}
                  </div>
                </nav>

                {moreOpen && desktopNav && (
                  <AppTopNavMoreMenu
                    panelRef={altroMorePanelRef}
                    activeId={activeId}
                    primaryNav={primaryNav}
                    moreNav={moreNav}
                    alertDots={alertDots}
                    includePrimary={false}
                    className="right-0"
                    onNavigate={onNavigate}
                    onSelect={closeMoreMenu}
                  />
                )}
              </div>

              <div className="glass-header flex items-center gap-0.5 p-1.5">
              <button
                type="button"
                onClick={onOpenSearch}
                className="app-top-nav__icon app-top-nav__icon-btn flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-white/10"
                aria-label="Cerca"
              >
                <Search className="h-[18px] w-[18px]" strokeWidth={1.85} />
              </button>

              <button
                type="button"
                onClick={() => onNavigate("settings")}
                className="app-top-nav__icon app-top-nav__icon-btn flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-white/10"
                aria-label="Impostazioni"
              >
                <Settings className="h-[18px] w-[18px]" strokeWidth={1.75} />
              </button>

              <button
                type="button"
                onClick={() => onNavigate("profile")}
                className="app-top-nav__icon app-top-nav__icon-btn hidden h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-white/10 lg:flex"
                aria-label="Profilo e lista"
                title="Profilo e lista"
              >
                <CircleUser className="h-[19px] w-[19px]" strokeWidth={1.75} />
              </button>

              <div ref={menuRef} className="relative shrink-0">
                <button
                  type="button"
                  onClick={() => setProfileMenuOpen((open) => !open)}
                  aria-expanded={profileMenuOpen}
                  className="app-top-nav__icon-btn flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full p-0 ring-2 ring-white/25 transition-[opacity,ring-color] hover:ring-white/45"
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
                        className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-[13px] text-text-secondary transition-colors hover:bg-white/[0.04] hover:text-text-primary"
                      >
                        <CircleUser className="h-4 w-4 shrink-0" strokeWidth={1.5} />
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
                        <Users className="h-4 w-4 shrink-0" strokeWidth={1.5} />
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
                        <LogOut className="h-4 w-4 shrink-0" strokeWidth={1.5} />
                        Logout
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
              </div>
            </div>

            <div className="app-top-nav__actions pointer-events-auto ml-auto flex shrink-0 items-center gap-0.5 md:hidden">
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
                className="app-top-nav__icon app-top-nav__icon-btn flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-white/10"
                aria-label="Notifiche"
              >
                <Bell className="h-[19px] w-[19px]" strokeWidth={1.85} />
              </button>

              <div ref={mobileProfileMenuRef} className="relative shrink-0 md:hidden">
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
