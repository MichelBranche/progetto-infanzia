import { memo, useMemo } from "react";
import { motion } from "framer-motion";
import type { StremioMetaPreview } from "../types/stremio";
import type { StreamingRow } from "../lib/useStreamingCatalogs";
import {
  streamingBrowseItem,
  streamingPreviewDisplayName,
} from "../lib/streamingBrowse";
import { LoadingSpinner } from "./LoadingSpinner";

interface AnimePageProps {
  rows: StreamingRow[];
  previews: StremioMetaPreview[];
  loading: boolean;
  onPlayStreaming: (preview: StremioMetaPreview) => void;
  enrichStreamingPreview: (preview: StremioMetaPreview) => StremioMetaPreview;
}

function isBrowseableSaturn(preview: StremioMetaPreview) {
  if (preview.catalogPrefix !== "saturn") return false;
  const release = preview.releaseInfo?.trim() ?? "";
  if (release.includes("Prossimamente")) return false;
  if (release.includes("episodi") || release === "Episodio recente") return true;
  return !release && Boolean(preview.slug);
}

function canonicalKey(preview: StremioMetaPreview) {
  const name = streamingPreviewDisplayName(preview).toLowerCase();
  const base = name
    .replace(/\(ita\)|\(dub\)|\(sub\)/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  const season = preview.slug?.match(/season-(\d+)/i)?.[1];
  return season ? `${base}|s${season}` : base;
}

const STAGGER_CAP = 24;

const AnimeTile = memo(function AnimeTile({
  preview,
  index,
  onPlay,
}: {
  preview: StremioMetaPreview;
  index: number;
  onPlay: (preview: StremioMetaPreview) => void;
}) {
  const title = streamingPreviewDisplayName(preview);
  const meta = preview.releaseInfo?.trim();
  const stagger = index < STAGGER_CAP;

  return (
    <motion.button
      type="button"
      initial={stagger ? { opacity: 0, y: 12 } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={
        stagger
          ? { delay: Math.min(index * 0.02, 0.4) }
          : { duration: 0 }
      }
      onClick={() => onPlay(preview)}
      className="group w-full cursor-pointer text-left"
    >
      <div className="relative aspect-[2/3] overflow-hidden rounded-lg bg-[#14141c] ring-1 ring-white/[0.06] transition group-hover:ring-white/15">
        {preview.poster ? (
          <img
            src={preview.poster}
            alt={title}
            loading="eager"
            decoding="async"
            className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-indigo-950 to-violet-950 px-3 text-center text-[12px] text-white/70">
            {title}
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/25 to-transparent" />
        {meta && (
          <span className="absolute left-2 top-2 z-[2] max-w-[calc(100%-1rem)] truncate rounded bg-black/70 px-2 py-0.5 text-[10px] font-medium text-white/85 backdrop-blur-sm">
            {meta}
          </span>
        )}
        <div className="absolute inset-x-0 bottom-0 z-[2] p-2.5">
          <p className="line-clamp-2 text-[13px] font-semibold leading-snug text-white drop-shadow-sm">
            {title}
          </p>
        </div>
      </div>
    </motion.button>
  );
});

export function AnimePage({
  rows,
  previews,
  loading,
  onPlayStreaming,
  enrichStreamingPreview,
}: AnimePageProps) {
  const saturnRows = useMemo(
    () => rows.filter((row) => row.key.startsWith("saturn")),
    [rows],
  );

  const animePreviews = useMemo(() => {
    const best = new Map<string, StremioMetaPreview>();

    const consider = (raw: StremioMetaPreview) => {
      if (!isBrowseableSaturn(raw)) return;
      const preview = enrichStreamingPreview(raw);
      const key = canonicalKey(preview);
      const existing = best.get(key);
      if (!existing) {
        best.set(key, preview);
        return;
      }
      const score = (p: StremioMetaPreview) => {
        const release = p.releaseInfo ?? "";
        const eps = Number.parseInt(release.match(/(\d+)\s*episod/i)?.[1] ?? "0", 10);
        let s = eps * 100;
        if (release.includes("Dub")) s -= 120;
        if (p.name.toLowerCase().includes("ita")) s += 40;
        return s;
      };
      if (score(preview) > score(existing)) {
        best.set(key, preview);
      }
    };

    for (const row of saturnRows) {
      for (const item of row.items) consider(item);
    }
    for (const preview of previews) consider(preview);

    return [...best.values()].sort((a, b) =>
      streamingPreviewDisplayName(a).localeCompare(
        streamingPreviewDisplayName(b),
        "it",
        { sensitivity: "base" },
      ),
    );
  }, [saturnRows, previews, enrichStreamingPreview]);

  const browseItems = useMemo(
    () => animePreviews.map((preview) => streamingBrowseItem(preview)),
    [animePreviews],
  );

  return (
    <div className="page-px pb-16 pt-24 sm:pt-28">
      <span className="font-display text-[11px] tabular-nums text-text-muted sm:text-xs">
        —
      </span>
      <h1 className="font-display mt-2 text-3xl font-semibold tracking-[-0.03em] text-text-primary sm:text-4xl">
        Anime
      </h1>
      <p className="mt-2 max-w-prose text-[14px] text-text-secondary sm:text-[15px]">
        {animePreviews.length > 0
          ? `${animePreviews.length.toLocaleString("it-IT")} anime · Versioni duplicate e titoli senza episodi sono nascosti`
          : "Catalogo AnimeSaturn · Versioni duplicate e titoli senza episodi sono nascosti"}
      </p>

      {loading && browseItems.length === 0 ? (
        <div className="flex justify-center py-20">
          <LoadingSpinner size="md" className="border-t-accent" />
        </div>
      ) : animePreviews.length === 0 ? (
        <p className="mt-10 text-center text-[13px] text-text-muted">
          Nessun anime disponibile. Aggiorna il catalogo dalle impostazioni.
        </p>
      ) : (
        <div className="mt-8 page-px browse-grid">
          {animePreviews.map((preview, index) => (
            <AnimeTile
              key={`${preview.type}:${preview.id}`}
              preview={preview}
              index={index}
              onPlay={onPlayStreaming}
            />
          ))}
        </div>
      )}
    </div>
  );
}
