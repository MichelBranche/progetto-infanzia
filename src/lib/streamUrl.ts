/** Ensures playback URLs are absolute and browser-loadable on the web shell. */
export function normalizePlaybackUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return trimmed;

  // Dev browser: le dirette HLS non devono passare da Vite (:5173) — timeout e
  // rewrite pesanti → levelParsingError. Preferisci l'API locale (:8787).
  try {
    if (typeof window !== "undefined" && /^https?:\/\//i.test(trimmed)) {
      const parsed = new URL(trimmed);
      const isLocalVite =
        (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1") &&
        parsed.port === "5173";
      if (
        isLocalVite &&
        (parsed.pathname.startsWith("/remote/") ||
          parsed.pathname.startsWith("/stream/") ||
          parsed.pathname.startsWith("/torrent/"))
      ) {
        parsed.protocol = "http:";
        parsed.hostname = "127.0.0.1";
        parsed.port = "8787";
        return parsed.toString();
      }
    }
  } catch {
    // ignore
  }

  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (
    trimmed.includes("/remote/") ||
    trimmed.includes("/stream/") ||
    trimmed.includes("/torrent/")
  ) {
    return `https://${trimmed.replace(/^\/+/, "")}`;
  }
  return trimmed;
}
