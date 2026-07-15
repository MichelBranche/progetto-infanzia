import { type RefObject, useEffect } from "react";

export function useStaggerInView(
  ref: RefObject<HTMLElement | null>,
  selector = ".stagger-card",
  enabled = true,
  deps: readonly unknown[] = [],
  scrollRootRef?: RefObject<HTMLElement | null>,
) {
  useEffect(() => {
    if (!enabled) return;
    const root = ref.current;
    if (!root) return;

    const nodes = Array.from(root.querySelectorAll<HTMLElement>(selector));
    if (nodes.length === 0) return;

    const scrollRoot = scrollRootRef?.current ?? null;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add("visible");
          observer.unobserve(entry.target);
        }
      },
      scrollRoot
        ? { root: scrollRoot, rootMargin: "120px", threshold: 0.01 }
        : { rootMargin: "0px 0px -8% 0px", threshold: 0.12 },
    );

    for (const node of nodes) observer.observe(node);

    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deps supplied by caller
  }, [ref, selector, enabled, scrollRootRef, ...deps]);
}
