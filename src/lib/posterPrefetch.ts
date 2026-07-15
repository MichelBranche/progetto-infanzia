const prefetched = new Set<string>();

export function prefetchPosterUrl(url: string | undefined): void {
  if (!url?.trim() || typeof window === "undefined") return;
  const normalized = url.trim();
  if (prefetched.has(normalized)) return;
  prefetched.add(normalized);

  const img = new Image();
  img.decoding = "async";
  img.src = normalized;
}

export function prefetchPosterUrls(urls: Array<string | undefined>): void {
  for (const url of urls) {
    prefetchPosterUrl(url);
  }
}
