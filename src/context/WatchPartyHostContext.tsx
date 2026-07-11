import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { WatchPartySession } from "../types/watchParty";

interface WatchPartyHostContextValue {
  hostSession: WatchPartySession | null;
  setHostSession: (session: WatchPartySession | null) => void;
}

const WatchPartyHostContext = createContext<WatchPartyHostContextValue | null>(
  null,
);

export function WatchPartyHostProvider({ children }: { children: ReactNode }) {
  const [hostSession, setHostSessionState] = useState<WatchPartySession | null>(
    null,
  );

  const setHostSession = useCallback((session: WatchPartySession | null) => {
    if (session?.role === "host") {
      setHostSessionState(session);
      return;
    }
    setHostSessionState(null);
  }, []);

  const value = useMemo(
    () => ({ hostSession, setHostSession }),
    [hostSession, setHostSession],
  );

  return (
    <WatchPartyHostContext.Provider value={value}>
      {children}
    </WatchPartyHostContext.Provider>
  );
}

export function useWatchPartyHost() {
  const ctx = useContext(WatchPartyHostContext);
  if (!ctx) {
    return {
      hostSession: null,
      setHostSession: () => undefined,
    };
  }
  return ctx;
}
