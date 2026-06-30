import { useCallback, useEffect, useRef, useState } from "react";
import type { Update } from "@tauri-apps/plugin-updater";
import { check } from "@tauri-apps/plugin-updater";
import {
  checkForAppUpdate,
  dismissUpdateVersion,
  downloadAndInstallUpdate,
  fetchAppVersion,
  isUpdaterSupported,
  relaunchApp,
  type UpdaterPhase,
  type UpdaterProgress,
} from "../lib/appUpdater";

interface UseAppUpdaterOptions {
  autoCheck?: boolean;
}

export function useAppUpdater({ autoCheck = true }: UseAppUpdaterOptions = {}) {
  const [phase, setPhase] = useState<UpdaterPhase>("idle");
  const [currentVersion, setCurrentVersion] = useState<string>("");
  const [pendingUpdate, setPendingUpdate] = useState<Update | null>(null);
  const [progress, setProgress] = useState<UpdaterProgress>({
    downloaded: 0,
    total: null,
  });
  const [error, setError] = useState<string | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const checkedRef = useRef(false);

  useEffect(() => {
    void fetchAppVersion().then(setCurrentVersion);
  }, []);

  const runCheck = useCallback(async (manual: boolean) => {
    if (!isUpdaterSupported()) {
      if (manual) {
        setError(null);
        setPhase("up-to-date");
      }
      return;
    }

    setPhase("checking");
    setError(null);
    try {
      const update = manual ? await check() : await checkForAppUpdate();
      if (!update) {
        setPendingUpdate(null);
        setShowPrompt(false);
        setPhase(manual ? "up-to-date" : "idle");
        return;
      }
      setPendingUpdate(update);
      setShowPrompt(!manual);
      setPhase("available");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setPhase("error");
    }
  }, []);

  const checkUpdates = useCallback(
    (manual = false) => runCheck(manual),
    [runCheck],
  );

  useEffect(() => {
    if (!autoCheck || checkedRef.current) return;
    checkedRef.current = true;
    const timer = window.setTimeout(() => {
      void runCheck(false);
    }, 2500);
    return () => window.clearTimeout(timer);
  }, [autoCheck, runCheck]);

  const install = useCallback(async () => {
    if (!pendingUpdate) return;
    setPhase("downloading");
    setError(null);
    setProgress({ downloaded: 0, total: null });
    try {
      await downloadAndInstallUpdate(pendingUpdate, setProgress);
      setPhase("installing");
      await relaunchApp();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setPhase("error");
    }
  }, [pendingUpdate]);

  const dismiss = useCallback(() => {
    if (pendingUpdate) dismissUpdateVersion(pendingUpdate.version);
    setPendingUpdate(null);
    setShowPrompt(false);
    setPhase("idle");
    setError(null);
  }, [pendingUpdate]);

  return {
    phase,
    currentVersion,
    pendingUpdate,
    progress,
    error,
    supported: isUpdaterSupported(),
    showPrompt,
    check: checkUpdates,
    install,
    dismiss,
  };
}
