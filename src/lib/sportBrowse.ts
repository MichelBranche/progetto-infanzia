import type { BrowseItem } from "./browse";
import { browseItemId } from "./browse";
import type { StremioMetaPreview } from "../types/stremio";
import { streamingBrowseItem } from "./streamingBrowse";
import { isRaiplaySportPreview } from "./unifiedBrowse";
import type { StreamingRow } from "./useStreamingCatalogs";

export interface SportBrowseRow {
  key: string;
  title: string;
  items: BrowseItem[];
}

export interface SportBrowseLayout {
  heroPreviews: StremioMetaPreview[];
  rows: SportBrowseRow[];
}

const MIN_ROW_ITEMS = 3;
const ROW_DISPLAY_LIMIT = 24;
const HERO_LIMIT = 8;

/** Discipline in evidenza — ordine fisso come una home Sport. */
const SPORT_CATEGORIES: Array<{
  id: string;
  title: string;
  match: RegExp;
}> = [
  {
    id: "calcio",
    title: "Calcio",
    match:
      /calcio|serie\s*a|mondiali|juventus|maradona|copa\b|football|\bgol\b|torino|bologna|azzurr|berlino|adani/i,
  },
  {
    id: "ciclismo",
    title: "Ciclismo",
    match:
      /ciclismo|tour\s*de\s*france|giro\s*d'|liegi|roubaix|milano-sanremo|tirreno|strade\s*bianche|pantani|merckx|nibali|bettini|airone/i,
  },
  {
    id: "motori",
    title: "Motori",
    match:
      /motori|ferrari|senna|lauda|rossi|formula|villeneuve|giunti|\bf1\b|moto\s*gp|automobil/i,
  },
  {
    id: "pallavolo",
    title: "Pallavolo",
    match: /pallavolo|volley/i,
  },
  {
    id: "atletica",
    title: "Atletica",
    match: /atletica|diamond\s*league|tamberi|indoor/i,
  },
  {
    id: "nuoto",
    title: "Nuoto",
    match: /nuoto|pellegrini|swim|medagl/i,
  },
  {
    id: "tennis",
    title: "Tennis",
    match: /tennis|panatta|foro\s*italico/i,
  },
  {
    id: "vela",
    title: "Vela",
    match: /america'?s\s*cup|vela|azzurra|acqua\s*e\s*vento/i,
  },
];

function enrichFlags(preview: StremioMetaPreview): StremioMetaPreview {
  return preview;
}

function itemText(item: BrowseItem): string {
  if (item.kind !== "streaming") return "";
  const p = item.preview;
  return `${p.name} ${p.slug ?? ""} ${p.description ?? ""} ${p.sourceRowTitle ?? ""}`;
}

function isVideoClip(item: BrowseItem): boolean {
  return (
    item.kind === "streaming" &&
    (item.preview.slug ?? "").toLowerCase().startsWith("video/")
  );
}

function dedupeItems(items: BrowseItem[]): BrowseItem[] {
  const seen = new Set<string>();
  const out: BrowseItem[] = [];
  for (const item of items) {
    const id = browseItemId(item);
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(item);
  }
  return out;
}

function categoryMatchScore(item: BrowseItem, match: RegExp): number {
  const text = itemText(item);
  if (!match.test(text)) return 0;
  // Preferisci programmi hub rispetto ai clip highlights.
  return isVideoClip(item) ? 1 : 3;
}

