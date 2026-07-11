export type UserPresenceStatus = "online" | "away" | "dnd" | "invisible";

const STORAGE_KEY = "branchefy:presence-status";
const EVENT = "branchefy:presence-status-changed";

export const USER_PRESENCE_OPTIONS: {
  id: UserPresenceStatus;
  label: string;
  hint: string;
}[] = [
  { id: "online", label: "Online", hint: "Visibile e disponibile" },
  { id: "away", label: "Assente", hint: "Mostri che sei lontano" },
  { id: "dnd", label: "Non disturbare", hint: "Niente notifiche social" },
  { id: "invisible", label: "Invisibile", hint: "Appari offline agli altri" },
];

export function readUserPresenceStatus(): UserPresenceStatus {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (
      raw === "online" ||
      raw === "away" ||
      raw === "dnd" ||
      raw === "invisible"
    ) {
      return raw;
    }
  } catch {
    // ignore
  }
  return "online";
}

export function writeUserPresenceStatus(status: UserPresenceStatus): void {
  try {
    localStorage.setItem(STORAGE_KEY, status);
  } catch {
    // ignore
  }
  window.dispatchEvent(
    new CustomEvent<UserPresenceStatus>(EVENT, { detail: status }),
  );
}

export function subscribeUserPresenceStatus(
  listener: (status: UserPresenceStatus) => void,
): () => void {
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) {
      listener(readUserPresenceStatus());
    }
  };
  const onCustom = (event: Event) => {
    listener((event as CustomEvent<UserPresenceStatus>).detail);
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener(EVENT, onCustom);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(EVENT, onCustom);
  };
}

export function userPresenceStatusLabel(status: UserPresenceStatus): string {
  return USER_PRESENCE_OPTIONS.find((opt) => opt.id === status)?.label ?? "Online";
}
