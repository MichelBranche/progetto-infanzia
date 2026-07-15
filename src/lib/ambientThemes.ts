import type { AmbientPalette } from "./imagePalette";
import {
  gradientPreviewFromHex,
  paletteFromHex,
  paletteFromHuesPublic,
  normalizeHexColor,
} from "./imagePalette";

export type AmbientThemeId =
  | "violet"
  | "magenta"
  | "ocean"
  | "ember"
  | "forest"
  | "gold"
  | "sunset"
  | "midnight"
  | "cherry"
  | "lavender"
  | "mint"
  | "ice"
  | "neon"
  | "wine"
  | "sand"
  | "coral"
  | "sky"
  | "lime"
  | "plum"
  | "steel"
  | "peach"
  | "boreal"
  | "ruby"
  | "sapphire"
  | "copper"
  | "rose"
  | "honey"
  | "grape"
  | "custom";

export interface AmbientTheme {
  id: AmbientThemeId;
  label: string;
  description: string;
  preview: string;
  palette: AmbientPalette;
}

export const AMBIENT_THEME_KEY = "branchefy-ambient-theme";
export const AMBIENT_CUSTOM_COLOR_KEY = "branchefy-ambient-custom-color";
export const DEFAULT_CUSTOM_AMBIENT_COLOR = "#7c3aed";

function preset(
  id: AmbientThemeId,
  label: string,
  description: string,
  hues: [number, number, number],
  colors: [string, string, string],
): AmbientTheme {
  return {
    id,
    label,
    description,
    preview: `linear-gradient(135deg, ${colors[0]}, ${colors[1]}, ${colors[2]})`,
    palette: paletteFromHuesPublic(hues),
  };
}

export const AMBIENT_THEMES: AmbientTheme[] = [
  preset("violet", "Viola", "Toni profondi viola, default dell'app", [275, 285, 262], [
    "#581c87",
    "#3b0764",
    "#1e1b4b",
  ]),
  preset("magenta", "Magenta", "Aurora LordFlix, rosa e viola intenso", [310, 285, 275], [
    "#e00091",
    "#7a1fa2",
    "#311050",
  ]),
  preset("ocean", "Oceano", "Blu profondo e ciano", [200, 215, 230], [
    "#0369a1",
    "#1e40af",
    "#0c1a3d",
  ]),
  preset("ember", "Fuoco", "Arancio caldo e rosa corallo", [18, 350, 28], [
    "#ea580c",
    "#e11d48",
    "#431407",
  ]),
  preset("forest", "Foresta", "Verde smeraldo e teal", [155, 170, 145], [
    "#059669",
    "#0d9488",
    "#052e16",
  ]),
  preset("gold", "Oro", "Ambra dorata e miele", [42, 32, 22], [
    "#f59e0b",
    "#d97706",
    "#78350f",
  ]),
  preset("sunset", "Tramonto", "Arancio, rosa e viola al calar del sole", [12, 340, 285], [
    "#fb923c",
    "#f43f5e",
    "#7e22ce",
  ]),
  preset("midnight", "Notte", "Blu notte e indaco profondo", [228, 245, 260], [
    "#1e3a8a",
    "#312e81",
    "#0f172a",
  ]),
  preset("cherry", "Ciliegia", "Rosso intenso e rubino scuro", [355, 8, 340], [
    "#dc2626",
    "#be123c",
    "#4c0519",
  ]),
  preset("lavender", "Lavanda", "Viola chiaro e lilla soffice", [265, 280, 250], [
    "#a78bfa",
    "#8b5cf6",
    "#4c1d95",
  ]),
  preset("mint", "Menta", "Verde menta fresco e acqua", [165, 175, 150], [
    "#34d399",
    "#14b8a6",
    "#064e3b",
  ]),
  preset("ice", "Ghiaccio", "Ciano ghiacciato e blu polare", [190, 205, 220], [
    "#67e8f9",
    "#38bdf8",
    "#0c4a6e",
  ]),
  preset("neon", "Neon", "Verde elettrico e ciano acceso", [145, 165, 185], [
    "#22c55e",
    "#06b6d4",
    "#134e4a",
  ]),
  preset("wine", "Vino", "Bordeaux e prugna elegante", [345, 330, 315], [
    "#9f1239",
    "#881337",
    "#3b0518",
  ]),
  preset("sand", "Sabbia", "Beige caldo e terracotta chiara", [35, 28, 18], [
    "#fbbf24",
    "#f97316",
    "#92400e",
  ]),
  preset("coral", "Corallo", "Pesca e salmone luminoso", [8, 20, 350], [
    "#fb7185",
    "#f97316",
    "#9f1239",
  ]),
  preset("sky", "Cielo", "Azzurro sereno e nuvola chiara", [205, 215, 195], [
    "#38bdf8",
    "#60a5fa",
    "#1e3a8a",
  ]),
  preset("lime", "Lime", "Verde lime brillante e giallo", [95, 80, 65], [
    "#84cc16",
    "#65a30d",
    "#365314",
  ]),
  preset("plum", "Prugna", "Viola scuro e melanzana", [290, 305, 275], [
    "#7e22ce",
    "#6b21a8",
    "#3b0764",
  ]),
  preset("steel", "Acciaio", "Grigio blu e grafite freddo", [215, 225, 235], [
    "#64748b",
    "#475569",
    "#0f172a",
  ]),
  preset("peach", "Pesca", "Pesca delicata e albicocca", [22, 35, 10], [
    "#fdba74",
    "#fb923c",
    "#9a3412",
  ]),
  preset("boreal", "Boreale", "Verde aurora e teal notturno", [140, 175, 255], [
    "#10b981",
    "#0d9488",
    "#4338ca",
  ]),
  preset("ruby", "Rubino", "Rosso gioiello e magenta profondo", [350, 330, 310], [
    "#e11d48",
    "#be185d",
    "#500724",
  ]),
  preset("sapphire", "Zaffiro", "Blu reale e cobalto", [220, 235, 250], [
    "#2563eb",
    "#1d4ed8",
    "#172554",
  ]),
  preset("copper", "Rame", "Rame brunito e bronzo", [25, 18, 8], [
    "#ea580c",
    "#c2410c",
    "#7c2d12",
  ]),
  preset("rose", "Rosa", "Rosa polveroso e confetto", [330, 345, 310], [
    "#f472b6",
    "#ec4899",
    "#831843",
  ]),
  preset("honey", "Miele", "Giallo miele e ambra chiara", [48, 38, 28], [
    "#facc15",
    "#f59e0b",
    "#a16207",
  ]),
  preset("grape", "Uva", "Viola uva e blu notturno", [268, 252, 280], [
    "#9333ea",
    "#7c3aed",
    "#1e1b4b",
  ]),
];

