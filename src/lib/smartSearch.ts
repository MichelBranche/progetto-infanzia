/**
 * Matching e ranking smart per la ricerca catalogo.
 * Normalizza accenti/punteggiatura, token multipli, fuzzy e intent leggero.
 */

export type SearchIntentKind = "movie" | "series" | null;
export type SearchIntentCatalog = "sc" | "saturn" | "loonex" | "youtube" | null;

export interface ParsedSearchQuery {
  raw: string;
  normalized: string;
  tokens: string[];
  year: number | null;
  kind: SearchIntentKind;
  catalogHint: SearchIntentCatalog;
}

export interface SmartSearchable {
  name?: string | null;
  slug?: string | null;
  type?: string | null;
  catalogPrefix?: string | null;
  releaseInfo?: string | null;
  genres?: string[] | null;
  cast?: string[] | null;
  directors?: string[] | null;
}

const INTENT_KIND: Array<{ re: RegExp; kind: SearchIntentKind }> = [
  { re: /\b(film|movie|movies|pellicol[ae])\b/i, kind: "movie" },
  { re: /\b(serie|series|serietv|show|tv)\b/i, kind: "series" },
];

const INTENT_CATALOG: Array<{ re: RegExp; catalog: SearchIntentCatalog }> = [
  { re: /\b(anime|animesaturn|saturn)\b/i, catalog: "saturn" },
  { re: /\b(cartoni|cartoon|cartone|loonex|youtube)\b/i, catalog: "loonex" },
];

