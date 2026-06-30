import { createContext, useContext, type ReactNode } from "react";
import { useCloudFriendAlerts } from "../hooks/useCloudFriendAlerts";

interface CloudFriendAlertsContextValue {
  pendingCount: number;
  refreshFriendAlerts: () => void;
}

const CloudFriendAlertsContext =
  createContext<CloudFriendAlertsContextValue | null>(null);

export function CloudFriendAlertsProvider({ children }: { children: ReactNode }) {
  const value = useCloudFriendAlerts();
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
