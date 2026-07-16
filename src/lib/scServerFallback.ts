//! Fallback StreamingCommunity via server (solo desktop, solo account autorizzato).
//!
//! Un account il cui IP di casa è stato bloccato da StreamingCommunity non
//! riesce a cercare/risolvere gli stream in diretta dal desktop. Per QUESTO
//! account soltanto, i comandi SC vengono inoltrati al nostro server Railway
//! (lo stesso che serve la web app), così le richieste escono dall'IP del
//! server e non da quello di casa. Per tutti gli altri utenti non cambia nulla.

/** Account autorizzato al fallback (confronto case-insensitive). */
const ALLOWED_EMAILS = new Set<string>(["youtubecraft1234@gmail.com"]);

/** Server che esegue i comandi SC per conto del desktop autorizzato. */
const SC_SERVER_BASE = "https://progetto-infanzia-production.up.railway.app";

/** Comandi che colpiscono StreamingCommunity in diretta. */
const SC_COMMANDS = new Set<string>([
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

/** True se il comando SC va inoltrato al server per l'account corrente. */
export function shouldRouteScToServer(command: string): boolean {
  return (
    currentEmail !== null &&
    ALLOWED_EMAILS.has(currentEmail) &&
    SC_COMMANDS.has(command)
  );
}

export function scServerBase(): string {
  return SC_SERVER_BASE;
}
