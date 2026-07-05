import {
  fetchLoonexMeta,
  fetchSaturnMeta,
  fetchScMeta,
  fetchYoutubeMeta,
} from "./addonsApi";
import { posterUrlFor } from "../components/PosterImage";
import type { MediaItem } from "../types/media";
import type { StremioMetaPreview } from "../types/stremio";
import { isStreamingMediaId, parseStreamingMediaId } from "./streamingBrowse";

const heroImageCache = new Map<string, string>();

export function isHeroEligiblePreview(preview: StremioMetaPreview): boolean {
  const prefix = preview.catalogPrefix?.toLowerCase() ?? "";
  if (prefix === "mangadex" || prefix === "manga") return false;
  const type = preview.type?.toLowerCase() ?? "";
  if (type === "manga") return false;
  const context = `${preview.sourceRowKey ?? ""} ${preview.sourceRowTitle ?? ""}`.toLowerCase();
  if (context.includes("manga")) return false;
  return Boolean(preview.poster || preview.background);
}

export function isHeroEligibleLocalItem(item: MediaItem): boolean {
  const type = item.mediaType?.toLowerCase() ?? "";
  return type !== "manga";
}

export function isHeroPriorityPreview(preview: StremioMetaPreview): boolean {
  if (!isHeroEligiblePreview(preview)) return false;

  const mediaType = preview.mediaType?.toLowerCase();
  if (mediaType === "film" || mediaType === "serie") return true;

  const type = preview.type?.toLowerCase() ?? "";
  const prefix = preview.catalogPrefix?.toLowerCase() ?? "sc";
  return prefix === "sc" && (type === "movie" || type === "series");
}

export function isHeroPriorityLocalItem(item: MediaItem): boolean {
  if (!isHeroEligibleLocalItem(item)) return false;
  const type = item.mediaType?.toLowerCase() ?? "";
  return type === "film" || type === "serie";
}

export function filterHeroPreviews(
  previews: StremioMetaPreview[],
): StremioMetaPreview[] {
  return previews.filter(isHeroEligiblePreview);
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
    background: preview.background ?? match.background,
    poster: preview.poster ?? match.poster,
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
      description: preview.description ?? existing.description,
      name: preview.name || existing.name,
    });
  };

  for (const preview of catalogIndex) merge(preview);
  for (const row of streamingRows) {
    for (const item of row.items) merge(item);
  }
  for (const preview of streamingPreviews) merge(preview);

  const merged = filterHeroPreviews(
    [...byKey.values()].filter(
      (preview) => preview.background || preview.poster,
    ),
  );

  if (merged.length > 0) return merged;

  if (streamingPreviews.length > 0) {
    return filterHeroPreviews(streamingPreviews);
  }

  const fallback: StremioMetaPreview[] = [];
  const seen = new Set<string>();
  for (const row of streamingRows) {
    for (const item of row.items) {
      const key = `${item.type}:${item.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (isHeroEligiblePreview(item)) fallback.push(item);
    }
  }
  return fallback;
}

function isLikelyLowResHero(url: string | undefined): boolean {
  if (!url) return true;
  const normalized = url.toLowerCase();
  return (
    normalized.includes("cover_mobile") ||
    normalized.includes("/cover-") ||
    normalized.includes("cover_") ||
    normalized.endsWith("-cover.webp")
  );
}

export function needsHeroImageUpgrade(item: MediaItem): boolean {
  if (!isStreamingMediaId(item.id)) return false;
  const heroUrl = posterUrlFor(item, "hero");
  if (!heroUrl) return true;
  if (heroImageCache.has(item.id)) return false;
  const poster = item.posterUrl;
  const background = item.backgroundUrl;
  if (!background) return true;
  if (background === poster && isLikelyLowResHero(background)) return true;
  return isLikelyLowResHero(heroUrl);
}

export async function resolveHeroImageUrl(
  item: MediaItem,
): Promise<string | undefined> {
  const cached = heroImageCache.get(item.id);
  if (cached) return cached;

  const fallback = posterUrlFor(item, "hero");
  if (!isStreamingMediaId(item.id)) {
    return fallback;
  }

  const target = parseStreamingMediaId(item.id);
  if (!target?.slug) return fallback;

  try {
    let url: string | undefined;
    if (target.catalogPrefix === "sc") {
      const meta = await fetchScMeta(target.metaId, target.slug);
      url = meta.background ?? meta.poster;
    } else if (target.catalogPrefix === "saturn") {
      const meta = await fetchSaturnMeta(target.slug);
      url = meta.background ?? meta.poster;
    } else if (target.catalogPrefix === "loonex") {
      const meta = await fetchLoonexMeta(target.slug);
      url = meta.background ?? meta.poster;
    } else if (target.catalogPrefix === "youtube") {
      const meta = await fetchYoutubeMeta(target.metaId);
      url = meta.background ?? meta.poster;
    }

    if (url) {
      heroImageCache.set(item.id, url);
      return url;
    }
  } catch {
    // fallback sotto
  }

  return fallback;
}

export function prefetchHeroImage(item: MediaItem): void {
  if (!needsHeroImageUpgrade(item)) return;
  void resolveHeroImageUrl(item);
}
