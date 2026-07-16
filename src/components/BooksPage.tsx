import { useCallback, useEffect, useState } from "react";
import { Library, Search } from "lucide-react";
import type { WelibBook } from "../types/welib";
import { fetchPopularBooks, searchBooks } from "../lib/welibApi";
import { BookCard } from "./BookCard";
import { ListSkeleton } from "./Skeleton";

interface BooksPageProps {
  onOpenBook: (item: WelibBook) => void;
}

export function BooksPage({ onOpenBook }: BooksPageProps) {
  const [popular, setPopular] = useState<WelibBook[]>([]);
  const [searchResults, setSearchResults] = useState<WelibBook[] | null>(null);
  const [searchLimited, setSearchLimited] = useState(false);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query.trim()), 400);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void fetchPopularBooks("24h", 0, 24)
      .then((res) => {
        if (!cancelled) setPopular(res.items);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!debouncedQuery) {
      setSearchResults(null);
      setSearchLimited(false);
      return;
    }
    let cancelled = false;
    setSearching(true);
    setError(null);
    void searchBooks(debouncedQuery, 1)
      .then((result) => {
        if (!cancelled) {
          setSearchResults(result.items);
          setSearchLimited(result.limited);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
          setSearchResults([]);
        }
      })
      .finally(() => {
        if (!cancelled) setSearching(false);
      });
    return () => {
      cancelled = true;
    };
  }, [debouncedQuery]);

  const items = searchResults ?? popular;
  const showSearch = debouncedQuery.length > 0;

  const handleSubmit = useCallback((event: React.FormEvent) => {
    event.preventDefault();
    setDebouncedQuery(query.trim());
  }, [query]);

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6">
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-500/15 text-amber-300">
          <Library className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-text-primary">Libri</h1>
          <p className="text-[13px] text-text-muted">
            Catalogo WeLib · Lettura e ascolto online
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="relative mb-6">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Cerca titolo, autore o MD5…"
          className="w-full rounded-xl border border-white/10 bg-white/[0.04] py-3 pl-10 pr-4 text-[14px] text-text-primary outline-none ring-amber-500/40 placeholder:text-text-muted focus:border-amber-500/40 focus:ring-2"
        />
      </form>

      {searchLimited && showSearch && items.length > 0 && (
        <p className="mb-3 text-[12px] text-text-muted">
          Ricerca tra i titoli popolari — il catalogo completo WeLib non è raggiungibile dal server.
        </p>
      )}

      {searchLimited && showSearch && items.length === 0 && !searching && (
        <p className="mb-3 text-[12px] text-text-muted">
          Nessun risultato tra i popolari. Prova un MD5 a 32 caratteri o un titolo dal catalogo.
        </p>
      )}

      {error && (
        <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-[13px] text-red-300">
          {error}
        </div>
      )}

      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-[13px] font-semibold uppercase tracking-wide text-text-muted">
          {showSearch ? `Risultati per “${debouncedQuery}”` : "Popolari ultime 24h"}
        </h2>
      </div>

      {(loading && !showSearch) || (searching && showSearch && items.length === 0) ? (
        <ListSkeleton rows={8} variant="card" />
      ) : items.length === 0 ? (
        <p className="py-12 text-center text-[14px] text-text-muted">
          {showSearch ? "Nessun libro trovato." : "Nessun titolo disponibile al momento."}
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {items.map((item) => (
            <BookCard key={item.md5} item={item} onOpen={onOpenBook} />
          ))}
        </div>
      )}
    </div>
  );
}