/** Rimuove accenti, punteggiatura e spazi multipli → chiave di confronto. */
export function normalizeSearchText(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[''`´]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function tokenizeSearchText(input: string): string[] {
  const n = normalizeSearchText(input);
  if (!n) return [];
  return n.split(" ").filter((t) => t.length > 0);
}

function extractYear(tokens: string[]): number | null {
  for (const token of tokens) {
    if (/^(19|20)\d{2}$/.test(token)) {
      return Number(token);
    }
  }
  return null;
}

export function parseSearchQuery(query: string): ParsedSearchQuery {
  let working = query.trim();
  let kind: SearchIntentKind = null;
  let catalogHint: SearchIntentCatalog = null;

  for (const rule of INTENT_KIND) {
    if (rule.re.test(working)) {
      kind = rule.kind;
      working = working.replace(rule.re, " ");
      break;
    }
  }
  for (const rule of INTENT_CATALOG) {
    if (rule.re.test(working)) {
      catalogHint = rule.catalog;
      working = working.replace(rule.re, " ");
      break;
    }
  }

  const tokens = tokenizeSearchText(working);
  const year = extractYear(tokens);
  const contentTokens = tokens.filter((t) => !/^(19|20)\d{2}$/.test(t));
  const normalized = contentTokens.join(" ");

  return {
    raw: query.trim(),
    normalized,
    tokens: contentTokens,
    year,
    kind,
    catalogHint,
  };
}

/** Distanza di Levenshtein (capata) per fuzzy match. */
export function editDistance(a: string, b: string, max = 4): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  if (Math.abs(a.length - b.length) > max) return max + 1;

  const prev = new Array(b.length + 1);
  const curr = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;

  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    let rowMin = curr[0];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
      if (curr[j] < rowMin) rowMin = curr[j];
    }
    if (rowMin > max) return max + 1;
    for (let j = 0; j <= b.length; j++) prev[j] = curr[j];
  }
  return prev[b.length];
}

function fuzzyAllowedDistance(tokenLen: number): number {
  if (tokenLen <= 3) return 0;
  if (tokenLen <= 5) return 1;
  if (tokenLen <= 8) return 2;
  return 3;
}

function tokenMatchesHaystack(token: string, haystack: string, words: string[]): boolean {
  if (!token) return true;
  if (haystack.includes(token)) return true;
  const maxDist = fuzzyAllowedDistance(token.length);
  if (maxDist === 0) return false;
  for (const word of words) {
    if (Math.abs(word.length - token.length) > maxDist) continue;
    if (editDistance(token, word, maxDist) <= maxDist) return true;
  }
  return false;
}

function yearFromPreview(item: SmartSearchable): number | null {
  const info = item.releaseInfo?.trim() ?? "";
  const match = info.match(/\b(19|20)\d{2}\b/);
  return match ? Number(match[0]) : null;
}

function previewHaystack(item: SmartSearchable): { text: string; words: string[] } {
  const name = normalizeSearchText(item.name ?? "");
  const slug = normalizeSearchText((item.slug ?? "").replace(/-/g, " "));
  const genres = (item.genres ?? [])
    .map((g) => normalizeSearchText(g))
    .filter(Boolean)
    .join(" ");
  const cast = (item.cast ?? [])
    .map((c) => normalizeSearchText(c))
    .filter(Boolean)
    .join(" ");
  const directors = (item.directors ?? [])
    .map((d) => normalizeSearchText(d))
    .filter(Boolean)
    .join(" ");
  const text = [name, slug, genres, cast, directors].filter(Boolean).join(" ");
  return { text, words: text.split(" ").filter(Boolean) };
}

/**
 * Campi precomputati per un elemento del catalogo. Estraendo la
 * normalizzazione costante (accenti/slug/cast) dal percorso di scoring,
 * ogni keystroke non ri-normalizza l'intero catalogo.
 */
export interface SearchIndexEntry<T extends SmartSearchable> {
  item: T;
  text: string;
  words: string[];
  year: number | null;
  type: string | null;
  catalogPrefix: string | null;
  people: string[];
  nameLen: number;
}

export function buildSearchIndexEntry<T extends SmartSearchable>(
  item: T,
): SearchIndexEntry<T> {
  const { text, words } = previewHaystack(item);
  const people = [...(item.cast ?? []), ...(item.directors ?? [])]
    .map((p) => normalizeSearchText(p))
    .filter(Boolean);
  return {
    item,
    text,
    words,
    year: yearFromPreview(item),
    type: item.type ?? null,
    catalogPrefix: item.catalogPrefix ?? null,
    people,
    nameLen: (item.name ?? "").length,
  };
}

export function buildSearchIndex<T extends SmartSearchable>(
  items: T[],
): SearchIndexEntry<T>[] {
  const out: SearchIndexEntry<T>[] = new Array(items.length);
  for (let i = 0; i < items.length; i++) {
    out[i] = buildSearchIndexEntry(items[i]);
  }
  return out;
}

/**
 * Core dello scoring: opera solo su campi precomputati, così è condiviso
 * tra `scoreSearchItem` (on-demand) e `scoreSearchIndexEntry` (indicizzato)
 * garantendo risultati identici.
 */
function scoreSearchFields(
  fields: {
    text: string;
    words: string[];
    year: number | null;
    type: string | null;
    catalogPrefix: string | null;
    people: string[];
    nameLen: number;
  },
  parsed: ParsedSearchQuery,
): number {
  if (!parsed.normalized && !parsed.year && !parsed.kind && !parsed.catalogHint) {
    return 0;
  }

  if (parsed.kind === "movie" && fields.type === "series") return 0;
  if (parsed.kind === "series" && fields.type === "movie") return 0;

  if (parsed.catalogHint) {
    const prefix = fields.catalogPrefix ?? "";
    if (parsed.catalogHint === "loonex") {
      if (prefix !== "loonex" && prefix !== "youtube") return 0;
    } else if (prefix !== parsed.catalogHint) {
      return 0;
    }
  }

  const { text, words } = fields;
  if (!text && parsed.tokens.length > 0) return 0;

  let score = 0;

  if (parsed.normalized) {
    if (text === parsed.normalized) {
      score = 1000;
    } else if (text.startsWith(parsed.normalized)) {
      score = 860;
    } else if (words.some((w) => w.startsWith(parsed.normalized))) {
      score = 780;
    } else if (text.includes(parsed.normalized)) {
      score = 680;
    } else {
      const allTokens = parsed.tokens.every((token) =>
        tokenMatchesHaystack(token, text, words),
      );
      if (!allTokens) return 0;

      let tokenScore = 420;
      for (const token of parsed.tokens) {
        if (words.some((w) => w === token)) tokenScore += 40;
        else if (words.some((w) => w.startsWith(token))) tokenScore += 24;
        else if (text.includes(token)) tokenScore += 12;
        else {
          const maxDist = fuzzyAllowedDistance(token.length);
          let best = maxDist + 1;
          for (const word of words) {
            best = Math.min(best, editDistance(token, word, maxDist));
          }
          tokenScore += Math.max(0, 18 - best * 8);
        }
      }
      score = tokenScore;
    }
  } else {
    // Solo intent/anno senza testo titolo
    score = 200;
  }

  if (parsed.year != null) {
    const itemYear = fields.year;
    if (itemYear === parsed.year) score += 80;
    else if (itemYear != null) score -= 30;
  }

  if (parsed.kind && fields.type === parsed.kind) score += 25;
  if (parsed.catalogHint) {
    const prefix = fields.catalogPrefix ?? "";
    if (prefix === parsed.catalogHint || (parsed.catalogHint === "loonex" && prefix === "youtube")) {
      score += 20;
    }
  }

  // Bonus se la query coincide con un attore/regista (non solo col titolo)
  if (parsed.tokens.length > 0) {
    for (const person of fields.people) {
      if (!person) continue;
      if (person === parsed.normalized) {
        score += 120;
        break;
      }
      if (person.includes(parsed.normalized) || parsed.normalized.includes(person)) {
        score += 70;
        break;
      }
      if (parsed.tokens.every((token) => person.includes(token))) {
        score += 55;
        break;
      }
    }
  }

  // Preferisci match più corti (titoli precisi) a parità di score
  score += Math.max(0, 24 - Math.min(24, Math.floor(fields.nameLen / 4)));

  return score;
}

/**
 * Punteggio 0 = nessun match. Più alto = più rilevante.
 */
export function scoreSearchItem(
  item: SmartSearchable,
  parsed: ParsedSearchQuery,
): number {
  const { text, words } = previewHaystack(item);
  const people = [...(item.cast ?? []), ...(item.directors ?? [])]
    .map((p) => normalizeSearchText(p))
    .filter(Boolean);
  return scoreSearchFields(
    {
      text,
      words,
      year: yearFromPreview(item),
      type: item.type ?? null,
      catalogPrefix: item.catalogPrefix ?? null,
      people,
      nameLen: (item.name ?? "").length,
    },
    parsed,
  );
}

export function scoreSearchIndexEntry<T extends SmartSearchable>(
  entry: SearchIndexEntry<T>,
  parsed: ParsedSearchQuery,
): number {
  return scoreSearchFields(entry, parsed);
}

export function filterAndRankSearchItems<T extends SmartSearchable>(
  items: T[],
  query: string,
  limit = 120,
): T[] {
  const parsed = parseSearchQuery(query);
  if (parsed.tokens.length === 0 && parsed.year == null && !parsed.kind && !parsed.catalogHint) {
    return [];
  }
  if (parsed.normalized.length < 2 && parsed.year == null && !parsed.kind && !parsed.catalogHint) {
    // Consenti "film 2024" senza altre parole
    if (!(parsed.year != null || parsed.kind || parsed.catalogHint)) return [];
  }

  const scored: Array<{ item: T; score: number }> = [];
  for (const item of items) {
    const score = scoreSearchItem(item, parsed);
    if (score > 0) scored.push({ item, score });
  }

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return (a.item.name ?? "").localeCompare(b.item.name ?? "", "it");
  });

  return scored.slice(0, limit).map((entry) => entry.item);
}

/**
 * Come `filterAndRankSearchItems` ma su un indice precomputato: identico nei
 * risultati, senza ri-normalizzare i campi ad ogni chiamata.
 */
export function filterAndRankSearchIndex<T extends SmartSearchable>(
  index: SearchIndexEntry<T>[],
  query: string,
  limit = 120,
): T[] {
  const parsed = parseSearchQuery(query);
  if (parsed.tokens.length === 0 && parsed.year == null && !parsed.kind && !parsed.catalogHint) {
    return [];
  }
  if (parsed.normalized.length < 2 && parsed.year == null && !parsed.kind && !parsed.catalogHint) {
    if (!(parsed.year != null || parsed.kind || parsed.catalogHint)) return [];
  }

  const scored: Array<{ entry: SearchIndexEntry<T>; score: number }> = [];
  for (const entry of index) {
    const score = scoreSearchIndexEntry(entry, parsed);
    if (score > 0) scored.push({ entry, score });
  }

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return (a.entry.item.name ?? "").localeCompare(
      b.entry.item.name ?? "",
      "it",
    );
  });

  return scored.slice(0, limit).map((e) => e.entry.item);
}

/** Miglior titolo "vicino" per "Forse cercavi…", o null. */
export function suggestDidYouMean<T extends SmartSearchable>(
  items: T[],
  query: string,
): T | null {
  const parsed = parseSearchQuery(query);
  if (parsed.tokens.length === 0) return null;

  let best: { item: T; score: number } | null = null;

  for (const item of items) {
    const { text, words } = previewHaystack(item);
    if (!text) continue;

    // Se già matcha bene, non serve "did you mean"
    if (scoreSearchItem(item, parsed) >= 420) continue;

    let distScore = 0;
    let ok = true;
    for (const token of parsed.tokens) {
      let bestDist = 99;
      for (const word of words) {
        const maxDist = Math.max(fuzzyAllowedDistance(token.length), 2);
        bestDist = Math.min(bestDist, editDistance(token, word, maxDist));
      }
      // Confronta anche con l'intero titolo normalizzato
      bestDist = Math.min(
        bestDist,
        editDistance(token, text.slice(0, Math.min(text.length, token.length + 2)), 3),
      );
      if (bestDist > 3) {
        ok = false;
        break;
      }
      distScore += 40 - bestDist * 10;
    }
    if (!ok) continue;

    if (text.startsWith(parsed.tokens[0])) distScore += 30;

    if (!best || distScore > best.score) {
      best = { item, score: distScore };
    }
  }

  return best && best.score >= 20 ? best.item : null;
}

/** Riordina risultati API con lo stesso ranking smart (mantiene solo quelli che matchano). */
export function rankSearchResults<T extends SmartSearchable>(
  items: T[],
  query: string,
): T[] {
  const parsed = parseSearchQuery(query);
  if (!parsed.normalized && !parsed.year && !parsed.kind && !parsed.catalogHint) {
    return items;
  }

  const scored = items
    .map((item) => ({ item, score: scoreSearchItem(item, parsed) }))
    .filter((entry) => entry.score > 0);

  // Se l'API ha restituito risultati che il nostro scorer scarta (es. live SC),
  // tieni comunque quelli senza score in coda.
  const kept = new Set(scored.map((e) => e.item));
  scored.sort((a, b) => b.score - a.score);

  const out = scored.map((e) => e.item);
  for (const item of items) {
    if (!kept.has(item)) out.push(item);
  }
  return out;
}
