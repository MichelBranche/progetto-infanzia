import { Download, Loader2, Sparkles, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import type { UpdaterPhase, UpdaterProgress } from "../lib/appUpdater";
import type { Update } from "@tauri-apps/plugin-updater";

interface UpdatePromptProps {
  open: boolean;
  phase: UpdaterPhase;
  update: Update | null;
  progress: UpdaterProgress;
  error: string | null;
  onInstall: () => void;
  onDismiss: () => void;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function UpdatePrompt({
  open,
  phase,
  update,
  progress,
  error,
  onInstall,
  onDismiss,
}: UpdatePromptProps) {
  const busy = phase === "downloading" || phase === "installing";
  const percent =
    progress.total && progress.total > 0
      ? Math.min(100, Math.round((progress.downloaded / progress.total) * 100))
      : null;

  return (
    <AnimatePresence>
      {open && update && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex items-end justify-center bg-black/50 p-4 sm:items-center"
        >
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98 }}
            className="relative w-full max-w-md rounded-2xl border border-white/10 bg-[#141414] p-5 shadow-2xl"
          >
            {!busy && (
              <button
                type="button"
                onClick={onDismiss}
                className="absolute right-3 top-3 rounded-full p-1.5 text-text-muted hover:bg-white/5 hover:text-text-primary"
                aria-label="Chiudi"
              >
                <X className="h-4 w-4" />
              </button>
            )}

            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent/15">
                <Sparkles className="h-5 w-5 text-accent" />
              </div>
              <div className="min-w-0 pr-6">
                <p className="text-[11px] font-medium uppercase tracking-wider text-accent">
                  Aggiornamento disponibile
                </p>
                <h3 className="mt-1 font-display text-xl font-semibold text-text-primary">
                  Branchefy {update.version}
                </h3>
                {update.body && (
                  <p className="mt-2 whitespace-pre-wrap text-[13px] leading-relaxed text-text-secondary">
                    {update.body}
                  </p>
                )}
              </div>
            </div>

            {busy && (
              <div className="mt-5">
                <div className="mb-2 flex items-center justify-between text-[12px] text-text-muted">
                  <span>
                    {phase === "installing"
                      ? "Installazione in corso…"
                      : "Download in corso…"}
                  </span>
                  {percent != null && <span>{percent}%</span>}
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full bg-accent transition-[width] duration-200"
                    style={{ width: `${percent ?? 12}%` }}
                  />
                </div>
                {progress.total != null && progress.total > 0 && (
                  <p className="mt-2 text-[11px] text-text-muted">
                    {formatBytes(progress.downloaded)} / {formatBytes(progress.total)}
                  </p>
                )}
              </div>
            )}

            {error && (
              <p className="mt-4 rounded-xl border border-warm/20 bg-warm/10 px-3 py-2 text-[12px] text-warm">
                {error}
              </p>
            )}

            {!busy && (
              <div className="mt-5 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={onInstall}
                  className="inline-flex items-center gap-2 rounded-full bg-text-primary px-4 py-2 text-[12px] font-medium text-void"
                >
                  <Download className="h-3.5 w-3.5" />
                  Installa e riavvia
                </button>
                <button
                  type="button"
                  onClick={onDismiss}
                  className="rounded-full border border-white/10 px-4 py-2 text-[12px] text-text-secondary hover:bg-white/[0.04]"
                >
                  Più tardi
                </button>
              </div>
            )}

            {busy && (
              <div className="mt-5 flex items-center gap-2 text-[12px] text-text-muted">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Non chiudere l&apos;app durante l&apos;aggiornamento
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
