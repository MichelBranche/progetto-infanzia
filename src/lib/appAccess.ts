export type AppAccessMode = "registered" | "guest";

const MODE_KEY = "branchefy-app-access-mode";
const SETUP_KEY = "branchefy-app-access-setup";

export function readAppAccessMode(): AppAccessMode | null {
  try {
    const value = localStorage.getItem(MODE_KEY);
    if (value === "registered" || value === "guest") return value;
    return null;
  } catch {
    return null;
  }
}

export function writeAppAccessMode(mode: AppAccessMode): void {
  localStorage.setItem(MODE_KEY, mode);
}

export function isAppAccessSetupComplete(): boolean {
  try {
    return localStorage.getItem(SETUP_KEY) === "true";
  } catch {
    return false;
  }
}

export function markAppAccessSetupComplete(mode: AppAccessMode): void {
  writeAppAccessMode(mode);
  localStorage.setItem(SETUP_KEY, "true");
}

export function grandfatherRegisteredAccess(): void {
  if (!isAppAccessSetupComplete()) {
    markAppAccessSetupComplete("registered");
  }
}

const GRANDFATHER_KEY = "branchefy-app-access-grandfathered";

/** Una tantum per installazioni gia' esistenti prima dell'onboarding account. */
export function tryGrandfatherExistingInstall(hasProfiles: boolean): void {
  if (!hasProfiles || isAppAccessSetupComplete()) return;
  try {
    if (localStorage.getItem(GRANDFATHER_KEY) === "true") return;
    markAppAccessSetupComplete("registered");
    localStorage.setItem(GRANDFATHER_KEY, "true");
  } catch {
    // ignore
  }
}

export function resetAppAccess(): void {
  try {
    localStorage.removeItem(SETUP_KEY);
    localStorage.removeItem(MODE_KEY);
  } catch {
    // ignore
  }
}
