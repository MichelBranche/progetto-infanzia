import {
  fetchLoonexMeta,
  fetchSaturnMeta,
  fetchScMeta,
  fetchYoutubeMeta,
} from "./addonsApi";
import { posterUrlFor } from "../components/PosterImage";
import {
  heroUrlQualityScore,
  maximizeHeroUrl,
  maximizePosterUrl,
  pickBestHeroUrl,
  pickBestLogoUrl,
} from "./posterUrl";
import type { MediaItem } from "../types/media";
import type { StremioMetaPreview } from "../types/stremio";
import { isStreamingMediaId, parseStreamingMediaId } from "./streamingBrowse";

const heroImageCache = new Map<string, string>();
const heroLogoCache = new Map<string, string>();
const HERO_IMAGE_QUALITY_OK = 82;

function cacheHeroLogo(id: string, url: string | undefined): string | undefined {
  const maximized = pickBestLogoUrl(url);
  if (!maximized) return undefined;
  heroLogoCache.set(id, maximized);
  return maximized;
}

export function isHeroEligiblePreview(preview: StremioMetaPreview): boolean {
  const prefix = preview.catalogPrefix?.toLowerCase() ?? "";
  if (prefix === "mangadex" || prefix === "manga") return false;
  const type = preview.type?.toLowerCase() ?? "";
  if (type === "manga") return false;
  const context = `${preview.sourceRowKey ?? ""} ${preview.sourceRowTitle ?? ""}`.toLowerCase();
  if (context.includes("manga")) return false;
  return Boolean(preview.poster || preview.background);
}

/** Hero home: solo Streaming Community con logo PNG ufficiale. */
export function isScHeroWithLogo(preview: StremioMetaPreview): boolean {
  const prefix = preview.catalogPrefix?.toLowerCase() ?? "";
  if (prefix !== "sc") return false;
  if (!preview.logo?.trim()) return false;
  return Boolean(preview.background || preview.poster);
}

export function isHeroEligibleLocalItem(item: MediaItem): boolean {
  const type = item.mediaType?.toLowerCase() ?? "";
  return type !== "manga";
}

export function isHeroPriorityPreview(preview: StremioMetaPreview): boolean {
  return isScHeroWithLogo(preview);
}

export function isHeroPriorityLocalItem(item: MediaItem): boolean {
  if (!isHeroEligibleLocalItem(item)) return false;
  const type = item.mediaType?.toLowerCase() ?? "";
  return type === "film" || type === "serie";
}

export function filterHeroPreviews(
  previews: StremioMetaPreview[],
): StremioMetaPreview[] {
  return previews.filter(isScHeroWithLogo);
}

export function mergePreviewForHero(
  preview: StremioMetaPreview,
  catalogIndex: StremioMetaPreview[],
): StremioMetaPreview {
  const match = catalogIndex.find(
    (entry) => entry.type === preview.type && entry.id === preview.id,
  );
  if (!match) return preview;
  return {
    ...preview,
    background: pickBestHeroUrl(preview.background, match.background) ?? preview.background ?? match.background,
    poster: maximizePosterUrl(preview.poster ?? match.poster),
    logo: pickBestLogoUrl(preview.logo, match.logo) ?? preview.logo ?? match.logo,
    description: preview.description ?? match.description,
  };
}

