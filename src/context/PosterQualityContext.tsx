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
  detectPosterQualityTier,
  downgradeTier,
  subscribePosterQualityTier,
  type PosterQualityTier,
} from "../lib/posterQuality";

interface PosterQualityContextValue {
  tier: PosterQualityTier;
  reportSlowImageLoad: (elapsedMs: number) => void;
}

const PosterQualityContext = createContext<PosterQualityContextValue | null>(
  null,
);

const SLOW_IMAGE_MS = 2_800;
const SLOW_IMAGE_DOWNGRADE_COOLDOWN_MS = 12_000;

export function PosterQualityProvider({ children }: { children: ReactNode }) {
  const [tier, setTier] = useState<PosterQualityTier>(() =>
    detectPosterQualityTier(),
  );
  const lastDowngradeAtRef = useRef(0);

  useEffect(() => subscribePosterQualityTier(setTier), []);

  const reportSlowImageLoad = useCallback((elapsedMs: number) => {
    if (elapsedMs < SLOW_IMAGE_MS) return;
    const now = Date.now();
    if (now - lastDowngradeAtRef.current < SLOW_IMAGE_DOWNGRADE_COOLDOWN_MS) {
      return;
    }
    lastDowngradeAtRef.current = now;
    setTier((current) => downgradeTier(current));
  }, []);

  const value = useMemo(
    () => ({ tier, reportSlowImageLoad }),
    [tier, reportSlowImageLoad],
  );

  return (
    <PosterQualityContext.Provider value={value}>
      {children}
    </PosterQualityContext.Provider>
  );
}

export function usePosterQuality(): PosterQualityContextValue {
  const ctx = useContext(PosterQualityContext);
  if (!ctx) {
    return {
      tier: detectPosterQualityTier(),
      reportSlowImageLoad: () => {},
    };
  }
  return ctx;
}
