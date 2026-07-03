import { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  ArrowUpRight,
  Clapperboard,
  Clock,
  Film,
  Home,
  Plus,
  Search,
  Settings,
  Sparkles,
  Tv,
  Wifi,
  User,
  type LucideIcon,
} from "lucide-react";
import { getNavSections, type NavItem } from "../data/nav";
import { useAddons } from "../context/AddonsContext";
import type { Profile } from "../types/profile";
import { roleLabel } from "../types/profile";
import { ProfileAvatar } from "./ProfileAvatar";

const SIDEBAR_PIN_KEY = "branchefy-sidebar-pinned";
export const SIDEBAR_COLLAPSED_W = 68;
export const SIDEBAR_EXPANDED_W = 276;

const iconMap: Record<string, LucideIcon> = {
  Home,
  Plus,
  Settings,
  Activity,
  Search,
  Film,
  Sparkles,
  Tv,
  Clock,
  Wifi,
  User,
  Anime: Clapperboard,
};

interface SidebarProps {
  activeId: string;
  profile: Profile;
  onNavigate: (id: string) => void;
  onSwitchProfile?: () => void;
  badgeCounts?: Record<string, number>;
  alertDots?: readonly string[];
}

type IndexedItem = { item: NavItem; index: number };

function formatIndex(n: number) {
  return String(n).padStart(2, "0");
}

function SectionLabel({ children }: { children: string }) {
  return (
    <div className="mb-2 flex items-center gap-3 px-6">
      <span className="h-px w-3 bg-white/15" />
      <p className="text-[10px] font-medium uppercase tracking-[0.34em] text-text-muted/60">
        {children}
      </p>
    </div>
  );
}

function NavEntry({
  item,
  index,
  isActive,
  expanded,
  onNavigate,
  badgeCount,
  showAlertDot,
}: {
  item: NavItem;
  index: number;
  isActive: boolean;
  expanded: boolean;
  onNavigate: (id: string) => void;
  badgeCount?: number;
  showAlertDot?: boolean;
}) {
  const Icon = iconMap[item.icon];
  const showBadge = badgeCount != null && badgeCount > 0;
  const accent = item.accent;

  return (
    <button
      type="button"
      onClick={() => onNavigate(item.id)}
      title={expanded ? undefined : item.label}
      aria-current={isActive ? "page" : undefined}
      aria-label={item.label}
      className={`group relative flex w-full items-center transition-[color,border-color] duration-300 ${
        expanded
          ? "gap-3.5 border-l py-[9px] pl-5 pr-3"
          : "justify-center border-l-2 py-2.5"
      } ${
        isActive
          ? expanded
            ? "border-white text-text-primary"
            : "border-white text-text-primary"
          : expanded
            ? "border-transparent text-text-muted hover:border-white/20 hover:text-text-secondary"
            : "border-transparent text-text-muted hover:text-text-secondary"
      }`}
    >
      {expanded ? (
        <>
          <span
            className={`w-[18px] shrink-0 text-left text-[10px] tabular-nums transition-colors ${
              isActive ? "text-text-secondary" : "text-text-muted/40 group-hover:text-text-muted/70"
            }`}
          >
            {formatIndex(index)}
          </span>
          <span className="flex min-w-0 flex-1 items-baseline gap-2">
            <span
              className={`font-display truncate text-[14px] font-medium tracking-[-0.03em] transition-[transform,color] duration-300 group-hover:translate-x-px ${
                isActive
                  ? "text-text-primary"
                  : accent
                    ? "text-accent/90 group-hover:text-accent"
                    : ""
              }`}
            >
              {item.label}
            </span>
            {showBadge && (
              <span className="ml-auto shrink-0 text-[10px] tabular-nums text-accent/90">
                {badgeCount}
              </span>
            )}
            {showAlertDot && !showBadge && (
              <span className="ml-auto h-1 w-1 shrink-0 rounded-full bg-warm" />
            )}
          </span>
          <ArrowUpRight
            className={`h-3 w-3 shrink-0 transition-all duration-300 ${
              isActive
                ? "opacity-40"
                : "opacity-0 group-hover:translate-x-px group-hover:-translate-y-px group-hover:opacity-30"
            }`}
            strokeWidth={1.5}
          />
        </>
      ) : (
        <span className="relative flex items-center justify-center">
          <Icon
            className={`h-4 w-4 ${accent && !isActive ? "text-accent/80" : ""}`}
            strokeWidth={isActive ? 2 : 1.5}
          />
          {showBadge && (
            <span className="absolute -right-1.5 -top-1.5 h-1.5 w-1.5 rounded-full bg-accent" />
          )}
          {showAlertDot && !showBadge && (
            <span className="absolute -right-1 -top-1 h-1.5 w-1.5 rounded-full bg-warm" />
          )}
        </span>
      )}
    </button>
  );
}

