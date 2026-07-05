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
        triggers.push(
          ScrollTrigger.create({
            trigger: hero,
            scroller,
            start: "top top",
            end: "bottom top",
            scrub: 0.6,
            animation: gsap.fromTo(
              mediaRef.current,
              { yPercent: 0, scale: 1 },
              { yPercent: 14, scale: 1.06, ease: "none" },
            ),
            invalidateOnRefresh: true,
          }),
        );
      }

      const resetIfAtTop = () => {
        if (scroller.scrollTop > 2) return;
        if (mediaRef.current) {
          gsap.set(mediaRef.current, { yPercent: 0, scale: 1 });
        }
        if (contentRef.current) {
          gsap.set(contentRef.current, { y: 0, opacity: 1 });
        }
      };

      ScrollTrigger.addEventListener("refresh", resetIfAtTop);

      requestAnimationFrame(() => {
        ScrollTrigger.refresh();
        resetIfAtTop();
      });

      return () => {
        ScrollTrigger.removeEventListener("refresh", resetIfAtTop);
        for (const trigger of triggers) trigger.kill();
      };
    },
    {
      scope: heroRef,
      dependencies: [enabled],
      revertOnUpdate: true,
    },
  );
}
