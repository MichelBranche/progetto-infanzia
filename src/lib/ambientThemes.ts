import type { AmbientPalette } from "./imagePalette";
import { DEFAULT_AMBIENT_PALETTE } from "./imagePalette";

export type AmbientThemeId =
  | "violet"
  | "magenta"
  | "ocean"
  | "ember"
  | "forest";

export interface AmbientTheme {
  id: AmbientThemeId;
  label: string;
  description: string;
  preview: string;
  palette: AmbientPalette;
}

export const AMBIENT_THEME_KEY = "branchefy-ambient-theme";

export const AMBIENT_THEMES: AmbientTheme[] = [
  {
    id: "violet",
    label: "Viola",
    description: "Toni profondi viola, default dell'app",
    preview: "linear-gradient(135deg, #581c87, #3b0764, #1e1b4b)",
    palette: DEFAULT_AMBIENT_PALETTE,
  },
  {
    id: "magenta",
    label: "Magenta",
    description: "Aurora LordFlix, rosa e viola intenso",
    preview: "linear-gradient(135deg, #e00091, #7a1fa2, #311050)",
    palette: {
      hues: [310, 285, 275],
      accents: [
        [224, 0, 145],
        [122, 31, 162],
        [49, 16, 80],
      ],
    },
  },
  {
    id: "ocean",
    label: "Oceano",
    description: "Blu profondo e ciano",
    preview: "linear-gradient(135deg, #0369a1, #1e40af, #0c1a3d)",
    palette: {
      hues: [200, 215, 230],
      accents: [
        [14, 116, 144],
        [29, 78, 216],
        [15, 23, 42],
      ],
    },
  },
  {
    id: "ember",
    label: "Fuoco",
    description: "Arancio caldo e rosa corallo",
    preview: "linear-gradient(135deg, #ea580c, #e11d48, #431407)",
    palette: {
      hues: [18, 350, 28],
      accents: [
        [234, 88, 12],
        [190, 24, 93],
        [67, 20, 7],
      ],
    },
  },
  {
    id: "forest",
    label: "Foresta",
    description: "Verde smeraldo e teal",
    preview: "linear-gradient(135deg, #059669, #0d9488, #052e16)",
    palette: {
      hues: [155, 170, 145],
      accents: [
        [5, 150, 105],
        [13, 148, 136],
        [6, 46, 22],
      ],
    },
  },
];

const THEME_BY_ID = Object.fromEntries(
  AMBIENT_THEMES.map((theme) => [theme.id, theme]),
) as Record<AmbientThemeId, AmbientTheme>;

export const DEFAULT_AMBIENT_THEME_ID: AmbientThemeId = "violet";

export function isAmbientThemeId(value: string): value is AmbientThemeId {
  return value in THEME_BY_ID;
}

export function readAmbientThemeId(): AmbientThemeId {
  try {
    const stored = localStorage.getItem(AMBIENT_THEME_KEY);
    if (stored && isAmbientThemeId(stored)) return stored;
  } catch {
    // ignore
  }
  return DEFAULT_AMBIENT_THEME_ID;
}

export function writeAmbientThemeId(id: AmbientThemeId): void {
  try {
    localStorage.setItem(AMBIENT_THEME_KEY, id);
  } catch {
    // ignore
  }
  window.dispatchEvent(new CustomEvent("branchefy:ambient-theme", { detail: id }));
}

export function getAmbientTheme(id: AmbientThemeId = readAmbientThemeId()): AmbientTheme {
  return THEME_BY_ID[id] ?? THEME_BY_ID[DEFAULT_AMBIENT_THEME_ID];
}

export function getUserAmbientPalette(): AmbientPalette {
  return getAmbientTheme().palette;
}
