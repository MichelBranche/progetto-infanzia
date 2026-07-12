import { useCallback, useState } from "react";
import { pingBackendHealth, usesBackendApi } from "./runtimeInvoke";
import { isTauri } from "@tauri-apps/api/core";

const BOOT_PREPARE_TIMEOUT_MS = 18_000;

export function useDevBackendGate() {
  const [backendOnline, setBackendOnline] = useState<boolean | null>(
    !usesBackendApi() || isTauri() ? true : null,
  );
  const [checking, setChecking] = useState(false);

  const checkBackend = useCallback(async () => {
    if (!usesBackendApi() || isTauri()) {
      setBackendOnline(true);
      return true;
    }
    setChecking(true);
    const ok = await pingBackendHealth(5_000);
    setBackendOnline(ok);
    setChecking(false);
    return ok;
  }, []);

  return { backendOnline, checking, checkBackend };
}

export function withBootTimeout<T>(promise: Promise<T>, ms = BOOT_PREPARE_TIMEOUT_MS): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      window.setTimeout(() => reject(new Error("boot-timeout")), ms);
    }),
  ]);
}
