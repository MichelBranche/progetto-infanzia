import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  isAppAccessSetupComplete,
  markAppAccessSetupComplete,
  readAppAccessMode,
  resetAppAccess,
  type AppAccessMode,
} from "../lib/appAccess";
import {
  addGuestUsageSeconds,
  getGuestCooldownRemainingMs,
  getGuestSecondsUsedToday,
  GUEST_DAILY_LIMIT_SECONDS,
  isGuestAccessBlocked,
  isGuestLimitReached,
} from "../lib/guestUsage";
import { useCloudAccount } from "./CloudAccountContext";

interface AppAccessContextValue {
  loading: boolean;
  setupComplete: boolean;
  mode: AppAccessMode | null;
  isGuest: boolean;
  isRegistered: boolean;
  guestSecondsUsed: number;
  guestSecondsRemaining: number;
  guestLimitReached: boolean;
  guestAccessBlocked: boolean;
  guestCooldownRemainingMs: number;
  guestWatching: boolean;
  completeGuestSetup: () => void;
  completeRegisteredSetup: () => void;
  refreshGuestUsage: () => void;
  recordGuestPlayback: (seconds: number) => number;
  setGuestWatching: (watching: boolean) => void;
  syncFromStorage: () => void;
  logoutAccess: () => void;
}

const AppAccessContext = createContext<AppAccessContextValue | null>(null);

export function AppAccessProvider({ children }: { children: ReactNode }) {
  const { user } = useCloudAccount();
  const [loading, setLoading] = useState(true);
  const [setupComplete, setSetupComplete] = useState(isAppAccessSetupComplete);
  const [mode, setMode] = useState<AppAccessMode | null>(readAppAccessMode);
  const [guestSecondsUsed, setGuestSecondsUsed] = useState(
    getGuestSecondsUsedToday,
  );

  const [guestTick, setGuestTick] = useState(0);
  const [guestWatching, setGuestWatching] = useState(false);

  const refreshGuestUsage = useCallback(() => {
    setGuestSecondsUsed(getGuestSecondsUsedToday());
    setGuestTick(Date.now());
  }, []);

  useEffect(() => {
    if (mode !== "guest") return;
    const id = window.setInterval(() => refreshGuestUsage(), 1000);
    return () => window.clearInterval(id);
  }, [mode, refreshGuestUsage]);

  useEffect(() => {
    setSetupComplete(isAppAccessSetupComplete());
    setMode(readAppAccessMode());
    refreshGuestUsage();
    setLoading(false);
  }, [refreshGuestUsage]);

  useEffect(() => {
    if (user) {
      markAppAccessSetupComplete("registered");
      setMode("registered");
      setSetupComplete(true);
    }
  }, [user]);

  const completeGuestSetup = useCallback(() => {
    markAppAccessSetupComplete("guest");
    setMode("guest");
    setSetupComplete(true);
    refreshGuestUsage();
    window.dispatchEvent(new CustomEvent("branchefy:profiles-changed"));
  }, [refreshGuestUsage]);

  const completeRegisteredSetup = useCallback(() => {
    markAppAccessSetupComplete("registered");
    setMode("registered");
    setSetupComplete(true);
    window.dispatchEvent(new CustomEvent("branchefy:profiles-changed"));
  }, []);

  const syncFromStorage = useCallback(() => {
    setSetupComplete(isAppAccessSetupComplete());
    setMode(readAppAccessMode());
    refreshGuestUsage();
  }, [refreshGuestUsage]);

  const logoutAccess = useCallback(() => {
    resetAppAccess();
    setSetupComplete(false);
    setMode(null);
    refreshGuestUsage();
  }, [refreshGuestUsage]);

  const recordGuestPlayback = useCallback(
    (seconds: number) => {
      const used = addGuestUsageSeconds(seconds);
      setGuestSecondsUsed(used);
      return used;
    },
    [],
  );

  const value = useMemo(
    () => ({
      loading,
      setupComplete,
      mode,
      isGuest: setupComplete && mode === "guest",
      isRegistered: setupComplete && mode === "registered",
      guestSecondsUsed,
      guestSecondsRemaining: Math.max(
        0,
        GUEST_DAILY_LIMIT_SECONDS - guestSecondsUsed,
      ),
      guestLimitReached: mode === "guest" && isGuestLimitReached(),
      guestAccessBlocked: mode === "guest" && isGuestAccessBlocked(),
      guestCooldownRemainingMs: getGuestCooldownRemainingMs(),
      guestWatching,
      completeGuestSetup,
      completeRegisteredSetup,
      refreshGuestUsage,
      recordGuestPlayback,
      setGuestWatching,
      syncFromStorage,
      logoutAccess,
    }),
    [
      loading,
      setupComplete,
      mode,
      guestSecondsUsed,
      guestTick,
      guestWatching,
      completeGuestSetup,
      completeRegisteredSetup,
      refreshGuestUsage,
      recordGuestPlayback,
      syncFromStorage,
      logoutAccess,
    ],
  );

  return (
    <AppAccessContext.Provider value={value}>
      {children}
    </AppAccessContext.Provider>
  );
}

export function useAppAccess() {
  const ctx = useContext(AppAccessContext);
  if (!ctx) {
    throw new Error("useAppAccess must be used within AppAccessProvider");
  }
  return ctx;
}

export { GUEST_DAILY_LIMIT_SECONDS };
