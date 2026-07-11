import { invoke as tauriInvoke, isTauri } from "@tauri-apps/api/core";

export type RuntimeInvokeArgs = Record<string, unknown>;

function webApiBase(): string {
  const configured = import.meta.env.VITE_BRANCHEFY_API_URL?.trim();
  if (configured) return configured.replace(/\/$/, "");
  if (typeof window !== "undefined") return window.location.origin;
  return "";
}

export function isWebShell(): boolean {
  return import.meta.env.VITE_BRANCHEFY_WEB === "1" || !isTauri();
}

/** True when catalog/settings/streaming should hit the Rust backend (Tauri or deployed web). */
export function usesBackendApi(): boolean {
  return isTauri() || import.meta.env.VITE_BRANCHEFY_WEB === "1";
}

export async function runtimeInvoke<T>(
  command: string,
  args?: RuntimeInvokeArgs,
): Promise<T> {
  if (isTauri()) {
    return tauriInvoke<T>(command, args);
  }

  const base = webApiBase();
  const response = await fetch(`${base}/api/invoke`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ command, args: args ?? {} }),
  });

  const payload = (await response.json().catch(() => null)) as
    | { ok?: boolean; data?: T; error?: string }
    | T
    | null;

  if (!response.ok) {
    const message =
      payload &&
      typeof payload === "object" &&
      "error" in payload &&
      typeof payload.error === "string"
        ? payload.error
        : `API ${response.status}`;
    throw new Error(message);
  }

  if (
    payload &&
    typeof payload === "object" &&
    "ok" in payload &&
    payload.ok === true &&
    "data" in payload
  ) {
    return payload.data as T;
  }

  return payload as T;
}
