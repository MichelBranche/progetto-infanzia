import { type RefObject } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";

gsap.registerPlugin(useGSAP);

export function useAppTopNavEntrance(innerRef: RefObject<HTMLElement | null>) {
  useGSAP(
    () => {
      const root = innerRef.current;
      if (!root) return;

      const navDock = root.querySelector(".app-top-nav__nav-dock");
      const navLinks = root.querySelectorAll(".lf-nav-link, .app-top-nav__link");
      const navSlider = root.querySelector(".app-top-nav__nav-dock .lf-nav-slider");
      const leftDock = root.querySelector(".app-top-nav__left-dock");
      const leftDockItems = root.querySelectorAll(
        ".app-top-nav__friends-stack, .app-top-nav__friends-chevron",
      );
      const toolbar = root.querySelector(".app-top-nav__toolbar");
      const toolbarSlider = root.querySelector(
        ".app-top-nav__toolbar .lf-nav-slider",
      );
      const toolbarItems = root.querySelectorAll(
        ".app-top-nav__toolbar .app-top-nav__toolbar-item",
      );
      const mobileItems = root.querySelectorAll(
        ".app-top-nav__actions .app-top-nav__toolbar-item",
      );

      const tl = gsap.timeline({ defaults: { ease: "power3.out" } });

      tl.from(root.querySelector(".app-top-nav__brand-logo"), {
        y: -18,
        opacity: 0,
        duration: 0.55,
        clearProps: "opacity,transform",
      });

      if (navDock) {
        tl.from(
          navDock,
          {
            y: -14,
            opacity: 0,
            scale: 0.94,
            duration: 0.48,
            clearProps: "opacity,transform",
          },
          "-=0.3",
        );
      }

      if (navLinks.length > 0) {
        tl.from(
          navLinks,
          {
            y: -12,
            opacity: 0,
            duration: 0.38,
            stagger: 0.045,
            clearProps: "opacity,transform",
          },
          "-=0.34",
        );
      }

      if (navSlider) {
        tl.from(
          navSlider,
          {
            opacity: 0,
            scaleX: 0.55,
            duration: 0.42,
            transformOrigin: "left center",
            clearProps: "opacity,transform",
          },
          "-=0.28",
        );
      }

      if (leftDock) {
        tl.from(
          leftDock,
          {
            y: -14,
            opacity: 0,
            scale: 0.94,
            duration: 0.48,
            clearProps: "opacity,transform",
          },
          "-=0.42",
        );
      }

      if (leftDockItems.length > 0) {
        tl.from(
          leftDockItems,
          {
            y: -10,
            opacity: 0,
            scale: 0.9,
            duration: 0.34,
            stagger: 0.08,
            clearProps: "opacity,transform",
          },
          "-=0.34",
        );
      }

      if (toolbarSlider) {
        tl.from(
          toolbarSlider,
          {
            opacity: 0,
            scaleX: 0.55,
            duration: 0.42,
            transformOrigin: "left center",
            clearProps: "opacity,transform",
          },
          "-=0.28",
        );
      }

      if (toolbar) {
        tl.from(
          toolbar,
          {
            y: -14,
            opacity: 0,
            scale: 0.94,
            duration: 0.48,
            clearProps: "opacity,transform",
          },
          "-=0.32",
        );
      }

      if (toolbarItems.length > 0) {
        tl.from(
          toolbarItems,
          {
            y: -10,
            opacity: 0,
            scale: 0.88,
            duration: 0.34,
            stagger: 0.055,
            clearProps: "opacity,transform",
          },
          "-=0.28",
        );
      }

      if (mobileItems.length > 0) {
        tl.from(
          mobileItems,
          {
            y: -10,
            opacity: 0,
            scale: 0.88,
            duration: 0.34,
            stagger: 0.055,
            clearProps: "opacity,transform",
          },
          "-=0.26",
        );
      }
    },
    { scope: innerRef },
  );
}

export function animateNavLinkHover(
  element: HTMLElement,
  entering: boolean,
) {
  gsap.to(element, {
    y: entering ? -2 : 0,
    duration: 0.4,
    ease: "back.out(1.7)",
    overwrite: "auto",
  });
}

export function animateToolbarIconHover(
  element: HTMLElement,
  entering: boolean,
) {
  gsap.to(element, {
    y: entering ? -3 : 0,
    scale: entering ? 1.06 : 1,
    duration: 0.38,
    ease: "back.out(1.85)",
    overwrite: "auto",
  });
}
