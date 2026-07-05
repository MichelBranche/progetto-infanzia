import { type RefObject } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";

gsap.registerPlugin(useGSAP);

export function useAppTopNavEntrance(innerRef: RefObject<HTMLElement | null>) {
  useGSAP(
    () => {
      const root = innerRef.current;
      if (!root) return;

      const tl = gsap.timeline({ defaults: { ease: "power3.out" } });

      const iconButtons = root.querySelectorAll(".app-top-nav__icon-btn");

      tl.from(root.querySelector(".app-top-nav__brand"), {
        y: -18,
        opacity: 0,
        duration: 0.55,
        clearProps: "opacity,transform",
      })
        .from(
          root.querySelectorAll(".app-top-nav__link"),
          {
            y: -12,
            opacity: 0,
            duration: 0.38,
            stagger: 0.045,
            clearProps: "opacity,transform",
          },
          "-=0.32",
        )
        .from(
          iconButtons,
          {
            y: -10,
            opacity: 0,
            duration: 0.32,
            stagger: 0.05,
            clearProps: "opacity,transform",
          },
          "-=0.22",
        );

      if (iconButtons.length === 0) {
        gsap.set(root.querySelectorAll(".app-top-nav__actions .app-top-nav__icon-btn"), {
          opacity: 1,
          y: 0,
        });
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
    duration: 0.22,
    ease: "power2.out",
    overwrite: "auto",
  });
}
