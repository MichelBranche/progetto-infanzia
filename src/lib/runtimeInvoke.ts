import { invoke as tauriInvoke, isTauri } from "@tauri-apps/api/core";
import {
  SC_COMMANDS,
  isScUnreachableError,
  scServerBase,
  shouldForceScToServer,
} from "./scServerFallback";

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

async function postInvoke<T>(
  base: string,
  command: string,
  args: RuntimeInvokeArgs | undefined,
  timeoutMs: number,
): Promise<T> {
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

/**
 * Desktop = invoke nativo Tauri (sempre sufficiente).
 * Il server web/Railway è solo un fallback opzionale se SC blocca l'IP di casa:
 * se il server non c'è, il desktop continua con l'errore locale (non si spegne).
 */
export async function runtimeInvoke<T>(
  command: string,
  args?: RuntimeInvokeArgs,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<T> {
  if (isTauri()) {
    const local = () => tauriInvoke<T>(command, args);
    const serverOptional = async (): Promise<T | null> => {
      try {
        return await postInvoke<T>(scServerBase(), command, args, timeoutMs);
      } catch {
        return null;
      }
    };

    // Allowlist diagnostica: prova server, ma se è down torna al locale.
    if (shouldForceScToServer(command)) {
      const fromServer = await serverOptional();
      if (fromServer !== null) return fromServer;
      return local();
    }

    try {
      return await local();
    } catch (error) {
      if (SC_COMMANDS.has(command) && isScUnreachableError(error)) {
        const fromServer = await serverOptional();
        if (fromServer !== null) return fromServer;
      }
      throw error;
    }
  }

  return postInvoke<T>(webApiBase(), command, args, timeoutMs);
}
