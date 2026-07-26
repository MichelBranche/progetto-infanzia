const REMEMBER_KEY = "branchefy-auth-remember";

/** Default: true — stessa UX di oggi (sessione persistente). */
export function readAuthRemember(): boolean {
  try {
    return localStorage.getItem(REMEMBER_KEY) !== "0";
  } catch {
    return true;
  }
}

export function writeAuthRemember(remember: boolean): void {
  try {
    localStorage.setItem(REMEMBER_KEY, remember ? "1" : "0");
  } catch {
    // ignore
  }
}

function isSupabaseAuthKey(key: string): boolean {
  return key.startsWith("sb-") && key.includes("auth-token");
}

function clearAuthKeys(storage: Storage): void {
  const keys: string[] = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (key && isSupabaseAuthKey(key)) keys.push(key);
  }
  for (const key of keys) storage.removeItem(key);
}

/**
 * Imposta la preferenza prima di login/signup e pulisce i token
 * nell'altro storage, così la sessione finisce solo dove serve.
 */
export function prepareAuthRemember(remember: boolean): void {
  writeAuthRemember(remember);
  try {
    if (remember) {
      clearAuthKeys(sessionStorage);
    } else {
      clearAuthKeys(localStorage);
    }
  } catch {
    // ignore
  }
}

/** Storage adapter per Supabase Auth (local vs session). */
export function createAuthStorage(): {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
} {
  return {
    getItem(key) {
      try {
        if (readAuthRemember()) {
          return localStorage.getItem(key) ?? sessionStorage.getItem(key);
        }
        return sessionStorage.getItem(key) ?? localStorage.getItem(key);
      } catch {
        return null;
      }
    },
    setItem(key, value) {
      try {
        if (readAuthRemember()) {
          localStorage.setItem(key, value);
          sessionStorage.removeItem(key);
        } else {
          sessionStorage.setItem(key, value);
          localStorage.removeItem(key);
        }
      } catch {
        // ignore
      }
    },
    removeItem(key) {
      try {
        localStorage.removeItem(key);
        sessionStorage.removeItem(key);
      } catch {
        // ignore
      }
    },
  };
}