export function buildHeroStreamingPreviews(
  streamingPreviews: StremioMetaPreview[],
  catalogIndex: StremioMetaPreview[],
  streamingRows: { items: StremioMetaPreview[] }[],
): StremioMetaPreview[] {
  const byKey = new Map<string, StremioMetaPreview>();

  const merge = (preview: StremioMetaPreview) => {
    const key = `${preview.type}:${preview.id}`;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, preview);
      return;
    }
    byKey.set(key, {
      ...existing,
      ...preview,
      background: preview.background ?? existing.background,
      poster: preview.poster ?? existing.poster,
      logo: preview.logo ?? existing.logo,
      description: preview.description ?? existing.description,
      name: preview.name || existing.name,
    });
  };

  for (const preview of catalogIndex) merge(preview);
  for (const row of streamingRows) {
    for (const item of row.items) merge(item);
  }
  for (const preview of streamingPreviews) merge(preview);

  const merged = [...byKey.values()].filter((preview) => {
    const prefix = preview.catalogPrefix?.toLowerCase() ?? "sc";
    if (prefix !== "sc") return false;
    return isHeroEligiblePreview(preview);
  });

  const withLogo = merged.filter(isScHeroWithLogo);
  if (withLogo.length >= 4) return withLogo;

  if (merged.length > 0) {
    const logoKeys = new Set(withLogo.map((p) => `${p.type}:${p.id}`));
    const rest = merged.filter((p) => !logoKeys.has(`${p.type}:${p.id}`));
    return [...withLogo, ...rest].slice(0, 48);
  }

  if (streamingPreviews.length > 0) {
    return streamingPreviews.filter(
      (preview) =>
        (preview.catalogPrefix?.toLowerCase() ?? "sc") === "sc" &&
        isHeroEligiblePreview(preview),
    );
  }

  const fallback: StremioMetaPreview[] = [];
  const seen = new Set<string>();
  for (const row of streamingRows) {
    for (const item of row.items) {
      const key = `${item.type}:${item.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (
        (item.catalogPrefix?.toLowerCase() ?? "sc") === "sc" &&
        isHeroEligiblePreview(item)
      ) {
        fallback.push(item);
      }
    }
  }
  return fallback;
}

/**
 * Hero anime: primi item (con poster) delle righe curate AnimeSaturn.
 * I preview saturn non hanno background/logo: l'hero mostra il titolo testuale
 * finche' l'arricchimento lazy non recupera un background.
 */
export function buildAnimeHeroPreviews(
  rows: { items: StremioMetaPreview[] }[],
  limit = 8,
): StremioMetaPreview[] {
  const seen = new Set<string>();
  const out: StremioMetaPreview[] = [];
  for (const row of rows) {
    for (const item of row.items) {
      if ((item.catalogPrefix?.toLowerCase() ?? "") !== "saturn") continue;
      if (!item.poster) continue;
      const key = `${item.type}:${item.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(item);
      if (out.length >= limit) return out;
    }
  }
  return out;
}

/** Arricchisce i primi hero anime con background/descrizione via fetchSaturnMeta. */
export async function enrichAnimeHeroPreviews(
  previews: StremioMetaPreview[],
  limit = 6,
): Promise<StremioMetaPreview[]> {
  const head = await Promise.all(
    previews.slice(0, limit).map(async (preview) => {
      if (preview.background) return preview;
      const slug = preview.slug ?? preview.id;
      if (!slug) return preview;
      try {
        const meta = await fetchSaturnMeta(slug);
        return {
          ...preview,
          background:
            pickBestHeroUrl(meta.background, preview.background, preview.poster) ??
            preview.background,
          poster: maximizePosterUrl(preview.poster ?? meta.poster),
          description: preview.description ?? meta.description,
        };
      } catch {
        return preview;
      }
    }),
  );
  return [...head, ...previews.slice(limit)];
}

function cacheHeroImage(id: string, url: string | undefined): string | undefined {
  const maximized = pickBestHeroUrl(url);
  if (!maximized || heroUrlQualityScore(maximized) <= 0) return undefined;
  heroImageCache.set(id, maximized);
  return maximized;
}

export function needsHeroImageUpgrade(item: MediaItem): boolean {
  if (!isStreamingMediaId(item.id)) return false;
  const cached = heroImageCache.get(item.id);
  if (cached && heroUrlQualityScore(cached) >= HERO_IMAGE_QUALITY_OK) return false;

  const target = parseStreamingMediaId(item.id);
  if (target?.catalogPrefix === "sc") return true;

  const heroUrl = maximizeHeroUrl(posterUrlFor(item, "hero"));
  if (!heroUrl) return true;
  return heroUrlQualityScore(heroUrl) < HERO_IMAGE_QUALITY_OK;
}

