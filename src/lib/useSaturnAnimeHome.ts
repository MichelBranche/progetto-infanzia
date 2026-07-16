import { useEffect, useMemo, useState } from "react";
import { fetchSaturnHome } from "./addonsApi";
import type { SaturnGenre, StremioMetaPreview } from "../types/stremio";

export interface AnimeHomeRow {
  key: string;
  title: string;
  subtitle: string;
  items: StremioMetaPreview[];
}

interface StreamingRowLike {
  key: string;
  title: string;
  subtitle: string;
  items: StremioMetaPreview[];
}

/** Righe `saturn-*` gia' caricate in home, usate come seed per un render immediato. */
function seedRowsFromStreaming(rows: StreamingRowLike[]): AnimeHomeRow[] {
  return rows
    .filter((row) => row.key.startsWith("saturn"))
    .map((row) => ({
      key: row.key,
      title: row.title,
      subtitle: row.subtitle,
      items: row.items,
    }));
}

export function useSaturnAnimeHome(seedRows: StreamingRowLike[] = []) {
  const seeded = useMemo(() => seedRowsFromStreaming(seedRows), [seedRows]);
  const [rows, setRows] = useState<AnimeHomeRow[]>(seeded);
  const [genres, setGenres] = useState<SaturnGenre[]>([]);
  const [loading, setLoading] = useState(seeded.length === 0);
  const [error, setError] = useState<string | null>(null);

  // Se il seed arriva dopo (righe home caricate), popola finche' il backend non risponde.
  useEffect(() => {
    setRows((current) => (current.length === 0 ? seeded : current));
  }, [seeded]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const home = await fetchSaturnHome();
        if (cancelled) return;
        if (home.rows.length > 0) setRows(home.rows);
        setGenres(home.genres);
        setError(null);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return { rows, genres, loading, error };
}
