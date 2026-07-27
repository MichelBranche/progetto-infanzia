import {
  Suspense,
  useEffect,
  type ReactNode,
} from "react";
import { useHeroAmbientControls } from "../context/HeroAmbientContext";
import { getBootCatalogCache, hasUsableCatalog } from "../lib/bootCatalog";
import {
  buildHeroStreamingPreviews,
  mergePreviewForHero,
} from "../lib/heroImage";
import {
  buildRandomHeroItems,
  enrichStreamingPreview,
} from "../lib/unifiedBrowse";
import { previewToMediaItem } from "../lib/streamingBrowse";
import { getUserAmbientPalette } from "../lib/ambientThemes";
import { boostAmbientPalette } from "../lib/imagePalette";
import type { MediaItem } from "../types/media";

/**
 * Il chunk della pagina titolo contiene player e hls.js: è il più pesante da
 * scaricare. Portarlo in cache mentre l'app è ferma evita che il primo Play
 * aspetti la rete.
 */
export function usePreloadPlayerChunk() {
  useEffect(() => {
    const preload = () => {
      void import("../components/AddonWatchPage");
    };

    if (typeof requestIdleCallback === "function") {
      const id = requestIdleCallback(preload, { timeout: 5000 });
      return () => cancelIdleCallback(id);
    }

    const id = window.setTimeout(preload, 2500);
    return () => window.clearTimeout(id);
  }, []);
}

export function RouteFallback() {
  return (
    <div className="flex h-full min-h-[40vh] items-center justify-center bg-void">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-white/10 border-t-accent" />
    </div>
  );
}

export function SuspenseRoute({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<RouteFallback />}>{children}</Suspense>;
}

const APP_FRAME_CLASS =
  "relative flex h-full min-h-0 flex-col lordflix-shell lordflix-app-frame";

export function AppFrame({ children }: { children: ReactNode }) {
  return <div className={APP_FRAME_CLASS}>{children}</div>;
}

export function RouteFrame({
  children,
}: {
  routeKey?: string;
  children: ReactNode;
}) {
  // Niente remount su cambio sezione: HomeKeepAliveSlot deve restare nel DOM
  // (web e desktop) cosi' scroll/ritorno home restano istantanei.
  return <>{children}</>;
}

/** Aurora: colori hero solo in homepage; altrove tema utente. */
export function HeroAmbientNavBridge({
  activeNav,
  seriesKey,
  overlayOpen,
}: {
  activeNav: string;
  seriesKey: string | null;
  overlayOpen: boolean;
}) {
  const { setActive, setBackdropUrl, setPalette } = useHeroAmbientControls();

  useEffect(() => {
    const onHome = activeNav === "home" && !seriesKey && !overlayOpen;
    if (onHome) {
      setActive(true);
      return;
    }
    setActive(false);
    setBackdropUrl(null);
    setPalette(boostAmbientPalette(getUserAmbientPalette()));
  }, [activeNav, seriesKey, overlayOpen, setActive, setBackdropUrl, setPalette]);

  useEffect(() => {
    const onTheme = () => {
      const onHome = activeNav === "home" && !seriesKey && !overlayOpen;
      if (onHome) return;
      setPalette(boostAmbientPalette(getUserAmbientPalette()));
    };
    window.addEventListener("branchefy:ambient-theme", onTheme);
    return () => window.removeEventListener("branchefy:ambient-theme", onTheme);
  }, [activeNav, seriesKey, overlayOpen, setPalette]);

  return null;
}

export function seedHeroItemsFromBoot(): MediaItem[] {
  const boot = getBootCatalogCache();
  if (!hasUsableCatalog(boot)) return [];
  const previews = buildHeroStreamingPreviews(
    boot!.index,
    boot!.index,
    boot!.rows,
  );
  if (previews.length === 0) return [];
  return buildRandomHeroItems(
    [],
    previews,
    (preview) =>
      previewToMediaItem(
        enrichStreamingPreview(mergePreviewForHero(preview, boot!.index)),
      ),
    8,
  );
}
