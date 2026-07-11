/** Ensures playback URLs are absolute and browser-loadable on the web shell. */
export function normalizePlaybackUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return trimmed;
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
