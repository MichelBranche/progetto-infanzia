import { useEffect } from "react";
import { useHeroAmbientControls } from "../context/HeroAmbientContext";
import { getUserAmbientPalette } from "../lib/ambientThemes";
import { boostAmbientPalette } from "../lib/imagePalette";

export function isBrowseAmbientSection(
  activeNav: string,
  seriesKey: string | null,
): boolean {
  return (
    (activeNav === "film" || activeNav === "serie" || activeNav === "anime") &&
    !seriesKey
  );
}

/** Attiva palette e classe root per l'aurora liquid su Film / Serie TV / Anime. */
export function BrowseAmbientSetup({
  activeNav,
  seriesKey,
}: {
  activeNav: string;
  seriesKey: string | null;
}) {
  const { setPalette } = useHeroAmbientControls();
  const browseAmbient = isBrowseAmbientSection(activeNav, seriesKey);

  useEffect(() => {
    const applyTheme = () => {
      if (browseAmbient) {
        setPalette(boostAmbientPalette(getUserAmbientPalette()));
      }
    };

    const root = document.documentElement;
    root.classList.toggle("lf-browse-ambient", browseAmbient);
    applyTheme();

    window.addEventListener("branchefy:ambient-theme", applyTheme);
    return () => {
      root.classList.remove("lf-browse-ambient");
      window.removeEventListener("branchefy:ambient-theme", applyTheme);
    };
  }, [browseAmbient, setPalette]);

  return null;
}
