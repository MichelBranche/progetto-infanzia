import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import {
  ChevronDown,
  CircleUser,
  Home,
  MoreHorizontal,
  Search,
  Settings,
  Users,
  X,
} from "lucide-react";
import { getNavSections, type NavItem } from "../data/nav";
import { useAddons } from "../context/AddonsContext";
import { useAppAccess } from "../context/AppAccessContext";
import type { Profile } from "../types/profile";
import { ProfileAvatar } from "./ProfileAvatar";
import { ProfileNotificationBadge } from "./profile/ProfileUi";
import { AppTopNavMoreMenu, animateAppTopNavMoreMenuClose } from "./AppTopNavMoreMenu";
import { AppTopNavProfileMenuPanel } from "./AppTopNavProfileMenu";
import { AppTopNavFriendsBar } from "./AppTopNavFriendsBar";
import { AppTopNavFriendsChevron } from "./AppTopNavFriendsChevron";
import { useFriendsMenu } from "../context/FriendsMenuContext";
import {
  animateNavLinkHover,
  animateToolbarIconHover,
} from "../hooks/useAppTopNavMotion";
import { useGlassNavIndicator } from "../hooks/useGlassNavIndicator";
import { useMobileDevice, useCompactShell } from "../context/MobileDeviceContext";

gsap.registerPlugin(useGSAP);

const PROFILE_MENU_WIDTH = 200;

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
  profileFriendAlertCount?: number;
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

