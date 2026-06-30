import { createContext, useContext, type ReactNode } from "react";
import type { Update } from "@tauri-apps/plugin-updater";
import { useAppUpdater } from "../hooks/useAppUpdater";
import { UpdatePrompt } from "../components/UpdatePrompt";
import type { UpdaterPhase, UpdaterProgress } from "../lib/appUpdater";

interface AppUpdaterContextValue {
  phase: UpdaterPhase;
  currentVersion: string;
  pendingUpdate: Update | null;
  progress: UpdaterProgress;
  error: string | null;
  supported: boolean;
  check: (manual?: boolean) => Promise<void>;
  install: () => Promise<void>;
  dismiss: () => void;
  showPrompt: boolean;
}

const AppUpdaterContext = createContext<AppUpdaterContextValue | null>(null);

export function AppUpdaterProvider({ children }: { children: ReactNode }) {
  const updater = useAppUpdater({ autoCheck: true });

  return (
    <AppUpdaterContext.Provider value={updater}>
      {children}
      <UpdatePrompt
        open={updater.showPrompt && updater.phase === "available" && !!updater.pendingUpdate}
        phase={updater.phase}
        update={updater.pendingUpdate}
        progress={updater.progress}
        error={updater.error}
        onInstall={() => void updater.install()}
        onDismiss={updater.dismiss}
      />
    </AppUpdaterContext.Provider>
  );
}

export function useAppUpdaterContext(): AppUpdaterContextValue {
  const ctx = useContext(AppUpdaterContext);
  if (!ctx) {
    throw new Error("useAppUpdaterContext must be used within AppUpdaterProvider");
  }
  return ctx;
}
