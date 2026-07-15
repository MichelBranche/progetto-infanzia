export type PosterQualityTier = "low" | "medium" | "high";

const TMDB_SIZE_RE = /\/t\/p\/[^/]+\//i;

type NetworkInformation = {
  effectiveType?: string;
  saveData?: boolean;
  downlink?: number;
  addEventListener?: (type: string, listener: () => void) => void;
  removeEventListener?: (type: string, listener: () => void) => void;
};

function networkInformation(): NetworkInformation | undefined {
  if (typeof navigator === "undefined") return undefined;
  const nav = navigator as Navigator & {
    connection?: NetworkInformation;
    mozConnection?: NetworkInformation;
    webkitConnection?: NetworkInformation;
  };
  return nav.connection ?? nav.mozConnection ?? nav.webkitConnection;
}

export function detectPosterQualityTier(): PosterQualityTier {
  const conn = networkInformation();
  if (!conn) return "medium";

  if (conn.saveData) return "low";

  const effective = conn.effectiveType?.toLowerCase();
  if (effective === "slow-2g" || effective === "2g") return "low";
  if (effective === "3g") return "medium";
  if (effective === "4g") return "high";

  if (typeof conn.downlink === "number") {
    if (conn.downlink < 1.2) return "low";
    if (conn.downlink < 4) return "medium";
    return "high";
  }

  return "medium";
}

export function downgradeTier(tier: PosterQualityTier): PosterQualityTier {
  if (tier === "high") return "medium";
  if (tier === "medium") return "low";
  return "low";
}

export function upgradeTier(tier: PosterQualityTier): PosterQualityTier {
  if (tier === "low") return "medium";
  if (tier === "medium") return "high";
  return "high";
}

export function subscribePosterQualityTier(
  onChange: (tier: PosterQualityTier) => void,
): () => void {
  const conn = networkInformation();
  if (!conn?.addEventListener) return () => {};

  const handler = () => onChange(detectPosterQualityTier());
  conn.addEventListener("change", handler);
  return () => conn.removeEventListener?.("change", handler);
}

function tmdbPosterSize(tier: PosterQualityTier): string {
  switch (tier) {
    case "low":
      return "w342";
    case "medium":
      return "w500";
    default:
      return "original";
  }
}

function tmdbBackdropSize(tier: PosterQualityTier): string {
  switch (tier) {
    case "low":
      return "w300";
    case "medium":
      return "w780";
    default:
      return "original";
  }
}

function applyTmdbSize(url: string, size: string): string {
  if (!url.includes("image.tmdb.org")) return url;
  return url.replace(TMDB_SIZE_RE, `/t/p/${size}/`);
}

/** Varianti SC più leggere (se presenti sul CDN). */
function scLowResCandidates(url: string): string[] {
  if (!url.includes("/images/")) return [];

  const candidates = [
    url.replace(/poster(?=\.[a-z0-9]+$)/i, "poster_mobile"),
    url.replace(/cover(?=\.[a-z0-9]+$)/i, "cover_mobile"),
    url.replace(/background(?=\.[a-z0-9]+$)/i, "background_mobile"),
    url.replace(/full-poster/gi, "poster_mobile"),
    url.replace(/full-cover/gi, "cover_mobile"),
  ];

  return [...new Set(candidates.filter((candidate) => candidate !== url))];
}

function scHighResUrl(url: string): string {
  return url
    .replace(/poster_mobile/gi, "poster")
    .replace(/cover_mobile/gi, "cover")
    .replace(/background_mobile/gi, "background")
    .replace(/_mobile(?=\.[a-z0-9]+$)/gi, "")
    .replace(/-mobile(?=\.[a-z0-9]+$)/gi, "");
}

export function adaptPosterUrlForTier(
  url: string | undefined,
  tier: PosterQualityTier,
): string | undefined {
  if (!url?.trim()) return undefined;

  let normalized = url.trim();

  if (normalized.includes("image.tmdb.org")) {
    return applyTmdbSize(normalized, tmdbPosterSize(tier));
  }

  if (tier === "high") {
    return scHighResUrl(normalized);
  }

  if (tier === "low") {
    const mobile = scLowResCandidates(normalized)[0];
    return mobile ?? normalized;
  }

  return normalized;
}

export function adaptHeroUrlForTier(
  url: string | undefined,
  tier: PosterQualityTier,
): string | undefined {
  if (!url?.trim()) return undefined;

  let normalized = url.trim();

  if (normalized.includes("image.tmdb.org")) {
    return applyTmdbSize(normalized, tmdbBackdropSize(tier));
  }

  if (tier === "high") {
    return scHighResUrl(normalized)
      .replace(/cover_mobile/gi, "cover")
      .replace(/poster_mobile/gi, "poster")
      .replace(/background_mobile/gi, "background");
  }

  if (tier === "low") {
    const mobile = scLowResCandidates(normalized)[0];
    return mobile ?? normalized;
  }

  return normalized;
}

export function posterTierUpgradeUrl(
  url: string | undefined,
  tier: PosterQualityTier,
): string | undefined {
  if (!url?.trim() || tier === "high") return undefined;
  return adaptPosterUrlForTier(url, "high");
}

export function heroTierUpgradeUrl(
  url: string | undefined,
  tier: PosterQualityTier,
): string | undefined {
  if (!url?.trim() || tier === "high") return undefined;
  return adaptHeroUrlForTier(url, "high");
}

export function posterTierFallbacks(
  url: string | undefined,
  tier: PosterQualityTier,
): string[] {
  if (!url?.trim()) return [];

  const out: string[] = [];
  const push = (candidate?: string) => {
    if (!candidate || out.includes(candidate)) return;
    out.push(candidate);
  };

  push(adaptPosterUrlForTier(url, tier));
  if (tier !== "medium") push(adaptPosterUrlForTier(url, "medium"));
  if (tier !== "high") push(adaptPosterUrlForTier(url, "high"));

  for (const mobile of scLowResCandidates(url.trim())) {
    push(mobile);
  }

  push(adaptPosterUrlForTier(url, "high"));

  return out;
}
