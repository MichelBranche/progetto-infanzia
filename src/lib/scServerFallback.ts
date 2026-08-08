//! Fallback StreamingCommunity via server (solo desktop, **opzionale**).
//!
//! Il desktop funziona in locale senza web/Railway. Se l'IP di casa è bloccato
//! da StreamingCommunity (Cloudflare / anti-bot), *quando* il server è online
//! possiamo ripiegare lì. Se il server non c'è, resta solo il percorso locale.

/** Account che forzano sempre il percorso server (diagnostica / IP bloccati noti). */
const FORCE_SERVER_EMAILS = new Set<string>([
  "yutubecraft1234@gmail.com",
  "youtubecraft1234@gmail.com",
]);

/** Server che esegue i comandi SC per conto del desktop. */
const SC_SERVER_BASE = "https://progetto-infanzia-production.up.railway.app";

/** Comandi che colpiscono StreamingCommunity in diretta. */
export const SC_COMMANDS = new Set<string>([
  "fetch_sc_catalog_cmd",
  "refresh_sc_catalog_cmd",
  "fetch_sc_meta_cmd",
  "fetch_sc_season_episodes_cmd",
  "resolve_sc_stream_cmd",
  "resolve_sc_preview_cmd",
  "search_sc_catalog_cmd",
  "search_sc_catalog_page_cmd",
]);

let currentEmail: string | null = null;

/** Aggiornato dal CloudAccountContext a ogni login/logout. */
export function setScFallbackEmail(email: string | null): void {
  currentEmail = email?.trim().toLowerCase() || null;
}

/** True se il comando SC deve andare subito al server (senza tentativo locale). */
export function shouldForceScToServer(command: string): boolean {
  return (
    currentEmail !== null &&
    FORCE_SERVER_EMAILS.has(currentEmail) &&
    SC_COMMANDS.has(command)
  );
}

/** @deprecated Prefer shouldForceScToServer */
export function shouldRouteScToServer(command: string): boolean {
  return shouldForceScToServer(command);
}

export function scServerBase(): string {
  return SC_SERVER_BASE;
}

/** Errori tipici quando SC non è raggiungibile dall'IP locale. */
export function isScUnreachableError(error: unknown): boolean {
  const msg = (
    error instanceof Error ? error.message : String(error ?? "")
  ).toLowerCase();
  if (!msg.trim()) return false;

  // Titolo «Prossimamente»: non è un outage di rete, non ritentare via Railway.
  if (msg.includes("prossimamente")) return false;

  if (msg.includes("nessun server catalogo")) return true;
  if (msg.includes("nessun mirror streaming community")) return true;
  if (msg.includes("catalogo non disponibile")) return true;
  if (msg.includes("token csrf")) return true;
  if (msg.includes("cloudflare")) return true;
  if (msg.includes("slider del catalogo non disponibili")) return true;
  if (msg.includes("riproduzione temporaneamente non disponibile")) return true;
  if (/\b403\b/.test(msg) || /\b429\b/.test(msg) || /\b502\b/.test(msg) || /\b503\b/.test(msg)) {
    return true;
  }
  if (msg.includes("forbidden") || msg.includes("too many requests")) return true;
  if (msg.includes("timed out") || msg.includes("timeout")) return true;
  if (msg.includes("error sending request")) return true;
  if (msg.includes("connection reset") || msg.includes("connection refused")) return true;
  if (msg.includes("dns error") || msg.includes("name resolution")) return true;
  if (
    msg.includes("streaming community") &&
    (msg.includes("raggiungibil") || msg.includes("non disponibile"))
  ) {
    return true;
  }
  return false;
}
