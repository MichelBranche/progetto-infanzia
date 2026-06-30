import type { StreamingRow } from "./useStreamingCatalogs";

export function isTop10Row(row: StreamingRow): boolean {
  const key = row.key.toLowerCase();
  const title = row.title.toLowerCase();
  return key.includes("top10") || title.includes("top 10");
}

export function splitTop10Row(rows: StreamingRow[]): {
  top10Row: StreamingRow | null;
  otherRows: StreamingRow[];
} {
  const top10Candidates = rows.filter(isTop10Row);
  const otherRows = rows.filter((row) => !isTop10Row(row));

  if (top10Candidates.length === 0) {
    return { top10Row: null, otherRows };
  }

  const seen = new Set<string>();
  const mergedItems = top10Candidates.flatMap((row) =>
    row.items.filter((item) => {
      const key = `${item.type}:${item.id}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }),
  );

  const primary =
    top10Candidates.find((row) => row.key.includes("browse-top10")) ??
    top10Candidates[0];

  return {
    top10Row: {
      ...primary,
      items: mergedItems.slice(0, 10),
    },
    otherRows,
  };
}
