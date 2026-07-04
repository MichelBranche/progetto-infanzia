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
  getGuestSecondsRemaining,
  getGuestSecondsUsedToday,
  GUEST_DAILY_LIMIT_SECONDS,
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
  completeGuestSetup: () => void;
  completeRegisteredSetup: () => void;
  refreshGuestUsage: () => void;
  recordGuestPlayback: (seconds: number) => number;
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

  const refreshGuestUsage = useCallback(() => {
    setGuestSecondsUsed(getGuestSecondsUsedToday());
  }, []);

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
  }, [refreshGuestUsage]);

  const completeRegisteredSetup = useCallback(() => {
    markAppAccessSetupComplete("registered");
    setMode("registered");
    setSetupComplete(true);
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
      guestSecondsRemaining: getGuestSecondsRemaining(),
      guestLimitReached: mode === "guest" && isGuestLimitReached(),
      completeGuestSetup,
      completeRegisteredSetup,
      refreshGuestUsage,
      recordGuestPlayback,
      syncFromStorage,
      logoutAccess,
    }),
    [
      loading,
      setupComplete,
      mode,
      guestSecondsUsed,
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
