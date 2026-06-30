import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Pencil, Play, Trash2, Loader2 } from "lucide-react";
import type { MediaItem } from "../types/media";
import { mediaTypeLabel } from "../types/media";
import { episodeDisplayTitle } from "../lib/browse";
import { PosterImage } from "./PosterImage";

interface ManageLibraryPageProps {
  items: MediaItem[];
  onPlay: (id: string) => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => Promise<void>;
}

function sortKey(item: MediaItem) {
  const series = item.seriesTitle?.trim();
  if (series) {
    return `${series} S${String(item.season ?? 0).padStart(2, "0")}E${String(item.episode ?? 0).padStart(2, "0")}`;
  }
  return item.title;
}

export function ManageLibraryPage({
  items,
  onPlay,
  onEdit,
  onDelete,
}: ManageLibraryPageProps) {
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const sorted = useMemo(
    () => [...items].sort((a, b) => sortKey(a).localeCompare(sortKey(b), "it")),
    [items],
  );

  const handleDelete = async (id: string) => {
    if (confirmId !== id) {
      setConfirmId(id);
      return;
    }
    setDeletingId(id);
    try {
      await onDelete(id);
      setConfirmId(null);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="page-px pb-16 pt-24 sm:pt-28">
      <span className="font-display text-xs tabular-nums text-text-muted">—</span>
      <h2 className="font-display mt-2 text-3xl font-semibold tracking-[-0.03em] text-text-primary">
        I miei contenuti
      </h2>
      <p className="mt-1 max-w-xl text-[14px] text-text-secondary">
        Gestisci tutta la libreria: modifica metadati o elimina file dal disco.
      </p>

      <div className="mt-8 overflow-hidden rounded-xl border border-white/[0.06] bg-surface/40">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 border-b border-white/[0.06] px-4 py-3 text-[10px] font-medium uppercase tracking-[0.2em] text-text-muted sm:grid-cols-[minmax(0,1fr)_140px_120px_auto]">
          <span>Titolo</span>
          <span className="hidden sm:block">Tipo</span>
          <span className="hidden sm:block">Anno</span>
          <span className="text-right">Azioni</span>
        </div>

        {sorted.length === 0 ? (
          <p className="px-4 py-10 text-center text-[14px] text-text-muted">
            Nessun contenuto in libreria.
          </p>
        ) : (
          <ul>
            {sorted.map((item, index) => {
              const title = episodeDisplayTitle(item);
              const isConfirming = confirmId === item.id;
              const isDeleting = deletingId === item.id;

              return (
                <motion.li
                  key={item.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(index * 0.02, 0.4) }}
                  className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-white/[0.04] px-4 py-3 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_140px_120px_auto]"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="h-12 w-8 shrink-0 overflow-hidden rounded bg-void/50">
                      <PosterImage item={item} variant="browse" />
                    </div>
                    <div className="min-w-0">
                      <p className="title-clip text-[14px] font-medium text-text-primary">
                        {title}
                      </p>
                      {item.seriesTitle && (
                        <p className="title-clip text-[12px] text-text-muted">
                          {item.seriesTitle}
                          {item.season != null && item.episode != null
                            ? ` · S${String(item.season).padStart(2, "0")}E${String(item.episode).padStart(2, "0")}`
                            : ""}
                        </p>
                      )}
                      <p className="title-clip text-[11px] text-text-muted sm:hidden">
                        {mediaTypeLabel(item.mediaType)}
                        {item.year ? ` · ${item.year}` : ""}
                      </p>
                    </div>
                  </div>

                  <span className="hidden text-[13px] text-text-secondary sm:block">
                    {mediaTypeLabel(item.mediaType)}
                  </span>
                  <span className="hidden text-[13px] tabular-nums text-text-secondary sm:block">
                    {item.year ?? "—"}
                  </span>

                  <div className="flex shrink-0 items-center justify-end gap-1.5">
                    <button
                      type="button"
                      onClick={() => onPlay(item.id)}
                      className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/[0.08] text-text-secondary transition-colors hover:border-white/15 hover:text-text-primary"
                      title="Riproduci"
                    >
                      <Play className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setConfirmId(null);
                        onEdit(item.id);
                      }}
                      className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/[0.08] text-text-secondary transition-colors hover:border-accent/30 hover:text-accent"
                      title="Modifica"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDelete(item.id)}
                      disabled={isDeleting}
                      className={`flex h-8 items-center justify-center gap-1.5 rounded-lg border px-2.5 text-[11px] font-medium transition-colors disabled:opacity-50 ${
                        isConfirming
                          ? "border-warm/40 bg-warm/10 text-warm"
                          : "border-white/[0.08] text-text-secondary hover:border-warm/30 hover:text-warm"
                      }`}
                      title={
                        isConfirming
                          ? "Clicca di nuovo per eliminare il file"
                          : "Elimina"
                      }
                    >
                      {isDeleting ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" />
                      )}
                      {isConfirming && (
                        <span className="hidden sm:inline">Conferma</span>
                      )}
                    </button>
                  </div>
                </motion.li>
              );
            })}
          </ul>
        )}
      </div>

      {confirmId && (
        <p className="mt-4 text-[12px] text-warm/90">
          L&apos;eliminazione rimuove il file video dal disco. Clicca di nuovo
          il cestino per confermare.
        </p>
      )}
    </div>
  );
}
