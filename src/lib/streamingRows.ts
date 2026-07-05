import type { StremioMetaPreview } from "../types/stremio";
import type { StreamingRow } from "./useStreamingCatalogs";

const TOP10_TARGET = 10;

export function isTop10Row(row: StreamingRow): boolean {
  const key = row.key.toLowerCase();
  const title = row.title.toLowerCase();
  return key.includes("top10") || title.includes("top 10");
}

function dedupePreviews(
  items: StremioMetaPreview[],
  seen: Set<string>,
): StremioMetaPreview[] {
  const out: StremioMetaPreview[] = [];
  for (const item of items) {
    const key = `${item.type}:${item.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
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

  const priorityRows = otherRows.filter((row) =>
    /trend|popular|latest|top|imdb|week/i.test(`${row.key} ${row.title}`),
  );
  const filler = [
    ...priorityRows.flatMap((row) => row.items),
    ...otherRows.flatMap((row) => row.items),
    ...catalogIndex,
  ];

  return [...merged, ...dedupePreviews(filler, seen)].slice(0, TOP10_TARGET);
}

export function splitTop10Row(
  rows: StreamingRow[],
  catalogIndex: StremioMetaPreview[] = [],
): {
  top10Row: StreamingRow | null;
  otherRows: StreamingRow[];
} {
  const top10Candidates = rows.filter(isTop10Row);
  const otherRows = rows.filter((row) => !isTop10Row(row));

  if (top10Candidates.length === 0) {
    return { top10Row: null, otherRows };
  }

  const mergedItems = padTop10Items(
    top10Candidates.flatMap((row) => row.items),
    otherRows,
    catalogIndex,
  );

  if (mergedItems.length < TOP10_TARGET) {
    return { top10Row: null, otherRows };
  }

  const primary =
    top10Candidates.find((row) => row.key.includes("browse-top10")) ??
    top10Candidates[0];

  return {
    top10Row: {
      ...primary,
      items: mergedItems,
    },
    otherRows,
  };
}
