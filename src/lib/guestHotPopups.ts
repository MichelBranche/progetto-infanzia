export interface GuestHotPopupProfile {
  id: string;
  name: string;
  photoUrl: string;
  distanceKm: number;
  message: string;
}

export type GuestHotPopupEntrySide = "bottom" | "top" | "left" | "right";
export type GuestHotPopupAnchor = "start" | "end";

export interface GuestHotPopupPlacement {
  entrySide: GuestHotPopupEntrySide;
  anchor: GuestHotPopupAnchor;
}

export interface GuestHotPopupActive {
  profile: GuestHotPopupProfile;
  placement: GuestHotPopupPlacement;
}

const ENTRY_SIDES: GuestHotPopupEntrySide[] = ["bottom", "top", "left", "right"];
const ANCHORS: GuestHotPopupAnchor[] = ["start", "end"];

const MESSAGE_TEMPLATES = [
  (name: string, km: string) => `${name} caldo a ${km} da te ti aspetta!`,
  (name: string, km: string) => `${name} è online a ${km} — scrivigli ora!`,
  (name: string, km: string) => `${name} ha visto il tuo profilo a ${km}`,
  (name: string, km: string) => `Nuovo match: ${name} a soli ${km}!`,
  (name: string, km: string) => `${name} vuole chattare · ${km} di distanza`,
] as const;

function formatKm(km: number): string {
  return km < 1 ? `${Math.round(km * 1000)}m` : `${km.toFixed(1).replace(".0", "")}km`;
}

export const GUEST_HOT_POPUP_PROFILES: GuestHotPopupProfile[] = [
  {
    id: "marcolino",
    name: "Marcolino",
    photoUrl: "/guest-hot-popups/01-marcolino.png",
    distanceKm: 2,
    message: "",
  },
  {
    id: "giuseppe",
    name: "Giuseppe",
    photoUrl: "/guest-hot-popups/02-giuseppe.png",
    distanceKm: 1.3,
    message: "",
  },
  {
    id: "tonino",
    name: "Tonino",
    photoUrl: "/guest-hot-popups/03-tonino.png",
    distanceKm: 0.8,
    message: "",
  },
  {
    id: "carmelo",
    name: "Carmelo",
    photoUrl: "/guest-hot-popups/04-carmelo.png",
    distanceKm: 3.4,
    message: "",
  },
  {
    id: "alfredo",
    name: "Alfredo",
    photoUrl: "/guest-hot-popups/05-alfredo.png",
    distanceKm: 1.1,
    message: "",
  },
  {
    id: "pierino",
    name: "Pierino",
    photoUrl: "/guest-hot-popups/06-pierino.png",
    distanceKm: 4.2,
    message: "",
  },
  {
    id: "domenico",
    name: "Domenico",
    photoUrl: "/guest-hot-popups/07-domenico.png",
    distanceKm: 0.6,
    message: "",
  },
  {
    id: "luciano",
    name: "Luciano",
    photoUrl: "/guest-hot-popups/08-luciano.png",
    distanceKm: 2.7,
    message: "",
  },
  {
    id: "salvatore",
    name: "Salvatore",
    photoUrl: "/guest-hot-popups/09-salvatore.png",
    distanceKm: 1.9,
    message: "",
  },
  {
    id: "gianni",
    name: "Gianni",
    photoUrl: "/guest-hot-popups/10-gianni.png",
    distanceKm: 5.1,
    message: "",
  },
].map((profile, index) => {
  const km = formatKm(profile.distanceKm);
  const template = MESSAGE_TEMPLATES[index % MESSAGE_TEMPLATES.length];
  return {
    ...profile,
    message: template(profile.name, km),
  };
});

export const GUEST_HOT_POPUP_MIN_INTERVAL_MS = 30_000;
export const GUEST_HOT_POPUP_MAX_INTERVAL_MS = 60_000;
export const GUEST_HOT_POPUP_INITIAL_DELAY_MS = 12_000;

export function randomGuestHotPopupIntervalMs(): number {
  const span = GUEST_HOT_POPUP_MAX_INTERVAL_MS - GUEST_HOT_POPUP_MIN_INTERVAL_MS;
  return GUEST_HOT_POPUP_MIN_INTERVAL_MS + Math.floor(Math.random() * span);
}

export function randomGuestHotPopupPlacement(): GuestHotPopupPlacement {
  return {
    entrySide: ENTRY_SIDES[Math.floor(Math.random() * ENTRY_SIDES.length)],
    anchor: ANCHORS[Math.floor(Math.random() * ANCHORS.length)],
  };
}

export function nextGuestHotPopupProfile(
  previousId: string | null,
): GuestHotPopupProfile {
  const pool = GUEST_HOT_POPUP_PROFILES;
  if (pool.length <= 1) return pool[0];
  let pick = pool[Math.floor(Math.random() * pool.length)];
  let guard = 0;
  while (pick.id === previousId && guard < 8) {
    pick = pool[Math.floor(Math.random() * pool.length)];
    guard += 1;
  }
  return pick;
}
