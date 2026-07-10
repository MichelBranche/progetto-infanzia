import { type RefObject } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";

gsap.registerPlugin(ScrollTrigger, useGSAP);

export function useLordFlixHeroEntrance(
  contentRef: RefObject<HTMLElement | null>,
  slideKey: string,
) {
  useGSAP(
    () => {
      const root = contentRef.current;
      if (!root) return;

      const items = root.querySelectorAll("[data-hero-part]");
      gsap.fromTo(
        items,
        { opacity: 0, y: 22 },
        {
          opacity: 1,
          y: 0,
          duration: 0.55,
          stagger: 0.07,
          ease: "power3.out",
          clearProps: "opacity,transform",
        },
      );
    },
    { scope: contentRef, dependencies: [slideKey] },
  );
}
