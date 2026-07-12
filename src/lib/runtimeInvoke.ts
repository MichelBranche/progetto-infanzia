import { invoke as tauriInvoke, isTauri } from "@tauri-apps/api/core";

export type RuntimeInvokeArgs = Record<string, unknown>;

const DEFAULT_TIMEOUT_MS = 12_000;

export class RuntimeInvokeError extends Error {
  readonly timedOut: boolean;
  readonly offline: boolean;

  constructor(message: string, options?: { timedOut?: boolean; offline?: boolean }) {
    super(message);
    this.name = "RuntimeInvokeError";
    this.timedOut = options?.timedOut ?? false;
    this.offline = options?.offline ?? false;
  }
}

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

function isNetworkFailure(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const msg = error.message.toLowerCase();
  return (
    msg.includes("failed to fetch") ||
    msg.includes("networkerror") ||
    msg.includes("load failed") ||
    msg.includes("connection") ||
    msg.includes("timed out")
  );
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new RuntimeInvokeError(
        `API non raggiungibile (timeout ${Math.round(timeoutMs / 1000)}s). Avvia il backend con npm run dev:browser.`,
        { timedOut: true, offline: true },
      );
    }
    if (isNetworkFailure(error)) {
      throw new RuntimeInvokeError(
        "API non raggiungibile. Avvia il backend con npm run dev:browser.",
        { offline: true },
      );
    }
    throw error;
  } finally {
    window.clearTimeout(timer);
  }
}

/** Ping /health (solo web dev/prod con proxy). */
export async function pingBackendHealth(timeoutMs = 4_000): Promise<boolean> {
  if (!usesBackendApi() || isTauri()) return true;
  try {
    const response = await fetchWithTimeout(
      `${webApiBase()}/health`,
      { method: "GET" },
      timeoutMs,
    );
    return response.ok;
  } catch {
    return false;
  }
}

export async function runtimeInvoke<T>(
  command: string,
  args?: RuntimeInvokeArgs,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<T> {
  if (isTauri()) {
    return tauriInvoke<T>(command, args);
  }

  const base = webApiBase();
  const response = await fetchWithTimeout(
    `${base}/api/invoke`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ command, args: args ?? {} }),
    },
    timeoutMs,
  );

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
    throw new RuntimeInvokeError(message);
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
