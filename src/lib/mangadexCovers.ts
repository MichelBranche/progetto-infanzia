import { isWebShell } from "./runtimeInvoke";
import { scServerBase } from "./scServerFallback";

const UPLOADS_PREFIX = "https://uploads.mangadex.org/covers/";
const TAURI_STREAM_ORIGIN = "http://127.0.0.1:17890";
const PROXY_PATH = "/mangadex-cover/";

function webOrigin(): string {
  if (typeof window === "undefined") return "";
  return window.location.origin.replace(/\/$/, "");
}

/** Path relativo sotto uploads.mangadex.org/covers/… */
export function extractMangaCoverRel(url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith(UPLOADS_PREFIX)) {
    return trimmed.slice(UPLOADS_PREFIX.length).replace(/^\/+/, "");
  }

  const proxyIdx = trimmed.indexOf(PROXY_PATH);
  if (proxyIdx >= 0) {
    return trimmed.slice(proxyIdx + PROXY_PATH.length).replace(/^\/+/, "");
  }

  return null;
}

/**
 * Proxy cover MangaDex: web → same-origin; desktop → stream locale.
 * Stesso schema delle locandine SC (evita blocchi browser/ISP sul CDN).
 */
export function proxifyMangaCoverUrl(
  coverUrl: string | null | undefined,
): string | null {
  if (!coverUrl?.trim()) return null;
  const trimmed = coverUrl.trim();
  const rel = extractMangaCoverRel(trimmed);
  if (!rel) return trimmed;

  if (isWebShell()) {
    const origin = webOrigin();
    return origin ? `${origin}${PROXY_PATH}${rel}` : `${PROXY_PATH}${rel}`;
  }
  return `${TAURI_STREAM_ORIGIN}${PROXY_PATH}${rel}`;
}

/** Miniatura MangaDex: si appende `.256.jpg` al filename completo (es. `uuid.jpg.256.jpg`). */
export function mangaCoverThumbUrl(
  coverUrl: string | null,
  size: 256 | 512 = 256,
): string | null {
  const proxied = proxifyMangaCoverUrl(coverUrl);
  if (!proxied) return null;
  const suffix = `.${size}.jpg`;
  if (proxied.endsWith(suffix)) return proxied;
  return `${proxied}${suffix}`;
}

/** URL da provare in ordine se la cover non carica. */
export function mangaCoverFallbacks(
  coverUrl: string | null | undefined,
  size?: 256 | 512,
): string[] {
  if (!coverUrl?.trim()) return [];

  const out: string[] = [];
  const push = (candidate?: string | null) => {
    if (!candidate || out.includes(candidate)) return;
    out.push(candidate);
  };

  if (size) push(mangaCoverThumbUrl(coverUrl, size));
  push(proxifyMangaCoverUrl(coverUrl));

  const rel = extractMangaCoverRel(coverUrl.trim());
  if (rel) {
    const rail = `${scServerBase().replace(/\/$/, "")}${PROXY_PATH}`;
    if (size) {
      const suffix = `.${size}.jpg`;
      push(rel.endsWith(suffix) ? `${rail}${rel}` : `${rail}${rel}${suffix}`);
    }
    push(`${rail}${rel}`);
    push(`${UPLOADS_PREFIX}${rel}`);
  }

  return out;
}
