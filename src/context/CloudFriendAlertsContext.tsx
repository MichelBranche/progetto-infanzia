import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useCloudFriendAlerts } from "../hooks/useCloudFriendAlerts";

interface CloudFriendAlertsContextValue {
  pendingCount: number;
  refreshFriendAlerts: () => void;
}

const CloudFriendAlertsContext =
  createContext<CloudFriendAlertsContextValue | null>(null);

export function CloudFriendAlertsProvider({ children }: { children: ReactNode }) {
  const { pendingCount, refreshFriendAlerts } = useCloudFriendAlerts();
  // Il poll a 60s non deve invalidare i consumer se il conteggio non cambia.
  const value = useMemo(
    () => ({ pendingCount, refreshFriendAlerts }),
    [pendingCount, refreshFriendAlerts],
  );
  return (
    <CloudFriendAlertsContext.Provider value={value}>
      {children}
    </CloudFriendAlertsContext.Provider>
  );
}

export function useCloudFriendAlertsContext() {
  const ctx = useContext(CloudFriendAlertsContext);
  if (!ctx) {
    throw new Error(
      "useCloudFriendAlertsContext must be used within CloudFriendAlertsProvider",
    );
  }
  return ctx;
}