export async function resolveHeroImageUrl(
  item: MediaItem,
): Promise<string | undefined> {
  const target = parseStreamingMediaId(item.id);
  const isSc = target?.catalogPrefix === "sc";
  const cached = heroImageCache.get(item.id);
  if (
    cached &&
    heroUrlQualityScore(cached) >= HERO_IMAGE_QUALITY_OK &&
    !isSc
  ) {
    return cached;
  }

  const initialFallback = pickBestHeroUrl(
    item.backgroundUrl,
    posterUrlFor(item, "hero"),
    item.posterUrl,
  );
  if (!isStreamingMediaId(item.id)) {
    return cacheHeroImage(item.id, initialFallback) ?? initialFallback;
  }

  if (!target?.slug) {
    return cacheHeroImage(item.id, initialFallback) ?? initialFallback;
  }

  try {
    let url: string | undefined;
    if (target.catalogPrefix === "sc") {
      const meta = await fetchScMeta(target.metaId, target.slug);
      url = pickBestHeroUrl(meta.background, meta.poster, item.backgroundUrl, item.posterUrl);
      if (meta.logo) {
        cacheHeroLogo(item.id, meta.logo);
      }
    } else if (target.catalogPrefix === "saturn") {
      const meta = await fetchSaturnMeta(target.slug);
      url = pickBestHeroUrl(meta.background, meta.poster, item.backgroundUrl, item.posterUrl);
    } else if (target.catalogPrefix === "loonex") {
      const meta = await fetchLoonexMeta(target.slug);
      url = pickBestHeroUrl(meta.background, meta.poster, item.backgroundUrl, item.posterUrl);
    } else if (target.catalogPrefix === "youtube") {
      const meta = await fetchYoutubeMeta(target.metaId);
      url = pickBestHeroUrl(meta.background, meta.poster, item.backgroundUrl, item.posterUrl);
    }

    if (url) {
      return cacheHeroImage(item.id, url) ?? url;
    }
  } catch {
    // fallback sotto
  }

  return cacheHeroImage(item.id, initialFallback) ?? initialFallback;
}

export async function enrichHeroPreviewsWithLogos(
  previews: StremioMetaPreview[],
  limit = 20,
): Promise<StremioMetaPreview[]> {
  const withLogo = previews.filter(isScHeroWithLogo);
  if (withLogo.length >= 4) return withLogo;

  const candidates = previews.filter((preview) => {
    const prefix = preview.catalogPrefix?.toLowerCase() ?? "";
    return (
      prefix === "sc" &&
      Boolean(preview.slug) &&
      Boolean(preview.background || preview.poster) &&
      !preview.logo
    );
  });

  const enriched: StremioMetaPreview[] = [...withLogo];
  const seen = new Set(withLogo.map((preview) => `${preview.type}:${preview.id}`));

  await Promise.all(
    candidates.slice(0, limit).map(async (preview) => {
      try {
        const meta = await fetchScMeta(preview.id, preview.slug!);
        if (!meta.logo) return;
        const key = `${preview.type}:${preview.id}`;
        if (seen.has(key)) return;
        seen.add(key);
        enriched.push({
          ...preview,
          logo: pickBestLogoUrl(meta.logo, preview.logo),
          background: pickBestHeroUrl(meta.background, preview.background, preview.poster),
          description: preview.description ?? meta.description,
        });
      } catch {
        // skip
      }
    }),
  );

  return filterHeroPreviews(enriched);
}

export async function resolveHeroLogoUrl(item: MediaItem): Promise<string | undefined> {
  const local = pickBestLogoUrl(item.logoUrl);
  const cached = heroLogoCache.get(item.id);
  const bestKnown = pickBestLogoUrl(cached, local);

  if (!isStreamingMediaId(item.id)) return bestKnown;

  const target = parseStreamingMediaId(item.id);
  if (!target?.slug || target.catalogPrefix !== "sc") return bestKnown;

  try {
    const meta = await fetchScMeta(target.metaId, target.slug);
    return cacheHeroLogo(item.id, pickBestLogoUrl(meta.logo, bestKnown)) ?? bestKnown;
  } catch {
    return bestKnown;
  }
}

export function prefetchHeroImage(item: MediaItem): void {
  if (!needsHeroImageUpgrade(item)) {
    void resolveHeroLogoUrl(item);
    return;
  }
  void resolveHeroImageUrl(item);
  void resolveHeroLogoUrl(item);
}
