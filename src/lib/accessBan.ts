import { getSupabase } from "./supabaseClient";
import { APP_WEB_URL } from "./platformPromo";
import { IS_TAURI_SHELL } from "./tauriShell";

export type AccessBanKind = "user" | "ip";

export interface AccessBanInfo {
  blocked: boolean;
  kind?: AccessBanKind;
  reason?: string | null;
  expiresAt?: string | null;
}

export class AccessBannedError extends Error {
  readonly info: AccessBanInfo;

  constructor(info: AccessBanInfo) {
    super(info.reason?.trim() || "Accesso sospeso");
    this.name = "AccessBannedError";
    this.info = info;
  }
}

const STORAGE_KEY = "branchefy.access-ban";

let cachedBan: AccessBanInfo | null = null;

function accessIpEndpoint(): string {
  if (IS_TAURI_SHELL) {
    return `${APP_WEB_URL.replace(/\/$/, "")}/api/access-ip`;
  }
  if (typeof window !== "undefined") {
    return `${window.location.origin}/api/access-ip`;
  }
  return `${APP_WEB_URL.replace(/\/$/, "")}/api/access-ip`;
}

function mapApiPayload(payload: Record<string, unknown>): AccessBanInfo {
  return {
    blocked: Boolean(payload.blocked),
    kind:
      payload.kind === "user" || payload.kind === "ip"
        ? payload.kind
        : undefined,
    reason:
      typeof payload.reason === "string"
        ? payload.reason
        : payload.reason === null
          ? null
          : undefined,
    expiresAt:
      typeof payload.expiresAt === "string"
        ? payload.expiresAt
        : typeof payload.expires_at === "string"
          ? payload.expires_at
          : null,
  };
}

export function readCachedAccessBan(): AccessBanInfo | null {
  if (cachedBan) return cachedBan;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AccessBanInfo;
    cachedBan = parsed;
    return parsed;
  } catch {
    return null;
  }
}

export function persistAccessBan(info: AccessBanInfo | null) {
  cachedBan = info;
  try {
    if (!info?.blocked) {
      sessionStorage.removeItem(STORAGE_KEY);
      return;
    }
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(info));
  } catch {
    // ignore
  }
  window.dispatchEvent(
    new CustomEvent("branchefy:access-ban-changed", { detail: info }),
  );
}

export function clearAccessBanCache() {
  persistAccessBan(null);
}

/** Guest / rete: GET senza auth. Fail-open se API assente o errore rete. */
export async function checkGuestNetworkBan(): Promise<AccessBanInfo> {
  try {
    const res = await fetch(accessIpEndpoint(), {
      method: "GET",
      headers: { Accept: "application/json" },
    });
    const payload = (await res.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    if (!res.ok && res.status === 503) {
      return { blocked: false };
    }
    const info = mapApiPayload(payload);
    if (info.blocked) persistAccessBan(info);
    return info;
  } catch {
    return { blocked: false };
  }
}

/** Account: RPC locale (sempre) + POST IP (se disponibile). */
export async function checkAuthenticatedAccessBan(): Promise<AccessBanInfo> {
  const supabase = getSupabase();
  let rpcBan: AccessBanInfo = { blocked: false };

  if (supabase) {
    try {
      const { data, error } = await supabase.rpc("get_access_block_status");
      if (!error && data && typeof data === "object") {
        const row = data as Record<string, unknown>;
        rpcBan = {
          blocked: Boolean(row.blocked),
          kind: row.blocked ? "user" : undefined,
          reason: typeof row.reason === "string" ? row.reason : null,
          expiresAt:
            typeof row.expires_at === "string" ? row.expires_at : null,
        };
      }
    } catch {
      // ignore
    }
  }

  if (rpcBan.blocked) {
    persistAccessBan(rpcBan);
    return rpcBan;
  }

  if (!supabase) return { blocked: false };

  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) return { blocked: false };

    const res = await fetch(accessIpEndpoint(), {
      method: "POST",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
    });
    const payload = (await res.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    if (!res.ok && (res.status === 503 || res.status === 401)) {
      return { blocked: false };
    }
    const info = mapApiPayload(payload);
    if (info.blocked) persistAccessBan(info);
    return info;
  } catch {
    return { blocked: false };
  }
}

/** Heartbeat throttled: registra IP senza bloccare la UI. */
let lastReportAt = 0;
const REPORT_MIN_MS = 60_000;

export async function reportAccessIpHeartbeat(): Promise<AccessBanInfo | null> {
  const now = Date.now();
  if (now - lastReportAt < REPORT_MIN_MS) return null;
  lastReportAt = now;
  return checkAuthenticatedAccessBan();
}

export function formatBanExpiry(expiresAt?: string | null): string | null {
  if (!expiresAt) return null;
  const ts = Date.parse(expiresAt);
  if (Number.isNaN(ts)) return null;
  try {
    return new Intl.DateTimeFormat("it-IT", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(ts));
  } catch {
    return expiresAt;
  }
}
