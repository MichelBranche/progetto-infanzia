import type { StremioMetaPreview } from "../types/stremio";
import type { StreamingRow } from "./useStreamingCatalogs";

const TOP10_TARGET = 10;
const TOP10_MIN = 6;

/** Solo Streaming Community (esclude Saturn, Loonex, addon, ecc.). */
function isStreamingCommunityPreview(preview: StremioMetaPreview): boolean {
  const prefix = preview.catalogPrefix?.toLowerCase();
  return !prefix || prefix === "sc";
}

function isStreamingCommunityRow(row: StreamingRow): boolean {
  const key = row.key.toLowerCase();
  if (key.startsWith("sc-") || key.startsWith("sc_") || key === "sc") {
    return true;
  }
  if (
    key.startsWith("saturn") ||
    key.startsWith("loonex") ||
    key.startsWith("addon")
  ) {
    return false;
  }
  return row.items.length > 0 && row.items.every(isStreamingCommunityPreview);
}

export function isTop10Row(row: StreamingRow): boolean {
  const key = row.key.toLowerCase();
  const title = row.title.toLowerCase();
  return (
    key.includes("top10") ||
    key.includes("top-10") ||
    key.includes("top_10") ||
    title.includes("top 10") ||
    title.includes("top10") ||
    /i\s+pi[uù]\s+visti/.test(title)
  );
}

function dedupePreviews(
  items: StremioMetaPreview[],
  seen: Set<string>,
): StremioMetaPreview[] {
  const out: StremioMetaPreview[] = [];
  for (const item of items) {
    if (!isStreamingCommunityPreview(item)) continue;
    const key = `${item.type}:${item.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function priorityScore(row: StreamingRow): number {
  const s = `${row.key} ${row.title}`.toLowerCase();
  if (/top10|top-10|top_10|top 10/.test(s)) return 0;
  if (/trend/.test(s)) return 1;
  if (/popular|pi[uù]\s+vist|hot|viral/.test(s)) return 2;
  if (/imdb|rating|top/.test(s)) return 3;
  if (/latest|new|week|novit/.test(s)) return 4;
  return 5;
}

function isPriorityFillerRow(row: StreamingRow): boolean {
  return priorityScore(row) < 5;
}

function padTop10Items(
  primary: StremioMetaPreview[],
  otherRows: StreamingRow[],
  catalogIndex: StremioMetaPreview[],
): StremioMetaPreview[] {
  const seen = new Set<string>();
  const merged = dedupePreviews(primary, seen);
  if (merged.length >= TOP10_TARGET) {
    return merged.slice(0, TOP10_TARGET);
  }

  const scRows = otherRows.filter(isStreamingCommunityRow);
  const priorityRows = [...scRows]
    .filter(isPriorityFillerRow)
    .sort((a, b) => priorityScore(a) - priorityScore(b));

  const filler = [
    ...priorityRows.flatMap((row) => row.items),
    ...scRows.flatMap((row) => row.items),
    ...catalogIndex.filter(isStreamingCommunityPreview),
  ];

  return [...merged, ...dedupePreviews(filler, seen)].slice(0, TOP10_TARGET);
}

/**
 * Estrae (o sintetizza) la riga Top 10 homepage — solo Streaming Community.
 */
export function splitTop10Row(
  rows: StreamingRow[],
  catalogIndex: StremioMetaPreview[] = [],
): {
  top10Row: StreamingRow | null;
  otherRows: StreamingRow[];
} {
  const scRows = rows.filter(isStreamingCommunityRow);
  const top10Candidates = scRows.filter(isTop10Row);
  const otherRows =
    top10Candidates.length > 0
      ? rows.filter((row) => !isTop10Row(row))
      : rows;

  const primaryItems =
    top10Candidates.length > 0
      ? top10Candidates.flatMap((row) => row.items)
      : [];

  const mergedItems = padTop10Items(
    primaryItems,
    scRows.filter((row) => !isTop10Row(row)),
    catalogIndex,
  );

  if (mergedItems.length < TOP10_MIN) {
    return {
      top10Row: null,
      otherRows: top10Candidates.length > 0 ? otherRows : rows,
    };
  }

  const primary =
    top10Candidates.find((row) => row.key.includes("browse-top10")) ??
    top10Candidates[0];

  return {
    top10Row: {
      key: primary?.key ?? "sc-top10-home",
      title: primary?.title?.trim() || "Top 10",
      subtitle: primary?.subtitle?.trim() || "Streaming Community",
      items: mergedItems.slice(0, TOP10_TARGET),
    },
    otherRows,
  };
}
