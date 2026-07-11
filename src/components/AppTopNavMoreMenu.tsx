import { useRef, type RefObject } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import type { NavItem } from "../data/nav";

gsap.registerPlugin(useGSAP);

interface AppTopNavMoreMenuProps {
  panelRef: RefObject<HTMLDivElement | null>;
  activeId: string;
  primaryNav: NavItem[];
  moreNav: NavItem[];
  alertDots?: readonly string[];
  includePrimary: boolean;
  onNavigate: (id: string) => void;
  onSelect: () => void;
  className?: string;
}

export function animateAppTopNavMoreMenuClose(
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
    y: -10,
    scale: 0.96,
    duration: 0.2,
    ease: "power2.in",
    onComplete: onDone,
  });
}

export function AppTopNavMoreMenu({
  panelRef,
  activeId,
  primaryNav,
  moreNav,
  alertDots,
  includePrimary,
  onNavigate,
  onSelect,
  className = "",
}: AppTopNavMoreMenuProps) {
  const tweenRef = useRef<gsap.core.Timeline | null>(null);

  useGSAP(
    () => {
      const panel = panelRef.current;
      if (!panel) return;

      tweenRef.current?.kill();
      const items = panel.querySelectorAll("[data-more-item]");

      gsap.set(panel, {
        pointerEvents: "auto",
        transformOrigin: className.includes("right-0") ? "top right" : "top left",
        opacity: 0,
        y: -14,
        scale: 0.94,
      });
      gsap.set(items, { opacity: 0, x: -12 });

      const tl = gsap.timeline({
        defaults: { ease: "power3.out" },
        onComplete: () => {
          gsap.set(panel, { clearProps: "opacity,transform" });
          gsap.set(items, { clearProps: "opacity,transform" });
        },
      });

      tl.to(panel, { opacity: 1, y: 0, scale: 1, duration: 0.34 }).to(
        items,
        { opacity: 1, x: 0, duration: 0.26, stagger: 0.04 },
        "-=0.18",
      );

      tweenRef.current = tl;

      return () => {
        tweenRef.current?.kill();
      };
    },
    { scope: panelRef, dependencies: [className] },
  );

  if (moreNav.length === 0 && (!includePrimary || primaryNav.length === 0)) {
    return null;
  }

  return (
    <div
      ref={panelRef}
      className={`app-top-nav__more-panel pointer-events-auto absolute top-[calc(100%+10px)] z-[70] max-h-[min(70vh,420px)] min-w-[220px] overflow-y-auto rounded-xl border border-white/[0.1] bg-[#121216] py-1.5 shadow-[0_24px_64px_rgba(0,0,0,0.55)] ${className}`}
      role="menu"
    >
      {includePrimary && (
        <>
          {primaryNav.map((item) => (
            <button
              key={item.id}
              type="button"
              data-more-item
              role="menuitem"
              onClick={() => {
                onSelect();
                onNavigate(item.id);
              }}
              className={`flex w-full px-3.5 py-2.5 text-left text-[13px] transition-colors hover:bg-white/[0.06] ${
                activeId === item.id ? "text-white" : "text-text-secondary"
              }`}
            >
              {item.label}
            </button>
          ))}
          {moreNav.length > 0 && (
            <div className="my-1 border-t border-white/[0.06]" />
          )}
        </>
      )}
      {moreNav.map((item) => (
        <button
          key={item.id}
          type="button"
          data-more-item
          role="menuitem"
          onClick={() => {
            onSelect();
            onNavigate(item.id);
          }}
          className={`flex w-full items-center justify-between px-3.5 py-2.5 text-left text-[13px] transition-colors hover:bg-white/[0.06] ${
            activeId === item.id ? "text-white" : "text-text-secondary"
          }`}
        >
          <span>{item.label}</span>
          {alertDots?.includes(item.id) && (
            <span className="h-1.5 w-1.5 rounded-full bg-warm" />
          )}
        </button>
      ))}
    </div>
  );
}