export function buildSportBrowseLayout(
  catalogItems: BrowseItem[],
  streamingRows: StreamingRow[] = [],
  withFlags: (preview: StremioMetaPreview) => StremioMetaPreview = enrichFlags,
): SportBrowseLayout {
  const namedRows = streamingRows
    .filter((row) => row.key.startsWith("raiplay-sport-"))
    .map((row) => ({
      key: row.key,
      title: row.title,
      items: row.items
        .map((preview) => streamingBrowseItem(withFlags(preview)))
        .slice(0, ROW_DISPLAY_LIMIT),
    }))
    .filter((row) => row.items.length >= MIN_ROW_ITEMS);

  const flatSport = catalogItems.filter(
    (item) => item.kind === "streaming" && isRaiplaySportPreview(item.preview),
  );

  const allSportItems = dedupeItems([
    ...namedRows.flatMap((row) => row.items),
    ...flatSport,
  ]);

  const rows: SportBrowseRow[] = [];

  // 1) Hub discipline (Ciclismo, Pallavolo, Serie A…) dalla riga canali Rai.
  const canaliRow = namedRows.find((row) =>
    /canali\s*rai|lo\s*sport\s*sui/i.test(row.title),
  );
  if (canaliRow && canaliRow.items.length >= MIN_ROW_ITEMS) {
    rows.push({
      key: "sport-discipline",
      title: "Discipline",
      items: canaliRow.items.slice(0, ROW_DISPLAY_LIMIT),
    });
  }

  // 2) Righe per categoria: Calcio, Ciclismo, Motori…
  const usedIds = new Set<string>();
  if (canaliRow) {
    for (const item of canaliRow.items) usedIds.add(browseItemId(item));
  }

  for (const category of SPORT_CATEGORIES) {
    const scored = allSportItems
      .map((item) => ({
        item,
        score: categoryMatchScore(item, category.match),
      }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score || 0);

    const items = scored
      .map((entry) => entry.item)
      .filter((item) => !usedIds.has(browseItemId(item)))
      .slice(0, ROW_DISPLAY_LIMIT);

    if (items.length < MIN_ROW_ITEMS) continue;

    for (const item of items) usedIds.add(browseItemId(item));
    rows.push({
      key: `sport-cat-${category.id}`,
      title: category.title,
      items,
    });
  }

  // 3) Doc / ritratti / film sportivi come approfondimento.
  const extras: Array<{ key: string; title: string; match: RegExp }> = [
    {
      key: "sport-doc",
      title: "Film e documentari",
      match: /film|doc|storie|ritratt|campione|sfide|vita\s*da/i,
    },
  ];
  for (const extra of extras) {
    const fromNamed = namedRows.find((row) =>
      /film|doc|ritratt/i.test(row.title),
    );
    const pool = fromNamed?.items?.length
      ? fromNamed.items
      : allSportItems.filter((item) => extra.match.test(itemText(item)));
    const items = pool
      .filter((item) => !usedIds.has(browseItemId(item)))
      .slice(0, ROW_DISPLAY_LIMIT);
    if (items.length < MIN_ROW_ITEMS) continue;
    for (const item of items) usedIds.add(browseItemId(item));
    rows.push({ key: extra.key, title: extra.title, items });
  }

  // Fallback: se le categorie sono poche, usa le slider RaiPlay originali.
  if (rows.length < 3 && namedRows.length > 0) {
    for (const row of namedRows) {
      if (rows.some((existing) => existing.key === row.key)) continue;
      rows.push(row);
    }
  } else if (rows.length === 0 && flatSport.length >= MIN_ROW_ITEMS) {
    rows.push({
      key: "raiplay-sport",
      title: "RaiPlay Sport",
      items: flatSport.slice(0, ROW_DISPLAY_LIMIT),
    });
  }

  const heroSeen = new Set<string>();
  const heroPreviews: StremioMetaPreview[] = [];
  const pushHero = (preview: StremioMetaPreview) => {
    if (!preview.poster && !preview.background) return;
    if ((preview.slug ?? "").toLowerCase().startsWith("video/")) return;
    const key = `${preview.type}:${preview.id}`;
    if (heroSeen.has(key)) return;
    heroSeen.add(key);
    heroPreviews.push(withFlags(preview));
  };

  const calcioRow = rows.find((row) => row.key === "sport-cat-calcio");
  const docRow = rows.find((row) => row.key === "sport-doc");
  for (const row of [docRow, calcioRow, ...rows]) {
    if (!row) continue;
    for (const item of row.items) {
      if (item.kind !== "streaming") continue;
      pushHero(item.preview);
      if (heroPreviews.length >= HERO_LIMIT) break;
    }
    if (heroPreviews.length >= HERO_LIMIT) break;
  }

  return { heroPreviews, rows };
}
