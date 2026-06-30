import { useState, useEffect, useRef, useCallback, type DragEvent } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { convertFileSrc } from "@tauri-apps/api/core";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { motion } from "framer-motion";
import {
  FileVideo,
  ImagePlus,
  Loader2,
  Check,
  X,
} from "lucide-react";
import { addMedia, listSeries, listPosters } from "../lib/api";
import { useProfile } from "../context/ProfileContext";
import type { SeriesRef } from "../lib/browse";
import { getSeriesEpisodes } from "../lib/browse";
import { useLibrary } from "../context/LibraryContext";
import type { MediaTypeOption, PosterAsset } from "../types/media";
import { mediaTypeOptions } from "./PosterImage";
import { PosterLibraryModal } from "./PosterLibraryModal";
import { CATEGORY_GROUPS } from "../data/categories";

interface AddMediaPageProps {
  onSuccess: () => void;
  onCancel: () => void;
  presetSeries?: SeriesRef | null;
}

function fileName(path: string) {
  return path.split(/[/\\]/).pop() ?? path;
}

const VIDEO_EXTENSIONS = new Set([
  "mp4",
  "mkv",
  "avi",
  "mov",
  "webm",
  "m4v",
  "wmv",
]);

const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "webp", "gif"]);

function fileExtension(path: string) {
  return path.split(".").pop()?.toLowerCase() ?? "";
}

function pathFromDroppedFile(file: File): string | null {
  return (file as File & { path?: string }).path ?? null;
}

