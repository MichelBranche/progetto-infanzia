import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  applyAmbientCssVars,
  clearAmbientCssVars,
  setAmbientDisplayPalette,
} from "../lib/ambientCss";
import { getUserAmbientPalette } from "../lib/ambientThemes";
import {
  boostAmbientPalette,
  clonePalette,
  lerpPalette,
  type AmbientPalette,
} from "../lib/imagePalette";

interface HeroAmbientControls {
  setPalette: (palette: AmbientPalette) => void;
  setActive: (active: boolean) => void;
  setBackdropUrl: (url: string | null) => void;
}

interface HeroAmbientActive {
  active: boolean;
  backdropUrl: string | null;
}

const HeroAmbientControlContext = createContext<HeroAmbientControls | null>(
  null,
);
const HeroAmbientActiveContext = createContext<HeroAmbientActive | null>(null);

export function HeroAmbientProvider({ children }: { children: ReactNode }) {
  const targetRef = useRef<AmbientPalette>(
    boostAmbientPalette(getUserAmbientPalette()),
  );
  const displayRef = useRef<AmbientPalette>(clonePalette(targetRef.current));
  const activeRef = useRef(false);
  const [active, setActiveState] = useState(false);
  const [backdropUrl, setBackdropUrlState] = useState<string | null>(null);

  const setPalette = useCallback((next: AmbientPalette) => {
    targetRef.current = boostAmbientPalette(next);
  }, []);

  const setActive = useCallback((next: boolean) => {
    activeRef.current = next;
    setActiveState(next);
  }, []);

  const setBackdropUrl = useCallback((next: string | null) => {
    setBackdropUrlState(next);
  }, []);

  useEffect(() => {
    const onTheme = () => {
      targetRef.current = boostAmbientPalette(getUserAmbientPalette());
    };
    window.addEventListener("branchefy:ambient-theme", onTheme);
    return () => window.removeEventListener("branchefy:ambient-theme", onTheme);
  }, []);

  useEffect(() => {
    let raf = 0;
    let lastSignature = "";

    const tick = () => {
      const amount = activeRef.current ? 0.14 : 0.07;
      displayRef.current = lerpPalette(
        displayRef.current,
        targetRef.current,
        amount,
      );

      // Scrive sul DOM solo quando i colori cambiano davvero: evita
      // ricalcoli di stile a ogni frame quando la palette è a regime.
      const { hues, accents } = displayRef.current;
      const signature = `${activeRef.current ? 1 : 0}|${hues
        .map((hue) => Math.round(hue))
        .join(",")}|${accents.map((accent) => accent.join(",")).join(";")}`;

      if (signature !== lastSignature) {
        lastSignature = signature;
        setAmbientDisplayPalette(displayRef.current);
        applyAmbientCssVars(displayRef.current, activeRef.current);
      }

      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      clearAmbientCssVars();
    };
  }, []);

  const controls = useMemo(
    () => ({ setPalette, setActive, setBackdropUrl }),
    [setPalette, setActive, setBackdropUrl],
  );

  const activeValue = useMemo(
    () => ({ active, backdropUrl }),
    [active, backdropUrl],
  );

  return (
    <HeroAmbientControlContext.Provider value={controls}>
      <HeroAmbientActiveContext.Provider value={activeValue}>
        {children}
      </HeroAmbientActiveContext.Provider>
    </HeroAmbientControlContext.Provider>
  );
}

export function useHeroAmbientControls() {
  const ctx = useContext(HeroAmbientControlContext);
  if (!ctx) {
    throw new Error(
      "useHeroAmbientControls must be used within HeroAmbientProvider",
    );
  }
  return ctx;
}

export function useHeroAmbientActive() {
  const ctx = useContext(HeroAmbientActiveContext);
  if (!ctx) {
    throw new Error(
      "useHeroAmbientActive must be used within HeroAmbientProvider",
    );
  }
  return ctx;
}

/** @deprecated Prefer useHeroAmbientControls / useHeroAmbientActive */
export function useHeroAmbient() {
  return { ...useHeroAmbientControls(), ...useHeroAmbientActive() };
}
