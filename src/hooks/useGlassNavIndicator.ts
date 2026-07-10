import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from "react";

export interface NavIndicatorStyle {
  x: number;
  width: number;
  opacity: number;
}

export function useGlassNavIndicator(
  navRef: RefObject<HTMLElement | null>,
  activeKey: string,
  deps: readonly unknown[] = [],
) {
  const linkRefs = useRef(new Map<string, HTMLElement>());
  const [indicator, setIndicator] = useState<NavIndicatorStyle>({
    x: 0,
    width: 0,
    opacity: 0,
  });

  const register = useCallback((key: string, el: HTMLElement | null) => {
    if (el) linkRefs.current.set(key, el);
    else linkRefs.current.delete(key);
  }, []);

  const update = useCallback(() => {
    const nav = navRef.current;
    const active = linkRefs.current.get(activeKey);
    if (!nav || !active) {
      setIndicator((prev) =>
        prev.opacity === 0 ? prev : { ...prev, opacity: 0 },
      );
      return;
    }

    const navRect = nav.getBoundingClientRect();
    const activeRect = active.getBoundingClientRect();
    setIndicator({
      x: activeRect.left - navRect.left,
      width: activeRect.width,
      opacity: 1,
    });
  }, [activeKey, navRef]);

  useLayoutEffect(() => {
    update();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- caller deps
  }, [update, ...deps]);

  useEffect(() => {
    const nav = navRef.current;
    if (!nav || typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver(() => update());
    observer.observe(nav);
    window.addEventListener("resize", update);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [navRef, update]);

  return { register, indicator };
}
