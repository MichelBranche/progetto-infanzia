import { useLayoutEffect, useRef, type RefObject } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { BookOpen, Clapperboard, Sparkles, type LucideIcon } from "lucide-react";
import type { NavItem } from "../data/nav";

gsap.registerPlugin(useGSAP);

const MOBILE_MORE_ITEM_IDS = ["cartoni", "anime", "manga"] as const;

const iconMap: Record<(typeof MOBILE_MORE_ITEM_IDS)[number], LucideIcon> = {
  cartoni: Sparkles,
  anime: Clapperboard,
  manga: BookOpen,
};

interface AppMobileNavMoreMenuProps {
  panelRef: RefObject<HTMLDivElement | null>;
  anchorRef: RefObject<HTMLElement | null>;
  activeId: string;
  moreNav: NavItem[];
  onNavigate: (id: string) => void;
  onClose: () => void;
}

export function animateAppMobileNavMoreMenuClose(
  panelRef: RefObject<HTMLDivElement | null>,
  onDone: () => void,
) {
  const panel = panelRef.current;
  if (!panel) {
    onDone();
    return;
  }

  gsap.killTweensOf(panel);
  gsap.to(panel, {
    opacity: 0,
    y: 10,
    scale: 0.92,
    duration: 0.18,
    ease: "power2.in",
    onComplete: onDone,
  });
}

export function AppMobileNavMoreMenu({
  panelRef,
  anchorRef,
  activeId,
  moreNav,
  onNavigate,
  onClose,
}: AppMobileNavMoreMenuProps) {
  const tweenRef = useRef<gsap.core.Timeline | null>(null);
  const items = MOBILE_MORE_ITEM_IDS.map((id) =>
    moreNav.find((entry) => entry.id === id),
  ).filter((entry): entry is NavItem => entry != null);

  useLayoutEffect(() => {
    const panel = panelRef.current;
    const anchor = anchorRef.current;
    if (!panel || !anchor) return;

    const syncPosition = () => {
      const rect = anchor.getBoundingClientRect();
      panel.style.left = `${rect.left + rect.width / 2}px`;
      panel.style.bottom = `${window.innerHeight - rect.top + 14}px`;
    };

    syncPosition();
    window.addEventListener("resize", syncPosition);
    window.addEventListener("scroll", syncPosition, true);

    return () => {
      window.removeEventListener("resize", syncPosition);
      window.removeEventListener("scroll", syncPosition, true);
    };
  }, [anchorRef, panelRef, items.length]);

  useGSAP(
    () => {
      const panel = panelRef.current;
      if (!panel || items.length === 0) return;

      tweenRef.current?.kill();
      const entries = panel.querySelectorAll("[data-mobile-more-item]");

      gsap.set(panel, {
        pointerEvents: "auto",
        transformOrigin: "50% 100%",
        opacity: 0,
        y: 12,
        scale: 0.9,
      });
      gsap.set(entries, { opacity: 0, y: 8 });

      const tl = gsap.timeline({
        defaults: { ease: "power3.out" },
        onComplete: () => {
          gsap.set(panel, { clearProps: "opacity,transform" });
          gsap.set(entries, { clearProps: "opacity,transform" });
        },
      });

      tl.to(panel, { opacity: 1, y: 0, scale: 1, duration: 0.32 }).to(
        entries,
        { opacity: 1, y: 0, duration: 0.24, stagger: 0.05 },
        "-=0.16",
      );

      tweenRef.current = tl;

      return () => {
        tweenRef.current?.kill();
      };
    },
    { scope: panelRef, dependencies: [items.length] },
  );

  if (items.length === 0) return null;

  return (
    <>
      <button
        type="button"
        aria-label="Chiudi menu categorie"
        className="mobile-nav-more-backdrop"
        onClick={onClose}
      />
      <div
        ref={panelRef}
        className="mobile-nav-more-bubble"
        role="menu"
        aria-label="Altre categorie"
      >
        <div className="mobile-nav-more-bubble__tail" aria-hidden />
        <div className="mobile-nav-more-bubble__items">
          {items.map((item) => {
            const Icon = iconMap[item.id as (typeof MOBILE_MORE_ITEM_IDS)[number]];
            const active = activeId === item.id;

            return (
              <button
                key={item.id}
                type="button"
                data-mobile-more-item
                role="menuitem"
                onClick={() => onNavigate(item.id)}
                className={`mobile-nav-more-bubble__item${active ? " mobile-nav-more-bubble__item--active" : ""}`}
              >
                <span className="mobile-nav-more-bubble__icon" aria-hidden>
                  <Icon strokeWidth={active ? 2.35 : 2} />
                </span>
                <span className="mobile-nav-more-bubble__label">{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}
