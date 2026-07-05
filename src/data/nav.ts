import type { Profile } from "../types/profile";
import { isParentProfile } from "../types/profile";
import { STREMIO_ADDONS_ENABLED } from "../lib/features";

export type NavIcon =
  | "Home"
  | "Plus"
  | "Library"
  | "Settings"
  | "Activity"
  | "Search"
  | "Film"
  | "Sparkles"
  | "Tv"
  | "Clock"
  | "Wifi"
  | "Users"
  | "Anime"
  | "Manga"
  | "User"
  | "Terminal"
  | "MessageSquare"
  | "Share2";

export interface NavItem {
  id: string;
  label: string;
  icon: NavIcon;
  accent?: boolean;
}

export interface NavSection {
  id: string;
  label?: string;
  items: NavItem[];
}

const primaryItems: NavItem[] = [
  { id: "home", label: "Home", icon: "Home" },
  { id: "anime", label: "Anime", icon: "Anime" },
  { id: "manga", label: "Manga", icon: "Manga" },
  { id: "profile", label: "Profilo", icon: "User" },
  ...(STREMIO_ADDONS_ENABLED
    ? [{ id: "streaming", label: "In streaming", icon: "Wifi" as const }]
    : []),
];

const browseItems: NavItem[] = [
  { id: "film", label: "Film", icon: "Film" },
  { id: "cartoni", label: "Cartoni", icon: "Sparkles" },
  { id: "serie", label: "Serie TV", icon: "Tv" },
  { id: "capsula", label: "Capsula del tempo", icon: "Clock" },
  { id: "search", label: "Cerca", icon: "Search" },
];

function browseSectionItems(): NavItem[] {
  return browseItems;
}

const libraryItems: NavItem[] = [
  { id: "add", label: "Aggiungi titolo", icon: "Plus", accent: true },
];

const systemItems: NavItem[] = [
  { id: "settings", label: "Impostazioni", icon: "Settings" },
  { id: "activity", label: "Attività bambini", icon: "Activity" },
];

const supportItems: NavItem[] = [
  { id: "feedback", label: "Feedback e richieste", icon: "MessageSquare" },
  { id: "invite", label: "Invita amici", icon: "Share2" },
];

function filterItems(items: NavItem[], hasStreaming: boolean) {
  return items.filter((item) => {
    if (item.id === "streaming") return STREMIO_ADDONS_ENABLED && hasStreaming;
    return true;
  });
}

export function getNavSections(
  profile: Profile | null,
  hasStreaming = false,
  devMode = false,
): NavSection[] {
  if (!profile) return [];

  const isParent = isParentProfile(profile);
  const sections: NavSection[] = [
    {
      id: "primary",
      items: filterItems(primaryItems, hasStreaming),
    },
    {
      id: "browse",
      label: "Esplora",
      items: browseSectionItems(),
    },
  ];

  if (isParent) {
    sections.push({
      id: "library",
      label: "Libreria",
      items: libraryItems,
    });
    sections.push({
      id: "system",
      label: "Account",
      items: systemItems,
    });
  }

  sections.push({
    id: "support",
    label: "Supporto",
    items: supportItems,
  });

  if (devMode) {
    sections.push({
      id: "devtools",
      label: "Privata",
      items: [{ id: "dev", label: "Area dev", icon: "Terminal" }],
    });
  }

  return sections.filter((section) => section.items.length > 0);
}

/** @deprecated use getNavSections */
export function getNavItems(
  profile: Profile | null,
  hasStreaming = false,
) {
  return getNavSections(profile, hasStreaming).flatMap(
    (section) => section.items,
  );
}

export const sectionMeta: Record<string, { title: string; subtitle: string }> =
  {
    add: {
      title: "Aggiungi contenuto",
      subtitle: "Importa un nuovo titolo nella libreria",
    },
    manage: {
      title: "Gestisci libreria",
      subtitle: "Modifica ed elimina titoli dalla libreria",
    },
    profile: {
      title: "Profilo",
      subtitle: "Titoli guardati, lista personale e amici",
    },
    mylist: {
      title: "La mia Lista",
      subtitle: "Titoli salvati con + per guardarli dopo",
    },
    friends: {
      title: "Amici",
      subtitle: "Codice amico cloud, LAN e guarda insieme",
    },
    settings: {
      title: "Impostazioni",
      subtitle: "Libreria, abbonamenti e controllo genitori",
    },
    activity: {
      title: "Attività bambini",
      subtitle: "Cosa hanno guardato i profili bambino",
    },
    dev: {
      title: "Area privata dev",
      subtitle: "Utenti cloud, dispositivo locale e feedback utenti",
    },
    feedback: {
      title: "Feedback e richieste",
      subtitle: "Bug, suggerimenti, nuove funzioni e titoli da aggiungere",
    },
    invite: {
      title: "Invita amici",
      subtitle: "Link download o codice amico da condividere",
    },
    search: {
      title: "Cerca",
      subtitle: "Streaming e libreria locale",
    },
    film: { title: "Film", subtitle: "Blockbuster, drammi e grandi storie" },
    anime: {
      title: "Anime",
      subtitle: "Catalogo AnimeSaturn · Sub ITA e ITA",
    },
    manga: {
      title: "Manga",
      subtitle: "Tabloid MangaDex · Novità, popolari e lettura online",
    },
    cartoni: { title: "Cartoni", subtitle: "Animazione, avventure e Loonex" },
    serie: { title: "Serie TV", subtitle: "Stagioni, episodi e binge watching" },
    capsula: {
      title: "Capsula del tempo",
      subtitle: "Classici e tesori rari",
    },
    streaming: {
      title: "In streaming",
      subtitle: STREMIO_ADDONS_ENABLED
        ? "Cataloghi dagli addon Stremio installati"
        : "Catalogo Streaming Community",
    },
  };
