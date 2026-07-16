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

  // Wake function installato dalla RAF loop: riavvia l'animazione quando è
  // stata sospesa perché la palette era a regime.
  const wakeRef = useRef<() => void>(() => {});

  const setPalette = useCallback((next: AmbientPalette) => {
    targetRef.current = boostAmbientPalette(next);
    wakeRef.current();
  }, []);

  const setActive = useCallback((next: boolean) => {
    activeRef.current = next;
    setActiveState(next);
    wakeRef.current();
  }, []);

  const setBackdropUrl = useCallback((next: string | null) => {
    setBackdropUrlState(next);
  }, []);

  useEffect(() => {
    const onTheme = () => {
      targetRef.current = boostAmbientPalette(getUserAmbientPalette());
      wakeRef.current();
    };
    window.addEventListener("branchefy:ambient-theme", onTheme);
    return () => window.removeEventListener("branchefy:ambient-theme", onTheme);
  }, []);

  useEffect(() => {
    let raf = 0;
    let lastSignature = "";
    let stableFrames = 0;
    // Numero di frame consecutivi senza variazioni dopo cui sospendiamo la
    // loop: la palette è visivamente a regime, inutile continuare a girare.
    const STABLE_FRAME_LIMIT = 8;

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
        stableFrames = 0;
        setAmbientDisplayPalette(displayRef.current);
        applyAmbientCssVars(displayRef.current, activeRef.current);
      } else {
        stableFrames += 1;
      }

      if (stableFrames >= STABLE_FRAME_LIMIT) {
        raf = 0;
        return;
      }
      raf = requestAnimationFrame(tick);
    };

    const wake = () => {
      stableFrames = 0;
      if (raf === 0) {
        raf = requestAnimationFrame(tick);
      }
    };
    wakeRef.current = wake;

    raf = requestAnimationFrame(tick);
    return () => {
      if (raf !== 0) cancelAnimationFrame(raf);
      wakeRef.current = () => {};
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
