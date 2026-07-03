import { motion } from "framer-motion";
import { Play } from "lucide-react";
import type { MediaItem } from "../types/media";
import { PosterImage } from "./PosterImage";

interface BrowseHeroProps {
  title: string;
  subtitle?: string;
  syncing?: boolean;
  count?: number;
  featured?: MediaItem;
  onPlayFeatured?: () => void;
}

const fadeUp = {
  initial: { opacity: 0, y: 28 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.65, ease: [0.22, 1, 0.36, 1] as const },
};

export function BrowseHero({
  title,
  subtitle,
  syncing,
  count,
  featured,
  onPlayFeatured,
}: BrowseHeroProps) {
  return (
    <div className="relative h-[38vh] min-h-[260px] max-h-[480px] w-full shrink-0 overflow-hidden bg-black sm:h-[42vh] sm:min-h-[300px]">
      {featured ? (
        <motion.div
          className="absolute inset-0 ken-burns"
          initial={{ opacity: 0, scale: 1.08 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }}
        >
          <PosterImage
            item={featured}
            variant="browse"
            className="opacity-75"
          />
        </motion.div>
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-surface via-void to-black" />
      )}

      <div className="absolute inset-0 bg-gradient-to-t from-void via-void/75 to-void/20" />
      <div className="absolute inset-0 bg-gradient-to-r from-void/90 via-void/40 to-transparent" />
      <div className="hero-vignette absolute inset-0" />

      <div className="page-px relative flex h-full flex-col justify-end pb-10 pt-28 sm:pb-14 sm:pt-32">
        <motion.div {...fadeUp} className="max-w-3xl">
          {count != null && count > 0 && (
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-white/50">
              {count.toLocaleString("it-IT")} titoli
            </p>
          )}
          <h1 className="font-display text-[clamp(2rem,4.5vw,3.5rem)] font-bold leading-[0.95] tracking-[-0.03em] text-white drop-shadow-[0_4px_32px_rgba(0,0,0,0.5)]">
            {title}
          </h1>
          {subtitle && (
            <p className="mt-3 max-w-xl text-[14px] leading-relaxed text-white/65 sm:text-[15px]">
              {subtitle}
              {syncing && (
                <span className="ml-2 text-white/40">
                  · Aggiornamento catalogo…
                </span>
              )}
            </p>
          )}

          {featured && onPlayFeatured && (
            <motion.button
              type="button"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.25, duration: 0.45 }}
              onClick={() => onPlayFeatured()}
              className="mt-6 flex items-center gap-2.5 rounded-[4px] bg-white px-6 py-2.5 text-[14px] font-semibold text-black shadow-[0_8px_24px_rgba(0,0,0,0.35)] transition-transform hover:scale-[1.02] hover:bg-white/95 active:scale-[0.98]"
            >
              <Play className="h-4 w-4 fill-black" />
              Guarda in evidenza
            </motion.button>
          )}
        </motion.div>
      </div>
    </div>
  );
}
