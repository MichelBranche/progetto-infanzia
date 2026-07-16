//! Sincronizzazione URL ↔ vista per la web app (deep link condivisibili).
//!
//! L'app naviga a stato interno (nessun router). Qui traduciamo lo stato
//! "sezione + titolo aperto" da/verso il path del browser, così l'URL riflette
//! il contenuto (`/titolo/nome-film`), il tasto Indietro funziona e un link
//! incollato a freddo apre il contenuto giusto. Attivo solo nella web app.

import type { AddonWatchTarget } from "./streamingBrowse";

/** Sezioni la cui apertura si riflette nell'URL (path = id, tranne home = "/"). */
const SYNCED_SECTIONS = new Set<string>([
  "home",
  "film",
  "serie",
  "cartoni",
  "anime",
  "manga",
  "libri",
  "streaming",
  "capsula",
  "profile",
  "chats",
  "feedback",
  "invite",
  "settings",
  "activity",
  "dev",
]);

const TITLE_PREFIX = "titolo";

export interface UrlNavState {
  activeNav: string;
  title: AddonWatchTarget | null;
}

/** Path canonico per lo stato corrente, oppure `null` se la vista non va sincronizzata. */
export function pathForNav(
  activeNav: string,
  title: AddonWatchTarget | null,
): string | null {
  if (title) {
    const segments = [
      title.catalogPrefix ?? "sc",
      title.contentType,
      title.metaId,
      title.slug ?? "",
    ]
      .map((part) => encodeURIComponent(String(part)))
      .join("/");
    return `/${TITLE_PREFIX}/${segments}`;
  }
  if (!SYNCED_SECTIONS.has(activeNav)) return null;
  return activeNav === "home" ? "/" : `/${encodeURIComponent(activeNav)}`;
}

/** Interpreta il path del browser. `null` = path non gestito (lascia com'è). */
export function parseLocationPath(pathname: string): UrlNavState | null {
  const parts = pathname
    .replace(/^\/+|\/+$/g, "")
    .split("/")
    .filter(Boolean)
    .map((part) => {
      try {
        return decodeURIComponent(part);
      } catch {
        return part;
      }
    });

  if (parts.length === 0) return { activeNav: "home", title: null };

  if (parts[0] === TITLE_PREFIX) {
    // /titolo/<catalogPrefix>/<contentType>/<metaId>/<slug?>
    const catalogPrefix = parts[1] || "sc";
    const contentType = parts[2] || "";
    const metaId = parts[3] || "";
    const slug = parts[4] || undefined;
    if (!contentType || !metaId) return null;
    return {
      activeNav: "home",
      title: { contentType, metaId, slug, catalogPrefix },
    };
  }

  if (SYNCED_SECTIONS.has(parts[0])) {
    return { activeNav: parts[0], title: null };
  }
  return null;
}