function NavToolbarButton({
  children,
  className = "",
  registerRef,
  slidingActive = false,
  onMouseEnter,
  onMouseLeave,
  ...props
}: React.ComponentProps<"button"> & {
  children: ReactNode;
  registerRef?: (el: HTMLButtonElement | null) => void;
  slidingActive?: boolean;
}) {
  const buttonRef = useRef<HTMLButtonElement>(null);

  return (
    <button
      ref={(el) => {
        buttonRef.current = el;
        registerRef?.(el);
      }}
      type="button"
      onMouseEnter={(event) => {
        if (buttonRef.current) animateToolbarIconHover(buttonRef.current, true);
        onMouseEnter?.(event);
      }}
      onMouseLeave={(event) => {
        if (buttonRef.current) animateToolbarIconHover(buttonRef.current, false);
        onMouseLeave?.(event);
      }}
      className={`app-top-nav__toolbar-item app-top-nav__icon-btn lf-nav-link lf-nav-link--sliding lf-nav-link--toolbar ${
        slidingActive ? "lf-nav-link--sliding-active" : ""
      } ${className}`.trim()}
      {...props}
    >
      {children}
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
  profileFriendAlertCount = 0,
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
  const toolbarRef = useRef<HTMLDivElement>(null);
  const altroButtonRef = useRef<HTMLButtonElement>(null);
  const { hasStreaming } = useAddons();
  const { isGuest } = useAppAccess();
  const inputRef = useRef<HTMLInputElement>(null);
  const friendsDockRef = useRef<HTMLDivElement>(null);
  const profileMenuPanelRef = useRef<HTMLDivElement>(null);
  const profileMenuAnchorRef = useRef<HTMLElement | null>(null);
  const altroMorePanelRef = useRef<HTMLDivElement>(null);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [profileMenuPos, setProfileMenuPos] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const {
    open: friendsMenuOpen,
    closeMenu: closeFriendsMenu,
    registerAnchor,
    toggleMenu: toggleFriendsMenu,
    friends,
    onlineCount,
  } = useFriendsMenu();
  const { isMobileDevice } = useMobileDevice();
  const { isCompactShell } = useCompactShell();
  const showDesktopChrome = !isCompactShell;

  useEffect(() => {
    registerAnchor(friendsDockRef.current);
  }, [registerAnchor]);

  const sections = getNavSections(profile, hasStreaming, devMode, isGuest);
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
      showDesktopChrome,
    ]);

  const toolbarActiveId = useMemo(() => {
    if (profileMenuOpen) return "toolbar-avatar";
    if (activeId === "settings") return "toolbar-settings";
    if (activeId === "profile") return "toolbar-profile";
    return "";
  }, [profileMenuOpen, activeId]);

  const { register: registerToolbarItem, indicator: toolbarIndicator } =
    useGlassNavIndicator(toolbarRef, toolbarActiveId, [
      toolbarActiveId,
      profileMenuOpen,
      activeId,
      showDesktopChrome,
    ]);

  const closeMoreMenu = useCallback(() => {
    animateAppTopNavMoreMenuClose(altroMorePanelRef, () => setMoreOpen(false));
  }, []);

  const updateProfileMenuPos = useCallback((anchor?: HTMLElement | null) => {
    const el = anchor ?? profileMenuAnchorRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const left = Math.max(
      8,
      Math.min(
        rect.right - PROFILE_MENU_WIDTH,
        window.innerWidth - PROFILE_MENU_WIDTH - 8,
      ),
    );
    setProfileMenuPos({
      top: rect.bottom + 8,
      left,
      width: PROFILE_MENU_WIDTH,
    });
  }, []);

  const closeProfileMenu = useCallback(() => {
    setProfileMenuOpen(false);
    setProfileMenuPos(null);
  }, []);

  const toggleProfileMenu = useCallback(
    (anchor: HTMLElement | null) => {
      closeFriendsMenu();
      if (profileMenuOpen) {
        closeProfileMenu();
        return;
      }
      if (moreOpen) closeMoreMenu();
      profileMenuAnchorRef.current = anchor;
      updateProfileMenuPos(anchor);
      setProfileMenuOpen(true);
    },
    [
      closeFriendsMenu,
      closeMoreMenu,
      closeProfileMenu,
      moreOpen,
      profileMenuOpen,
      updateProfileMenuPos,
    ],
  );

  const toggleMoreMenu = () => {
    if (moreOpen) {
      closeMoreMenu();
      return;
    }
    closeProfileMenu();
    closeFriendsMenu();
    setMoreOpen(true);
  };

  useEffect(() => {
    if (!profileMenuOpen) return;
    const onResize = () => updateProfileMenuPos();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [profileMenuOpen, updateProfileMenuPos]);

  useEffect(() => {
    if (!friendsMenuOpen) return;
    closeProfileMenu();
    if (moreOpen) closeMoreMenu();
  }, [closeMoreMenu, closeProfileMenu, friendsMenuOpen, moreOpen]);

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
        !profileMenuPanelRef.current?.contains(target) &&
        !profileMenuAnchorRef.current?.contains(target)
      ) {
        closeProfileMenu();
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
        closeProfileMenu();
        if (moreOpen) closeMoreMenu();
      }
    };

    const attachId = window.setTimeout(() => {
      window.addEventListener("mousedown", onPointerDown);
      window.addEventListener("keydown", onKeyDown);
    }, 0);

    return () => {
      window.clearTimeout(attachId);
      window.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [closeMoreMenu, closeProfileMenu, moreOpen, profileMenuOpen]);

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
    <>
      <header
        className={`app-top-nav fixed inset-x-0 z-50 ${
          isCompactShell ? "app-top-nav--compact " : ""
        }${searchActive ? "z-[60]" : ""}`}
      >
      <div
        ref={innerRef}
        className={`app-top-nav__inner flex h-full w-full min-w-0 items-center justify-between gap-2 ${
          isCompactShell
            ? "px-4"
            : "px-4 sm:gap-3 sm:px-6 lg:px-12"
        }`}
      >
        <div className={`flex min-w-0 shrink-0 items-center ${isCompactShell ? "gap-2.5" : "gap-3 sm:gap-4"}`}>
          <button
            type="button"
            onClick={() => onNavigate("home")}
            className="app-top-nav__brand group pointer-events-auto flex shrink-0 items-center"
            aria-label="Home Branchefy"
          >
            <span className="app-top-nav__brand-logo chromatic-logo chromatic-logo--skew">
              B
            </span>
          </button>

          {!searchActive && (
            <>
              <div className={`app-top-nav__friends-zone relative shrink-0 ${showDesktopChrome ? "block" : "hidden"}`}>
                <div
                  ref={friendsDockRef}
                  className="glass-header app-top-nav__left-dock flex items-center gap-1 p-1.5"
                >
                  <AppTopNavFriendsBar />

                  <span
                    className="app-top-nav__left-dock-divider h-6 w-px shrink-0 bg-white/10"
                    aria-hidden
                  />

                  <AppTopNavFriendsChevron />
                </div>
              </div>

              <div className={`app-top-nav__friends-zone relative shrink-0 ${showDesktopChrome ? "hidden" : "block"}`}>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    toggleFriendsMenu(event.currentTarget);
                  }}
                  aria-expanded={friendsMenuOpen}
                  aria-haspopup="dialog"
                  aria-label={
                    friends.length > 0
                      ? `Amici, ${onlineCount} online`
                      : "Apri menu amici"
                  }
                  className={`glass-header app-top-nav__friends-mobile-btn flex items-center gap-1.5 rounded-full transition-colors ${
                    isMobileDevice
                      ? "h-11 px-2.5"
                      : "h-10 px-2"
                  } ${friendsMenuOpen ? "bg-white/[0.1]" : ""}`}
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/[0.08]">
                    <Users className="h-4 w-4 text-white/85" strokeWidth={1.85} />
                  </span>
                  {friends.length > 0 ? (
                    <span className="min-w-0 text-left leading-tight">
                      <span className="block text-[11px] font-medium text-white/90">
                        {onlineCount} online
                      </span>
                      <span className="block text-[10px] text-white/45">
                        {friends.length} amici
                      </span>
                    </span>
                  ) : (
                    <span className="text-[11px] font-medium text-white/80">
                      Amici
                    </span>
                  )}
                  <ChevronDown
                    className={`app-top-nav__friends-mobile-chevron h-4 w-4 shrink-0 text-white/65 transition-transform duration-300 ${
                      friendsMenuOpen ? "rotate-180" : ""
                    }`}
                    strokeWidth={2.25}
                    aria-hidden
                  />
                </button>
              </div>
            </>
          )}
        </div>

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
            <div className={`ml-auto items-center gap-2 ${showDesktopChrome ? "flex" : "hidden"}`}>
              <div className="relative min-w-0">
                <nav
                  ref={desktopNavRef}
                  aria-label="Navigazione principale"
                  role="tablist"
                  className="glass-header app-top-nav__nav-dock relative flex min-w-0 items-center gap-0.5 overflow-x-auto overflow-y-visible p-1.5 scrollbar-hide"
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

                {moreOpen && showDesktopChrome && (
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

              <div
                ref={toolbarRef}
                className="glass-header app-top-nav__toolbar relative flex items-center gap-0.5 p-1.5"
              >
                <div
                  className="lf-nav-slider pill-glow"
                  style={{
                    transform: `translate3d(${toolbarIndicator.x}px, 0, 0)`,
                    width: toolbarIndicator.width,
                    opacity: toolbarIndicator.opacity,
                  }}
                  aria-hidden
                />

                <div className="relative z-[1] flex items-center gap-0.5">
                  <NavToolbarButton
                    onClick={onOpenSearch}
                    registerRef={(el) => registerToolbarItem("toolbar-search", el)}
                    aria-label="Cerca"
                  >
                    <Search className="h-[18px] w-[18px] shrink-0" strokeWidth={1.85} />
                  </NavToolbarButton>

                  <NavToolbarButton
                    onClick={() => onNavigate("settings")}
                    slidingActive={activeId === "settings"}
                    registerRef={(el) => registerToolbarItem("toolbar-settings", el)}
                    aria-label="Impostazioni"
                  >
                    <Settings className="h-[18px] w-[18px] shrink-0" strokeWidth={1.75} />
                  </NavToolbarButton>

                  <NavToolbarButton
                    onClick={() => {
                      closeProfileMenu();
                      closeFriendsMenu();
                      onNavigate("profile");
                    }}
                    slidingActive={activeId === "profile"}
                    registerRef={(el) => registerToolbarItem("toolbar-profile", el)}
                    className="hidden lg:inline-flex"
                    aria-label="Profilo e lista"
                    title="Profilo e lista"
                  >
                    <CircleUser className="h-[19px] w-[19px] shrink-0" strokeWidth={1.75} />
                  </NavToolbarButton>

                  <NavToolbarButton
                    onClick={(event) => toggleProfileMenu(event.currentTarget)}
                    aria-expanded={profileMenuOpen}
                    slidingActive={profileMenuOpen}
                    registerRef={(el) => registerToolbarItem("toolbar-avatar", el)}
                    className={`app-top-nav__toolbar-avatar relative shrink-0 ${
                      profileMenuOpen
                        ? ""
                        : "ring-2 ring-white/25 hover:ring-white/45"
                    }`}
                  >
                    <ProfileAvatar
                      profile={profile}
                      size="sm"
                      className="pointer-events-none !h-full !w-full !rounded-full"
                    />
                    <ProfileNotificationBadge
                      count={profileFriendAlertCount}
                      className="absolute -right-0.5 -top-0.5 z-[1]"
                    />
                  </NavToolbarButton>
                </div>
              </div>
            </div>

            <div className={`app-top-nav__actions pointer-events-auto ml-auto flex shrink-0 items-center gap-1 ${showDesktopChrome ? "hidden" : "flex"}`}>
              <NavToolbarButton
                onClick={onOpenSearch}
                className={`app-top-nav__icon flex shrink-0 items-center justify-center rounded-full transition-colors hover:bg-white/10 ${
                  isMobileDevice ? "h-11 w-11" : "h-10 w-10"
                }`}
                aria-label="Cerca"
              >
                <Search className="h-[19px] w-[19px]" strokeWidth={1.85} />
              </NavToolbarButton>

              <NavToolbarButton
                onClick={(event) => toggleProfileMenu(event.currentTarget)}
                aria-expanded={profileMenuOpen}
                className={`relative flex shrink-0 items-center justify-center rounded-full p-0 ring-2 ring-white/30 transition-[opacity,ring-color] hover:ring-white/50 ${
                  isMobileDevice ? "h-11 w-11" : "h-10 w-10"
                }`}
              >
                <ProfileAvatar profile={profile} size="sm" />
                <ProfileNotificationBadge
                  count={profileFriendAlertCount}
                  className="absolute -right-0.5 -top-0.5 z-[1]"
                />
              </NavToolbarButton>
            </div>
          </>
        )}
      </div>
    </header>
      {profileMenuOpen &&
        profileMenuPos &&
        createPortal(
          <div
            ref={profileMenuPanelRef}
            className="app-top-nav__profile-panel fixed z-[200]"
            style={{
              top: profileMenuPos.top,
              left: profileMenuPos.left,
              width: profileMenuPos.width,
            }}
          >
            <AppTopNavProfileMenuPanel
              profile={profile}
              onNavigateProfile={() => {
                closeProfileMenu();
                onNavigate("profile");
              }}
              onSwitchProfile={() => {
                closeProfileMenu();
                onSwitchProfile();
              }}
              onLogout={() => {
                closeProfileMenu();
                onLogout();
              }}
            />
          </div>,
          document.body,
        )}
    </>
  );
}