export function AddMediaPage({ onSuccess, onCancel, presetSeries }: AddMediaPageProps) {
  const { activeProfile } = useProfile();
  const { library } = useLibrary();
  const [mediaType, setMediaType] = useState<MediaTypeOption>(
    presetSeries?.mediaType === "cartone"
      ? "cartone"
      : presetSeries?.mediaType === "serie"
        ? "serie"
        : "film",
  );
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [seriesTitle, setSeriesTitle] = useState(presetSeries?.seriesTitle ?? "");
  const [seriesPicker, setSeriesPicker] = useState(
    presetSeries ? presetSeries.seriesTitle : "__new__",
  );
  const [existingSeries, setExistingSeries] = useState<string[]>([]);
  const [season, setSeason] = useState("");
  const [episode, setEpisode] = useState("");
  const [videoPath, setVideoPath] = useState<string | null>(null);
  const [posterPath, setPosterPath] = useState<string | null>(null);
  const [posterPreview, setPosterPreview] = useState<string | null>(null);
  const [seriesPosterPath, setSeriesPosterPath] = useState<string | null>(null);
  const [seriesPosterPreview, setSeriesPosterPreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [activeDropId, setActiveDropId] = useState<string | null>(null);
  const [posterLibrary, setPosterLibrary] = useState<PosterAsset[]>([]);
  const [posterLibraryTarget, setPosterLibraryTarget] = useState<
    "series" | "episode" | null
  >(null);
  const dropHandlersRef = useRef(new Map<string, (path: string) => void>());

  const registerDropHandler = useCallback(
    (dropId: string, handler: (path: string) => void) => {
      dropHandlersRef.current.set(dropId, handler);
    },
    [],
  );

  useEffect(() => {
    let unlisten: (() => void) | undefined;

    getCurrentWebview()
      .onDragDropEvent((event) => {
        const { payload } = event;

        if (payload.type === "over" || payload.type === "enter") {
          const ratio = window.devicePixelRatio || 1;
          const target = document
            .elementFromPoint(payload.position.x / ratio, payload.position.y / ratio)
            ?.closest<HTMLElement>("[data-drop-id]");
          setActiveDropId(target?.dataset.dropId ?? null);
          return;
        }

        if (payload.type === "leave") {
          setActiveDropId(null);
          return;
        }

        if (payload.type === "drop") {
          const path = payload.paths[0];
          const ratio = window.devicePixelRatio || 1;
          const target = document
            .elementFromPoint(payload.position.x / ratio, payload.position.y / ratio)
            ?.closest<HTMLElement>("[data-drop-id]");
          const dropId = target?.dataset.dropId;
          if (path && dropId) {
            dropHandlersRef.current.get(dropId)?.(path);
          }
          setActiveDropId(null);
        }
      })
      .then((fn) => {
        unlisten = fn;
      });

    return () => {
      unlisten?.();
    };
  }, []);

  useEffect(() => {
    listPosters()
      .then(setPosterLibrary)
      .catch(() => setPosterLibrary([]));
  }, []);

  useEffect(() => {
    if (!presetSeries) return;
    setMediaType(
      presetSeries.mediaType === "cartone" ? "cartone" : "serie",
    );
    setSeriesPicker(presetSeries.seriesTitle);
    setSeriesTitle(presetSeries.seriesTitle);
  }, [presetSeries]);

  useEffect(() => {
    if (mediaType !== "serie" && mediaType !== "cartone") return;
    listSeries(mediaType)
      .then(setExistingSeries)
      .catch(() => setExistingSeries([]));
  }, [mediaType]);

  useEffect(() => {
    if (seriesPicker === "__new__") return;
    setSeriesTitle(seriesPicker);
    if (!library) return;
    const episodes = getSeriesEpisodes(library.items, {
      mediaType,
      seriesTitle: seriesPicker,
    });
    if (episodes.length === 0) {
      setSeason("1");
      setEpisode("1");
      return;
    }
    const last = episodes[episodes.length - 1];
    setSeason(String(last.season ?? 1));
    setEpisode(String((last.episode ?? episodes.length) + 1));
  }, [seriesPicker, library, mediaType]);

  const setVideoFromPath = (path: string) => {
    if (!VIDEO_EXTENSIONS.has(fileExtension(path))) {
      setError("Formato video non supportato");
      return;
    }
    setVideoPath(path);
    setError(null);
  };

  const setPosterFromPath = (path: string) => {
    if (!IMAGE_EXTENSIONS.has(fileExtension(path))) {
      setError("Formato immagine non supportato");
      return;
    }
    setPosterPath(path);
    setPosterPreview(convertFileSrc(path));
    setError(null);
  };

  const setSeriesPosterFromPath = (path: string) => {
    if (!IMAGE_EXTENSIONS.has(fileExtension(path))) {
      setError("Formato immagine non supportato");
      return;
    }
    setSeriesPosterPath(path);
    setSeriesPosterPreview(convertFileSrc(path));
    setError(null);
  };

  const pickVideo = async () => {
    const selected = await open({
      multiple: false,
      filters: [
        {
          name: "Video",
          extensions: ["mp4", "mkv", "avi", "mov", "webm", "m4v", "wmv"],
        },
      ],
    });
    if (selected && typeof selected === "string") {
      setVideoFromPath(selected);
    }
  };

  const pickPoster = async () => {
    const selected = await open({
      multiple: false,
      filters: [
        {
          name: "Immagini",
          extensions: ["png", "jpg", "jpeg", "webp", "gif"],
        },
      ],
    });
    if (selected && typeof selected === "string") {
      setPosterFromPath(selected);
    }
  };

  const pickSeriesPoster = async () => {
    const selected = await open({
      multiple: false,
      filters: [
        {
          name: "Immagini",
          extensions: ["png", "jpg", "jpeg", "webp", "gif"],
        },
      ],
    });
    if (selected && typeof selected === "string") {
      setSeriesPosterFromPath(selected);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!title.trim()) {
      setError("Inserisci un titolo");
      return;
    }
    if (!videoPath) {
      setError("Seleziona un file video");
      return;
    }
    if (mediaType === "serie" && !seriesTitle.trim()) {
      setError("Inserisci il nome della serie");
      return;
    }
    if (
      mediaType === "cartone" &&
      (season || episode) &&
      !seriesTitle.trim()
    ) {
      setError("Inserisci il nome del cartone / serie");
      return;
    }

    setSubmitting(true);
    try {
      if (!activeProfile) throw new Error("Nessun profilo attivo");
      await addMedia(activeProfile.id, {
        mediaType,
        title: title.trim(),
        description: description.trim() || undefined,
        tag: category || undefined,
        seriesTitle:
          mediaType === "serie" || mediaType === "cartone"
            ? seriesTitle.trim() || undefined
            : undefined,
        season: season ? Number(season) : undefined,
        episode: episode ? Number(episode) : undefined,
        videoSourcePath: videoPath,
        posterSourcePath: posterPath ?? undefined,
        seriesPosterSourcePath: seriesPosterPath ?? undefined,
      });
      setSuccess(true);
      setTimeout(() => onSuccess(), 900);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  const isSerie = mediaType === "serie";
  const isCartone = mediaType === "cartone";
  const isEpisodic = isSerie || isCartone;

  return (
    <div className="min-h-full page-px pb-16 pt-24 sm:pt-28">
      <div className="mx-auto max-w-3xl">
        <div className="mb-10">
          <span className="font-display text-xs tabular-nums text-text-muted">
            —
          </span>
          <h1 className="font-display mt-2 text-3xl font-semibold tracking-[-0.03em] text-text-primary">
            Aggiungi contenuto
          </h1>
          <p className="mt-2 text-[14px] text-text-secondary">
            Compila i dettagli e scegli i file da importare nella libreria.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-8">
          <section>
            <label className="mb-3 block text-[11px] font-medium uppercase tracking-[0.2em] text-text-muted">
              Tipologia
            </label>
            <div className="grid gap-3 sm:grid-cols-3">
              {mediaTypeOptions.map((opt) => {
                const Icon = opt.icon;
                const active = mediaType === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setMediaType(opt.id)}
                    className={`rounded-xl border p-4 text-left transition-all ${
                      active
                        ? "border-accent/40 bg-accent/10"
                        : "border-white/[0.06] bg-white/[0.02] hover:border-white/10"
                    }`}
                  >
                    <Icon
                      className={`mb-3 h-5 w-5 ${active ? "text-accent" : "text-text-muted"}`}
                      strokeWidth={1.5}
                    />
                    <p className="text-[14px] font-medium text-text-primary">
                      {opt.label}
                    </p>
                    <p className="mt-0.5 text-[12px] text-text-muted">
                      {opt.description}
                    </p>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="grid gap-5 sm:grid-cols-2">
            <Field
              label={
                isSerie || isCartone
                  ? "Titolo episodio / film"
                  : "Titolo"
              }
              required
            >
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={
                  isEpisodic
                    ? "es. Il primo viaggio"
                    : "es. Il Re Leone"
                }
                className={inputClass}
              />
            </Field>

            {isEpisodic && (
              <Field
                label={isCartone ? "Cartone / serie" : "Serie TV"}
                required={isSerie}
              >
                <select
                  value={seriesPicker}
                  onChange={(e) => {
                    const value = e.target.value;
                    setSeriesPicker(value);
                    if (value === "__new__") {
                      if (!presetSeries) setSeriesTitle("");
                    } else {
                      setSeriesTitle(value);
                    }
                  }}
                  disabled={Boolean(presetSeries)}
                  className={inputClass}
                >
                  <option value="__new__">Nuova serie…</option>
                  {existingSeries.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
                {(seriesPicker === "__new__" || presetSeries) && (
                  <input
                    value={seriesTitle}
                    onChange={(e) => setSeriesTitle(e.target.value)}
                    placeholder={
                      isCartone ? "es. Dragon Ball" : "es. Avatar"
                    }
                    className={`${inputClass} mt-3`}
                    readOnly={Boolean(presetSeries)}
                  />
                )}
              </Field>
            )}

            {isEpisodic && (
              <>
                <Field label="Stagione">
                  <input
                    type="number"
                    min={1}
                    value={season}
                    onChange={(e) => setSeason(e.target.value)}
                    placeholder="1"
                    className={inputClass}
                  />
                </Field>
                <Field label="Episodio">
                  <input
                    type="number"
                    min={1}
                    value={episode}
                    onChange={(e) => setEpisode(e.target.value)}
                    placeholder="1"
                    className={inputClass}
                  />
                </Field>
              </>
            )}
          </section>

          <Field label="Categoria">
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
          </Field>

          <Field label="Descrizione">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              placeholder="Una nota, un ricordo, perché è speciale..."
              className={`${inputClass} resize-none`}
            />
          </Field>

          <section
            className={`grid gap-5 ${isEpisodic ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}
          >
            <FilePickerCard
              dropId="video"
              label="File multimediale"
              required
              icon={FileVideo}
              fileName={videoPath ? fileName(videoPath) : null}
              emptyText="Trascina o seleziona video"
              accept="video"
              isDropTarget={activeDropId === "video"}
              onPick={pickVideo}
              onFilePath={setVideoFromPath}
              registerDropHandler={registerDropHandler}
            />
            {isEpisodic && (
              <FilePickerCard
                dropId="series-poster"
                label="Copertina serie"
                hint="Immagine principale del cartone o della serie TV"
                icon={ImagePlus}
                fileName={
                  seriesPosterPath ? fileName(seriesPosterPath) : null
                }
                emptyText="Trascina o seleziona immagine"
                accept="image"
                isDropTarget={activeDropId === "series-poster"}
                onPick={pickSeriesPoster}
                onFilePath={setSeriesPosterFromPath}
                onOpenLibrary={
                  posterLibrary.length > 0
                    ? () => setPosterLibraryTarget("series")
                    : undefined
                }
                registerDropHandler={registerDropHandler}
                preview={seriesPosterPreview}
                onClear={
                  seriesPosterPath
                    ? () => {
                        setSeriesPosterPath(null);
                        setSeriesPosterPreview(null);
                      }
                    : undefined
                }
              />
            )}
            <FilePickerCard
              dropId="episode-poster"
              label={isEpisodic ? "Copertina episodio" : "Copertina"}
              hint={
                isEpisodic
                  ? "Opzionale: immagine specifica per questo episodio"
                  : undefined
              }
              icon={ImagePlus}
              fileName={posterPath ? fileName(posterPath) : null}
              emptyText="Trascina o seleziona immagine"
              accept="image"
              isDropTarget={activeDropId === "episode-poster"}
              onPick={pickPoster}
              onFilePath={setPosterFromPath}
              onOpenLibrary={
                posterLibrary.length > 0
                  ? () => setPosterLibraryTarget("episode")
                  : undefined
              }
              registerDropHandler={registerDropHandler}
              preview={posterPreview}
              onClear={
                posterPath
                  ? () => {
                      setPosterPath(null);
                      setPosterPreview(null);
                    }
                  : undefined
              }
            />
          </section>

          {error && (
            <motion.p
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-lg border border-warm/20 bg-warm/10 px-4 py-3 text-[13px] text-warm"
            >
              {error}
            </motion.p>
          )}

          <div className="flex items-center gap-3 pt-2">
            <button
              type="submit"
              disabled={submitting || success}
              className="inline-flex items-center gap-2 rounded-full bg-text-primary px-6 py-3 text-[13px] font-medium text-void transition-all hover:bg-white disabled:opacity-50"
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : success ? (
                <Check className="h-4 w-4" />
              ) : null}
              {success
                ? "Aggiunto!"
                : submitting
                  ? "Importazione..."
                  : "Aggiungi alla libreria"}
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="rounded-full border border-white/10 px-5 py-3 text-[13px] text-text-secondary transition-colors hover:border-white/20 hover:text-text-primary"
            >
              Annulla
            </button>
          </div>
        </form>

        <PosterLibraryModal
          open={posterLibraryTarget !== null}
          title={
            posterLibraryTarget === "series"
              ? "Scegli copertina serie"
              : "Scegli copertina"
          }
          assets={posterLibrary}
          onClose={() => setPosterLibraryTarget(null)}
          onSelect={(path) => {
            if (posterLibraryTarget === "series") {
              setSeriesPosterFromPath(path);
            } else {
              setPosterFromPath(path);
            }
            setPosterLibraryTarget(null);
          }}
        />
      </div>
    </div>
  );
}

const inputClass =
  "w-full rounded-xl border border-white/[0.06] bg-white/[0.03] px-4 py-3 text-[14px] text-text-primary placeholder:text-text-muted outline-none transition-colors focus:border-accent/30 focus:bg-white/[0.05]";

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-[11px] font-medium uppercase tracking-[0.2em] text-text-muted">
        {label}
        {required && <span className="text-accent"> *</span>}
      </span>
      {children}
    </label>
  );
}

function FilePickerCard({
  dropId,
  label,
  hint,
  required,
  icon: Icon,
  fileName,
  emptyText,
  accept,
  isDropTarget = false,
  onPick,
  onFilePath,
  onOpenLibrary,
  registerDropHandler,
  preview,
  onClear,
}: {
  dropId: string;
  label: string;
  hint?: string;
  required?: boolean;
  icon: typeof FileVideo;
  fileName: string | null;
  emptyText: string;
  accept: "video" | "image";
  isDropTarget?: boolean;
  onPick: () => void;
  onFilePath: (path: string) => void;
  onOpenLibrary?: () => void;
  registerDropHandler: (dropId: string, handler: (path: string) => void) => void;
  preview?: string | null;
  onClear?: () => void;
}) {
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    registerDropHandler(dropId, onFilePath);
  }, [dropId, onFilePath, registerDropHandler]);

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);

    const file = event.dataTransfer.files[0];
    if (!file) return;

    const path = pathFromDroppedFile(file);
    if (path) {
      onFilePath(path);
    }
  };

  const highlighted = isDragging || isDropTarget;

  return (
    <div>
      <span className="mb-2 block text-[11px] font-medium uppercase tracking-[0.2em] text-text-muted">
        {label}
        {required && <span className="text-accent"> *</span>}
      </span>
      {hint && (
        <p className="mb-2 text-[12px] leading-snug text-text-muted">{hint}</p>
      )}
      <div
        data-drop-id={dropId}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`group relative flex w-full flex-col overflow-hidden rounded-xl border border-dashed bg-white/[0.02] transition-colors ${
          highlighted
            ? "border-accent/50 bg-accent/10"
            : "border-white/10 hover:border-accent/30 hover:bg-white/[0.04]"
        }`}
      >
        <div className="flex aspect-[4/3] items-center justify-center">
          {preview ? (
            <img
              src={preview}
              alt="Anteprima copertina"
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex flex-col items-center gap-2 p-6 text-center">
              <div className="flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] transition-colors group-hover:border-accent/30">
                <Icon className="h-5 w-5 text-text-muted" strokeWidth={1.5} />
              </div>
              <p className="text-[13px] text-text-secondary">
                {fileName ?? emptyText}
              </p>
              {!fileName && (
                <p className="text-[11px] text-text-muted">
                  {accept === "video"
                    ? "MP4, MKV, AVI..."
                    : "PNG, JPG, WEBP..."}
                </p>
              )}
            </div>
          )}
        </div>
        <div className="flex border-t border-white/[0.06]">
          <button
            type="button"
            onClick={onPick}
            className="flex-1 px-3 py-2.5 text-[12px] text-text-secondary transition-colors hover:bg-white/[0.04] hover:text-text-primary"
          >
            {accept === "video" ? "Scegli file" : "Nuova immagine"}
          </button>
          {accept === "image" && onOpenLibrary && (
            <button
              type="button"
              onClick={onOpenLibrary}
              className="flex-1 border-l border-white/[0.06] px-3 py-2.5 text-[12px] text-text-secondary transition-colors hover:bg-white/[0.04] hover:text-text-primary"
            >
              Già in libreria
            </button>
          )}
        </div>
      </div>
      {onClear && (
        <button
          type="button"
          onClick={onClear}
          className="mt-2 inline-flex items-center gap-1 text-[11px] text-text-muted hover:text-text-secondary"
        >
          <X className="h-3 w-3" />
          Rimuovi copertina
        </button>
      )}
    </div>
  );
}