const THEME_BY_ID = Object.fromEntries(
  AMBIENT_THEMES.map((theme) => [theme.id, theme]),
) as Record<Exclude<AmbientThemeId, "custom">, AmbientTheme>;

export const DEFAULT_AMBIENT_THEME_ID = "violet" satisfies Exclude<
  AmbientThemeId,
  "custom"
>;

export function isAmbientThemeId(value: string): value is AmbientThemeId {
  return value === "custom" || value in THEME_BY_ID;
}

export function readCustomAmbientColor(): string {
  try {
    const stored = localStorage.getItem(AMBIENT_CUSTOM_COLOR_KEY);
    if (stored) return normalizeHexColor(stored);
  } catch {
    // ignore
  }
  return DEFAULT_CUSTOM_AMBIENT_COLOR;
}

export function writeCustomAmbientColor(hex: string): string {
  const normalized = normalizeHexColor(hex);
  try {
    localStorage.setItem(AMBIENT_CUSTOM_COLOR_KEY, normalized);
  } catch {
    // ignore
  }
  return normalized;
}

export function buildCustomAmbientTheme(hex = readCustomAmbientColor()): AmbientTheme {
  const normalized = normalizeHexColor(hex);
  return {
    id: "custom",
    label: "Personalizzato",
    description: "Scegli il tuo colore",
    preview: gradientPreviewFromHex(normalized),
    palette: paletteFromHex(normalized),
  };
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
  if (id === "custom") return buildCustomAmbientTheme();
  const presetId = id as Exclude<AmbientThemeId, "custom">;
  return THEME_BY_ID[presetId] ?? THEME_BY_ID[DEFAULT_AMBIENT_THEME_ID];
}

export function getUserAmbientPalette(): AmbientPalette {
  return getAmbientTheme().palette;
}
