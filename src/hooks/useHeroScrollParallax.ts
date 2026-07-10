import { type RefObject } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";

gsap.registerPlugin(ScrollTrigger, useGSAP);

export function useHeroScrollParallax(
  heroRef: RefObject<HTMLElement | null>,
  mediaRef: RefObject<HTMLElement | null>,
  contentRef: RefObject<HTMLElement | null>,
  scrollRef: RefObject<HTMLElement | null>,
  enabled = true,
) {
  useGSAP(
    () => {
      if (!enabled) return;
      const scroller = scrollRef.current;
      const hero = heroRef.current;
      if (!scroller || !hero) return;

      const triggers: ScrollTrigger[] = [];

      if (mediaRef.current) {
        gsap.set(mediaRef.current, {
          force3D: true,
          transformOrigin: "center center",
        });
        triggers.push(
          ScrollTrigger.create({
            trigger: hero,
            scroller,
            start: "top top",
            end: "bottom top",
            scrub: 0.65,
            animation: gsap.fromTo(
              mediaRef.current,
              { yPercent: 0 },
              { yPercent: 7, ease: "none", force3D: true },
            ),
            invalidateOnRefresh: true,
          }),
        );
      }

      if (contentRef.current) {
        gsap.set(contentRef.current, { force3D: true });
        triggers.push(
          ScrollTrigger.create({
            trigger: hero,
            scroller,
            start: "top top",
            end: "55% top",
            scrub: 0.55,
            animation: gsap.fromTo(
              contentRef.current,
              { y: 0, opacity: 1 },
              { y: -28, opacity: 0, ease: "none", force3D: true },
            ),
            invalidateOnRefresh: true,
          }),
        );
      }

      requestAnimationFrame(() => {
        ScrollTrigger.refresh();
      });

      return () => {
        for (const trigger of triggers) trigger.kill();
      };
    },
    {
      scope: heroRef,
      dependencies: [enabled],
      revertOnUpdate: false,
    },
  );
}
