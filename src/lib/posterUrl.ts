const TMDB_SIZE_RE = /\/t\/p\/w\d+\//i;
const LOW_RES_WIDTH_RE = /[?&](?:w|width)=\d{1,3}(?:&|$)/i;

/** Prefer the highest-resolution variant known for a poster/cover URL. */
export function maximizePosterUrl(url: string | undefined): string | undefined {
  if (!url?.trim()) return undefined;

  const normalized = url.trim();

  if (normalized.includes("image.tmdb.org")) {
    return normalized.replace(TMDB_SIZE_RE, "/t/p/original/");
  }

  return stripSizeLimitingQuery(normalized);
}

/** Logo/title art: full-res, no thumb/mobile variants. */
export function maximizeLogoUrl(url: string | undefined): string | undefined {
  if (!url?.trim()) return undefined;

  let normalized = maximizePosterUrl(url.trim()) ?? url.trim();

  normalized = normalized
    .replace(/logo_small/gi, "logo")
    .replace(/logo_mobile/gi, "logo")
    .replace(/title_logo_small/gi, "title_logo")
    .replace(/_small(?=\.[a-z0-9]+$)/gi, "")
    .replace(/-small(?=\.[a-z0-9]+$)/gi, "")
    .replace(/_thumb(?:nail)?(?=\.[a-z0-9]+$)/gi, "")
    .replace(/-thumb(?:nail)?(?=\.[a-z0-9]+$)/gi, "");

  return stripSizeLimitingQuery(normalized);
}

export function logoUrlQualityScore(url: string | undefined): number {
  if (!url?.trim()) return 0;
  if (isLikelyLowResHeroUrl(url)) return 4;

  const normalized = url.toLowerCase();
  let score = 52;

  if (normalized.includes("/images/")) score = 78;
  if (normalized.includes("image.tmdb.org/t/p/original")) score = 90;
  if (normalized.includes("logo")) score += 10;
  if (normalized.endsWith(".png") || normalized.endsWith(".svg")) score += 8;
  if (normalized.includes("original") || normalized.includes("full")) score += 12;

  return score;
}

export function pickBestLogoUrl(
  ...candidates: Array<string | undefined>
): string | undefined {
  let best: string | undefined;
  let bestScore = -1;
  for (const candidate of candidates) {
    const maximized = maximizeLogoUrl(candidate);
    if (!maximized) continue;
    const score = logoUrlQualityScore(maximized);
    if (score > bestScore) {
      bestScore = score;
      best = maximized;
    }
  }
  return best;
}

/** Hero: landscape/backdrop full-res — background prima di poster, no varianti mobile. */
export function maximizeHeroUrl(url: string | undefined): string | undefined {
  if (!url?.trim()) return undefined;

  let normalized = maximizePosterUrl(url.trim()) ?? url.trim();

  normalized = normalized
    .replace(/cover_mobile/gi, "cover")
    .replace(/poster_mobile/gi, "poster")
    .replace(/background_mobile/gi, "background")
    .replace(/_mobile(?=\.[a-z0-9]+$)/gi, "")
    .replace(/-mobile(?=\.[a-z0-9]+$)/gi, "")
    .replace(/_thumb(?:nail)?(?=\.[a-z0-9]+$)/gi, "")
    .replace(/-thumb(?:nail)?(?=\.[a-z0-9]+$)/gi, "")
    .replace(/_small(?=\.[a-z0-9]+$)/gi, "")
    .replace(/-small(?=\.[a-z0-9]+$)/gi, "")
    .replace(/\/small\//gi, "/")
    .replace(/\/medium\//gi, "/")
    .replace(/\/thumb\//gi, "/");

  return stripSizeLimitingQuery(normalized);
}

export function heroUrlQualityScore(url: string | undefined): number {
  if (!url?.trim()) return 0;
  if (isLikelyLowResHeroUrl(url)) return 5;

  const normalized = url.toLowerCase();
  let score = 45;

  if (normalized.includes("/images/")) {
    score = 72;
    if (normalized.includes("background")) score += 14;
    if (normalized.includes("original") || normalized.includes("full")) score += 12;
    if (normalized.includes("cover") && !normalized.includes("cover_mobile")) {
      score += 8;
    }
  }
  if (normalized.includes("image.tmdb.org/t/p/original")) score = Math.max(score, 88);
  if (
    normalized.includes("background") ||
    normalized.includes("-bg.") ||
    normalized.includes("_bg.")
  ) {
    score += 12;
  }

  return score;
}

export function pickBestHeroUrl(
  ...candidates: Array<string | undefined>
): string | undefined {
  let best: string | undefined;
  let bestScore = -1;
  for (const candidate of candidates) {
    const maximized = maximizeHeroUrl(candidate);
    if (!maximized) continue;
    const score = heroUrlQualityScore(maximized);
    if (score > bestScore) {
      bestScore = score;
      best = maximized;
    }
  }
  return best;
}

export function isLikelyLowResHeroUrl(url: string | undefined): boolean {
  if (!url?.trim()) return true;
  const normalized = url.toLowerCase();
  return (
    normalized.includes("cover_mobile") ||
    normalized.includes("_mobile.") ||
    normalized.includes("-mobile.") ||
    normalized.includes("_thumb") ||
    normalized.includes("thumbnail") ||
    normalized.includes("_small") ||
    normalized.includes("-small") ||
    normalized.includes("/small/") ||
    normalized.includes("/medium/") ||
    TMDB_SIZE_RE.test(normalized) ||
    LOW_RES_WIDTH_RE.test(normalized)
  );
}

function stripSizeLimitingQuery(url: string): string {
  try {
    const parsed = new URL(url);
    let changed = false;
    for (const key of ["w", "width", "h", "height"]) {
      if (parsed.searchParams.has(key)) {
        parsed.searchParams.delete(key);
        changed = true;
      }
    }
    return changed ? parsed.toString() : url;
  } catch {
    return url;
  }
}
