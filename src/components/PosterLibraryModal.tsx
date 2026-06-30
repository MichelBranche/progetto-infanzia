import { motion } from "framer-motion";
import { convertFileSrc } from "@tauri-apps/api/core";
import { X } from "lucide-react";
import type { PosterAsset } from "../types/media";

interface PosterLibraryModalProps {
  open: boolean;
  title: string;
  assets: PosterAsset[];
  onClose: () => void;
  onSelect: (path: string) => void;
}

export function PosterLibraryModal({
  open,
  title,
  assets,
  onClose,
  onSelect,
}: PosterLibraryModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-2xl border border-white/10 bg-surface shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <div>
            <h2 className="font-display text-lg font-semibold text-text-primary">
              {title}
            </h2>
            <p className="mt-0.5 text-[12px] text-text-muted">
              Riutilizza una copertina già presente in libreria
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full text-text-muted hover:bg-white/5 hover:text-text-primary"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {assets.length === 0 ? (
          <div className="px-5 py-12 text-center text-[14px] text-text-muted">
            Nessuna copertina salvata ancora.
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 overflow-y-auto p-5 sm:grid-cols-3">
            {assets.map((asset) => (
              <button
                key={asset.path}
                type="button"
                onClick={() => onSelect(asset.path)}
                className="group overflow-hidden rounded-xl border border-white/[0.06] bg-white/[0.02] text-left transition-colors hover:border-accent/30 hover:bg-white/[0.04]"
              >
                <div className="aspect-[2/3] overflow-hidden bg-void/40">
                  <img
                    src={convertFileSrc(asset.path)}
                    alt={asset.label}
                    className="h-full w-full object-cover transition-transform group-hover:scale-105"
                  />
                </div>
                <div className="p-2.5">
                  <p className="line-clamp-2 text-[12px] font-medium text-text-primary">
                    {asset.label}
                  </p>
                  <p className="mt-0.5 text-[10px] uppercase tracking-wider text-text-muted">
                    {asset.kind === "series"
                      ? "Serie"
                      : asset.kind === "episode"
                        ? "Episodio"
                        : "Film"}
                  </p>
                </div>
              </button>
            ))}
          </div>
        )}
      </motion.div>
    </div>
  );
}
