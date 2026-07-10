import type { AmbientPalette } from "./imagePalette";
import { accentCss } from "./imagePalette";

let displayPalette: AmbientPalette | null = null;

export function setAmbientDisplayPalette(palette: AmbientPalette) {
  displayPalette = palette;
}

export function getAmbientDisplayPalette(): AmbientPalette | null {
  return displayPalette;
}

export function applyAmbientCssVars(palette: AmbientPalette, active: boolean) {
  const root = document.documentElement;
  const [hueA, hueB, hueC] = palette.hues;
  const [accentA, accentB, accentC] = palette.accents;

  root.style.setProperty("--lf-hue-a", String(hueA));
  root.style.setProperty("--lf-hue-b", String(hueB));
  root.style.setProperty("--lf-hue-c", String(hueC));
  root.style.setProperty("--lf-accent-a", accentCss(accentA));
  root.style.setProperty("--lf-accent-b", accentCss(accentB));
  root.style.setProperty("--lf-accent-c", accentCss(accentC));
  root.style.setProperty(
    "--lf-hero-floor",
    `color-mix(in srgb, ${accentCss(accentC)} 16%, var(--lf-liquid))`,
  );
  root.classList.toggle("lf-ambient-active", active);
}

export function clearAmbientCssVars() {
  const root = document.documentElement;
  root.classList.remove("lf-ambient-active");
  root.style.removeProperty("--lf-hue-a");
  root.style.removeProperty("--lf-hue-b");
  root.style.removeProperty("--lf-hue-c");
  root.style.removeProperty("--lf-accent-a");
  root.style.removeProperty("--lf-accent-b");
  root.style.removeProperty("--lf-accent-c");
  root.style.removeProperty("--lf-hero-floor");
  displayPalette = null;
}
