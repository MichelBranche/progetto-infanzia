import { useState } from "react";
import { motion } from "framer-motion";
import { Loader2, Trash2, X } from "lucide-react";
import type { MediaItem } from "../types/media";
import { episodeDisplayTitle } from "../lib/browse";
import { CATEGORY_GROUPS } from "../data/categories";
import { StreamingServicePicker } from "./StreamingBadges";

interface EditMediaModalProps {
  media: MediaItem;
  onClose: () => void;
  onSave: (input: {
    title: string;
    description?: string;
    seriesTitle?: string;
    season?: number;
    episode?: number;
    tag?: string;
    kidFriendly?: boolean;
    streamingServices?: string[];
  }) => Promise<void>;
  onDelete: () => Promise<void>;
  onEnrichTmdb?: () => Promise<MediaItem>;
}

const inputClass =
  "w-full rounded-xl border border-white/[0.06] bg-white/[0.03] px-4 py-3 text-[14px] text-text-primary placeholder:text-text-muted outline-none transition-colors focus:border-accent/30 focus:bg-white/[0.05]";

export function EditMediaModal({
  media,
  onClose,
  onSave,
  onDelete,
  onEnrichTmdb,
}: EditMediaModalProps) {
  const isEpisodic =
    media.mediaType === "serie" || media.mediaType === "cartone";
  const [title, setTitle] = useState(() => episodeDisplayTitle(media));
  const [description, setDescription] = useState(media.description ?? "");
  const [category, setCategory] = useState(media.tag ?? "");
  const [seriesTitle, setSeriesTitle] = useState(media.seriesTitle ?? "");
  const [season, setSeason] = useState(
    media.season ? String(media.season) : "",
  );
  const [episode, setEpisode] = useState(
    media.episode ? String(media.episode) : "",
  );
  const [kidFriendly, setKidFriendly] = useState(media.kidFriendly);
  const [streamingServices, setStreamingServices] = useState<string[]>(
    media.streamingServices ?? [],
  );
  const [submitting, setSubmitting] = useState(false);
  const [enriching, setEnriching] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError("Inserisci un titolo");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await onSave({
        title: title.trim(),
        description: description.trim() || undefined,
        tag: category || undefined,
        seriesTitle: isEpisodic ? seriesTitle.trim() || undefined : undefined,
        season: season ? Number(season) : undefined,
        episode: episode ? Number(episode) : undefined,
        kidFriendly,
        streamingServices,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleEnrichTmdb = async () => {
    if (!onEnrichTmdb) return;
    setEnriching(true);
    setError(null);
    try {
      const updated = await onEnrichTmdb();
      if (updated.description) setDescription(updated.description);
      if (updated.year) {
        // year shown via TMDB only on media object after refresh
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setEnriching(false);
    }
  };

  const handleDelete = async () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setDeleting(true);
    setError(null);
    try {
      await onDelete();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setConfirmDelete(false);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        className="relative w-full max-w-lg rounded-2xl border border-white/10 bg-surface p-6 shadow-2xl"
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full text-text-muted hover:bg-white/5 hover:text-text-primary"
        >
          <X className="h-4 w-4" />
        </button>

        <h2 className="font-display text-xl font-semibold text-text-primary">
          Modifica contenuto
        </h2>
        <p className="mt-1 text-[13px] text-text-muted">{media.fileName}</p>
        <p className="mt-2 text-[12px] text-text-muted">
          Eliminando un titolo, il file video viene rimosso dal disco.
        </p>

        <form onSubmit={handleSave} className="mt-6 space-y-4">
          <label className="block">
            <span className="mb-2 block text-[11px] font-medium uppercase tracking-[0.2em] text-text-muted">
              Titolo
            </span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className={inputClass}
            />
          </label>

          {isEpisodic && (
            <label className="block">
              <span className="mb-2 block text-[11px] font-medium uppercase tracking-[0.2em] text-text-muted">
                Nome serie
              </span>
              <input
                value={seriesTitle}
                onChange={(e) => setSeriesTitle(e.target.value)}
                className={inputClass}
              />
            </label>
          )}

          {isEpisodic && (
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="mb-2 block text-[11px] font-medium uppercase tracking-[0.2em] text-text-muted">
                  Stagione
                </span>
                <input
                  type="number"
                  min={1}
                  value={season}
                  onChange={(e) => setSeason(e.target.value)}
                  className={inputClass}
                />
              </label>
              <label className="block">
                <span className="mb-2 block text-[11px] font-medium uppercase tracking-[0.2em] text-text-muted">
                  Episodio
                </span>
                <input
                  type="number"
                  min={1}
                  value={episode}
                  onChange={(e) => setEpisode(e.target.value)}
                  className={inputClass}
                />
              </label>
            </div>
          )}

          <label className="block">
            <span className="mb-2 block text-[11px] font-medium uppercase tracking-[0.2em] text-text-muted">
              Categoria
            </span>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className={inputClass}
            >
              <option value="">Nessuna categoria</option>
              {CATEGORY_GROUPS.map((group) => (
                <optgroup key={group.label} label={group.label}>
                  {group.options.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-2 block text-[11px] font-medium uppercase tracking-[0.2em] text-text-muted">
              Descrizione
            </span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className={`${inputClass} resize-none`}
            />
          </label>

          <label className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3">
            <input
              type="checkbox"
              checked={kidFriendly}
              onChange={(e) => setKidFriendly(e.target.checked)}
              className="h-4 w-4 rounded border-white/20 accent-accent"
            />
            <span className="text-[13px] text-text-primary">
              Adatto ai bambini (visibile nei profili bambino)
            </span>
          </label>

          <div>
            <span className="mb-2 block text-[11px] font-medium uppercase tracking-[0.2em] text-text-muted">
              Disponibile anche su
            </span>
            <p className="mb-2 text-[12px] text-text-muted">
              Apre la ricerca sul servizio streaming (non riproduce qui)
            </p>
            <StreamingServicePicker
              selected={streamingServices}
              onChange={setStreamingServices}
            />
          </div>

          {error && (
            <p className="rounded-lg border border-warm/20 bg-warm/10 px-3 py-2 text-[13px] text-warm">
              {error}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-3 pt-2">
            {onEnrichTmdb && (
              <button
                type="button"
                onClick={() => void handleEnrichTmdb()}
                disabled={submitting || enriching || deleting}
                className="inline-flex items-center gap-2 rounded-full border border-white/10 px-5 py-2.5 text-[13px] text-text-secondary hover:border-white/20 disabled:opacity-50"
              >
                {enriching && <Loader2 className="h-4 w-4 animate-spin" />}
                Cerca su TMDB
              </button>
            )}
            <button
              type="submit"
              disabled={submitting || deleting}
              className="inline-flex items-center gap-2 rounded-full bg-text-primary px-5 py-2.5 text-[13px] font-medium text-void hover:bg-white disabled:opacity-50"
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              Salva modifiche
            </button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={submitting || deleting}
              className={`inline-flex items-center gap-2 rounded-full border px-5 py-2.5 text-[13px] transition-colors disabled:opacity-50 ${
                confirmDelete
                  ? "border-warm/40 bg-warm/10 text-warm"
                  : "border-white/10 text-text-secondary hover:border-warm/30 hover:text-warm"
              }`}
            >
              {deleting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
              {confirmDelete ? "Conferma eliminazione" : "Elimina dalla libreria"}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