export function Sidebar({
  activeId,
  profile,
  onNavigate,
  onSwitchProfile,
  badgeCounts,
  alertDots,
}: SidebarProps) {
  const { hasStreaming } = useAddons();
  const sections = getNavSections(profile, hasStreaming);
  const [pinned, setPinned] = useState(() => {
    try {
      return localStorage.getItem(SIDEBAR_PIN_KEY) === "true";
    } catch {
      return false;
    }
  });
  const [hovered, setHovered] = useState(false);
  const [closing, setClosing] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const contentExpanded = pinned || hovered;
  const layoutWidth = pinned ? SIDEBAR_EXPANDED_W : SIDEBAR_COLLAPSED_W;
  const panelWidth =
    pinned || hovered ? SIDEBAR_EXPANDED_W : SIDEBAR_COLLAPSED_W;
  const isFlyout = (hovered || closing) && !pinned;

  const handleMouseEnter = () => {
    setClosing(false);
    setHovered(true);
  };

  const handleMouseLeave = () => {
    setHovered(false);
    if (!pinned) {
      setClosing(true);
    }
  };

  const handlePanelTransitionEnd = (
    event: React.TransitionEvent<HTMLDivElement>,
  ) => {
    if (event.propertyName !== "width" || event.target !== event.currentTarget) {
      return;
    }
    if (!pinned && !hovered) {
      setClosing(false);
    }
  };

  useEffect(() => {
    if (pinned) {
      setClosing(false);
    }
  }, [pinned]);

  useEffect(() => {
    if (!closing) return;
    const fallback = window.setTimeout(() => setClosing(false), 450);
    return () => window.clearTimeout(fallback);
  }, [closing]);

  const { primaryItems, browseItems, utilityItems } = useMemo(() => {
    const browseIds = new Set([
      "film",
      "cartoni",
      "serie",
      "capsula",
      "anime",
    ]);
    const primary: NavItem[] = [];
    const browse: NavItem[] = [];
    const utility: NavItem[] = [];

    for (const section of sections) {
      for (const item of section.items) {
        if (item.id === "search") continue;
        if (browseIds.has(item.id)) browse.push(item);
        else if (section.id === "primary") primary.push(item);
        else utility.push(item);
      }
    }

    const dedupe = (items: NavItem[]) => {
      const seen = new Set<string>();
      return items.filter((item) => {
        if (seen.has(item.id)) return false;
        seen.add(item.id);
        return true;
      });
    };

    return {
      primaryItems: dedupe(primary),
      browseItems: dedupe(browse),
      utilityItems: dedupe(utility),
    };
  }, [sections]);

  const { primaryIndexed, browseIndexed, utilityIndexed } = useMemo(() => {
    let n = 0;
    const index = (items: NavItem[]): IndexedItem[] =>
      items.map((item) => {
        n += 1;
        return { item, index: n };
      });
    return {
      primaryIndexed: index(primaryItems),
      browseIndexed: index(browseItems),
      utilityIndexed: index(utilityItems),
    };
  }, [primaryItems, browseItems, utilityItems]);

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

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      const typing =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        (target instanceof HTMLElement && target.isContentEditable);

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "b") {
        event.preventDefault();
        setPinned((value) => !value);
        return;
      }

      if (
        event.key === "/" &&
        !typing &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey
      ) {
        event.preventDefault();
        onNavigate("search");
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onNavigate]);

  return (
    <aside
      className="relative z-30 h-full shrink-0 transition-[width] duration-[380ms] ease-[cubic-bezier(0.22,1,0.36,1)]"
      style={{ width: layoutWidth }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <div
        ref={panelRef}
        onTransitionEnd={handlePanelTransitionEnd}
        className={`flex h-full flex-col overflow-hidden border-r border-white/[0.06] bg-[#070709] transition-[width,box-shadow] duration-[380ms] ease-[cubic-bezier(0.22,1,0.36,1)] ${
          isFlyout
            ? "absolute inset-y-0 left-0 z-50 shadow-[20px_0_72px_rgba(0,0,0,0.5)]"
            : "relative"
        }`}
        style={{ width: panelWidth }}
      >
        <div className="noise-overlay pointer-events-none absolute inset-0 opacity-[0.14]" />

        <header
          className={`relative shrink-0 overflow-hidden ${
            contentExpanded ? "px-6 pb-5 pt-7" : "px-2 pb-4 pt-6"
          }`}
        >
          {contentExpanded ? (
            <>
              <div className="flex items-start justify-between gap-3">
                <button
                  type="button"
                  onClick={() => onNavigate("home")}
                  className="min-w-0 max-w-[calc(100%-2.5rem)] text-left transition-opacity hover:opacity-75"
                  aria-label="Home Branchefy"
                >
                  <div className="min-w-0 overflow-hidden">
                    <p className="truncate whitespace-nowrap text-[10px] font-medium uppercase tracking-[0.32em] text-text-muted">
                      Branchefy
                    </p>
                    <p className="font-display mt-2.5 truncate whitespace-nowrap text-[1.5rem] font-semibold leading-none tracking-[-0.05em] text-text-primary">
                      Menu
                    </p>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setPinned((v) => !v)}
                  title={pinned ? "Comprimi · Ctrl+B" : "Fissa · Ctrl+B"}
                  aria-pressed={pinned}
                  className="shrink-0 text-[10px] font-medium uppercase tracking-[0.2em] text-text-muted/70 transition-colors hover:text-text-secondary"
                >
                  {pinned ? "— Chiudi" : "— Fissa"}
                </button>
              </div>

              <button
                type="button"
                onClick={() => onNavigate("search")}
                className={`mt-7 flex w-full min-w-0 items-end gap-2.5 overflow-hidden border-b pb-2 text-left transition-colors ${
                  activeId === "search"
                    ? "border-white/45 text-text-primary"
                    : "border-white/[0.08] text-text-muted hover:border-white/20 hover:text-text-secondary"
                }`}
              >
                <Search className="mb-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={1.5} />
                <span className="min-w-0 flex-1 truncate whitespace-nowrap font-display text-[13px] tracking-[-0.02em]">
                  Cerca nel catalogo
                </span>
                <kbd className="mb-0.5 shrink-0 font-mono text-[9px] text-text-muted/50">
                  /
                </kbd>
              </button>
            </>
          ) : (
            <div className="flex w-full flex-col items-center gap-2">
              <button
                type="button"
                onClick={() => onNavigate("home")}
                className="flex h-10 w-10 items-center justify-center rounded-lg transition-colors hover:bg-white/[0.04]"
                aria-label="Home Branchefy"
              >
                <span className="font-display text-[1.05rem] font-semibold leading-none tracking-[-0.06em] text-text-primary">
                  B
                </span>
              </button>
              <button
                type="button"
                onClick={() => setPinned((v) => !v)}
                title={pinned ? "Comprimi · Ctrl+B" : "Fissa · Ctrl+B"}
                aria-pressed={pinned}
                className="flex h-5 w-full items-center justify-center text-[10px] tracking-[0.35em] text-text-muted/55 transition-colors hover:text-text-muted"
              >
                ···
              </button>
            </div>
          )}
        </header>

        <nav className="scrollbar-hide relative flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden pb-2">
          {!contentExpanded && (
            <button
              type="button"
              onClick={() => onNavigate("search")}
              title="Cerca"
              aria-current={activeId === "search" ? "page" : undefined}
              className={`flex justify-center border-l-2 py-2.5 transition-colors ${
                activeId === "search"
                  ? "border-white text-text-primary"
                  : "border-transparent text-text-muted hover:text-text-secondary"
              }`}
            >
              <Search className="h-4 w-4" strokeWidth={1.5} />
            </button>
          )}

          {primaryIndexed.length > 0 && (
            <div className={contentExpanded ? "" : "mt-1"}>
              {contentExpanded && <SectionLabel>Principale</SectionLabel>}
              {primaryIndexed.map(({ item, index }) => (
                <NavEntry
                  key={item.id}
                  item={item}
                  index={index}
                  isActive={activeId === item.id}
                  expanded={contentExpanded}
                  onNavigate={onNavigate}
                  badgeCount={badgeCounts?.[item.id]}
                  showAlertDot={alertDots?.includes(item.id)}
                />
              ))}
            </div>
          )}

          {browseIndexed.length > 0 && (
            <div
              className={
                contentExpanded
                  ? "mt-7"
                  : "mt-2 border-t border-white/[0.05] pt-2"
              }
            >
              {contentExpanded && <SectionLabel>Esplora</SectionLabel>}
              {browseIndexed.map(({ item, index }) => (
                <NavEntry
                  key={item.id}
                  item={item}
                  index={index}
                  isActive={activeId === item.id}
                  expanded={contentExpanded}
                  onNavigate={onNavigate}
                />
              ))}
            </div>
          )}

          {utilityIndexed.length > 0 && (
            <div
              className={
                contentExpanded
                  ? "mt-7"
                  : "mt-2 border-t border-white/[0.05] pt-2"
              }
            >
              {contentExpanded && <SectionLabel>Account</SectionLabel>}
              {utilityIndexed.map(({ item, index }) => (
                <NavEntry
                  key={item.id}
                  item={item}
                  index={index}
                  isActive={activeId === item.id}
                  expanded={contentExpanded}
                  onNavigate={onNavigate}
                />
              ))}
            </div>
          )}
        </nav>

        <footer className="relative shrink-0 border-t border-white/[0.06] px-4 py-3.5">
          <button
            type="button"
            onClick={() => onNavigate("profile")}
            className={`group flex w-full items-center transition-opacity hover:opacity-80 ${
              contentExpanded ? "gap-3" : "justify-center"
            }`}
          >
            <ProfileAvatar profile={profile} size="sm" />
            {contentExpanded && (
              <>
                <div className="min-w-0 flex-1 overflow-hidden text-left">
                  <p className="truncate whitespace-nowrap font-display text-[13px] font-medium tracking-[-0.02em] text-text-primary">
                    {profile.name}
                  </p>
                  <p className="mt-0.5 truncate whitespace-nowrap text-[9px] uppercase tracking-[0.22em] text-text-muted">
                    {roleLabel(profile.role)}
                  </p>
                </div>
                <ArrowUpRight className="h-3 w-3 shrink-0 text-text-muted opacity-0 transition-opacity group-hover:opacity-40" />
              </>
            )}
            {contentExpanded && alertDots?.includes("profile") && (
              <span className="absolute right-4 top-3.5 h-1.5 w-1.5 rounded-full bg-warm" />
            )}
          </button>

          {contentExpanded && onSwitchProfile && (
            <button
              type="button"
              onClick={onSwitchProfile}
              className="mt-3 w-full border-t border-white/[0.05] pt-3 text-left text-[10px] uppercase tracking-[0.22em] text-text-muted/80 transition-colors hover:text-text-secondary"
            >
              Cambia profilo
            </button>
          )}
        </footer>
      </div>
    </aside>
  );
}
