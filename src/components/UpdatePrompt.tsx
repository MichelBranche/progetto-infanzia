import { useEffect } from "react";
import {
  ArrowRight,
  Bug,
  Download,
  Loader2,
  Rocket,
  Sparkles,
  Wrench,
  X,
  Zap,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import type { UpdaterPhase, UpdaterProgress } from "../lib/appUpdater";
import {
  countUpdateNotesItems,
  parseUpdateNotes,
  updateNotesSectionKind,
  updateNotesSectionLabel,
  type UpdateNotesSectionKind,
} from "../lib/updateNotes";
import type { Update } from "@tauri-apps/plugin-updater";

interface UpdatePromptProps {
  open: boolean;
  phase: UpdaterPhase;
  update: Update | null;
  currentVersion?: string;
  progress: UpdaterProgress;
  error: string | null;
  onInstall: () => void;
  onDismiss: () => void;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function sectionIcon(kind: UpdateNotesSectionKind) {
  switch (kind) {
    case "features":
      return Sparkles;
    case "improvements":
      return Zap;
    case "fixes":
      return Bug;
    default:
      return Wrench;
  }
}

function sectionAccent(kind: UpdateNotesSectionKind): string {
  switch (kind) {
    case "features":
      return "text-mint border-mint/25 bg-mint/10";
    case "improvements":
      return "text-sky-300 border-sky-400/20 bg-sky-400/10";
    case "fixes":
      return "text-warm border-warm/25 bg-warm/10";
    default:
      return "text-text-muted border-white/10 bg-white/[0.04]";
  }
}

const listMotion = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.04, delayChildren: 0.06 },
  },
};

const itemMotion = {
  hidden: { opacity: 0, x: -8 },
  show: {
    opacity: 1,
    x: 0,
    transition: { duration: 0.35, ease: [0.22, 1, 0.36, 1] as const },
  },
};

export function UpdatePrompt({
  open,
  phase,
  update,
  currentVersion,
  progress,
  error,
  onInstall,
  onDismiss,
}: UpdatePromptProps) {
  const busy = phase === "downloading" || phase === "installing";
  const noteSections = parseUpdateNotes(update?.body);
  const noteCount = countUpdateNotesItems(noteSections);
  const percent =
    progress.total && progress.total > 0
      ? Math.min(100, Math.round((progress.downloaded / progress.total) * 100))
      : null;

  useEffect(() => {
    if (!open || busy) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onDismiss();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy, onDismiss]);

  return (
    <AnimatePresence>
      {open && update && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex items-end justify-center bg-black/65 p-4 backdrop-blur-md sm:items-center sm:p-6"
          onClick={!busy ? onDismiss : undefined}
        >
          <motion.div
            role="dialog"
            aria-labelledby="update-prompt-title"
            aria-describedby="update-prompt-desc"
            initial={{ opacity: 0, y: 28, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.98 }}
            transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0a0a0c] shadow-[0_32px_80px_rgba(0,0,0,0.65)]"
          >
            <div className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-accent/20 via-accent/5 to-transparent" />
            <div className="noise-overlay pointer-events-none absolute inset-0 opacity-[0.08]" />

            {!busy && (
              <button
                type="button"
                onClick={onDismiss}
                className="absolute right-3 top-3 z-10 rounded-full border border-white/10 bg-black/30 p-2 text-text-muted backdrop-blur-sm transition-colors hover:border-white/20 hover:text-text-primary"
                aria-label="Chiudi"
              >
                <X className="h-4 w-4" />
              </button>
            )}

            <div className="relative px-6 pb-5 pt-6 sm:px-7 sm:pt-7">
              <div className="flex items-start gap-4 pr-8">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-accent/25 bg-accent/10 shadow-[0_0_32px_rgba(94,234,212,0.12)]">
                  <Rocket className="h-5 w-5 text-accent" />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.32em] text-accent">
                    Aggiornamento
                  </p>
                  <h2
                    id="update-prompt-title"
                    className="font-display mt-1.5 text-[clamp(1.5rem,3vw,1.85rem)] font-semibold leading-none tracking-[-0.03em] text-text-primary"
                  >
                    Branchefy {update.version}
                  </h2>
                  <p
                    id="update-prompt-desc"
                    className="mt-2 flex flex-wrap items-center gap-2 text-[12px] text-text-muted"
                  >
                    {currentVersion && (
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 tabular-nums">
                        v{currentVersion}
                        <ArrowRight className="h-3 w-3 opacity-60" />
                        v{update.version}
                      </span>
                    )}
                    {noteCount > 0 && (
                      <span>
                        {noteCount}{" "}
                        {noteCount === 1 ? "modifica" : "modifiche"} in
                        changelog
                      </span>
                    )}
                  </p>
                </div>
              </div>

              {noteSections.length > 0 ? (
                <div className="mt-6 max-h-[min(42vh,280px)] space-y-4 overflow-y-auto pr-1">
                  {noteSections.map((section) => {
                    const kind = updateNotesSectionKind(section.title);
                    const Icon = sectionIcon(kind);
                    const label = section.title ?? updateNotesSectionLabel(kind);
                    return (
                      <div key={`${kind}-${label}`}>
                        <div className="mb-2.5 flex items-center gap-2">
                          <span
                            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] ${sectionAccent(kind)}`}
                          >
                            <Icon className="h-3 w-3" />
                            {label}
                          </span>
                          <span className="text-[11px] tabular-nums text-text-muted">
                            {section.items.length}
                          </span>
                        </div>
                        <motion.ul
                          variants={listMotion}
                          initial="hidden"
                          animate="show"
                          className="space-y-2"
                        >
                          {section.items.map((item) => (
                            <motion.li
                              key={item}
                              variants={itemMotion}
                              className="flex gap-3 rounded-xl border border-white/[0.04] bg-white/[0.02] px-3 py-2.5 text-[13px] leading-snug text-text-secondary"
                            >
                              <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-accent/70" />
                              <span>{item}</span>
                            </motion.li>
                          ))}
                        </motion.ul>
                      </div>
                    );
                  })}
                </div>
              ) : update.body ? (
                <p className="mt-5 whitespace-pre-wrap rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 text-[13px] leading-relaxed text-text-secondary">
                  {update.body}
                </p>
              ) : (
                <p className="mt-5 text-[13px] text-text-muted">
                  Miglioramenti e correzioni sono pronti per l&apos;installazione.
                </p>
              )}
            </div>

            <div className="relative border-t border-white/[0.06] bg-black/30 px-6 py-4 sm:px-7">
              {busy && (
                <div className="mb-4">
                  <div className="mb-2 flex items-center justify-between text-[12px]">
                    <span className="flex items-center gap-2 text-text-secondary">
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-accent" />
                      {phase === "installing"
                        ? "Installazione in corso…"
                        : "Download in corso…"}
                    </span>
                    {percent != null && (
                      <span className="font-medium tabular-nums text-text-primary">
                        {percent}%
                      </span>
                    )}
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-white/10">
                    <motion.div
                      className="h-full rounded-full bg-gradient-to-r from-accent/80 to-mint/80"
                      initial={{ width: 0 }}
                      animate={{ width: `${percent ?? 8}%` }}
                      transition={{ duration: 0.25, ease: "easeOut" }}
                    />
                  </div>
                  {progress.total != null && progress.total > 0 && (
                    <p className="mt-2 text-[11px] tabular-nums text-text-muted">
                      {formatBytes(progress.downloaded)} /{" "}
                      {formatBytes(progress.total)}
                    </p>
                  )}
                  <p className="mt-3 text-[11px] text-text-muted">
                    Non chiudere l&apos;app fino al riavvio automatico.
                  </p>
                </div>
              )}

              {error && (
                <div className="mb-4 rounded-xl border border-warm/25 bg-warm/10 px-3.5 py-3 text-[12px] leading-relaxed text-warm">
                  {error}
                </div>
              )}

              {!busy && (
                <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
                  <button
                    type="button"
                    onClick={onDismiss}
                    className="rounded-full border border-white/10 px-5 py-2.5 text-[12px] font-medium text-text-secondary transition-colors hover:border-white/20 hover:bg-white/[0.04] hover:text-text-primary"
                  >
                    Più tardi
                  </button>
                  <button
                    type="button"
                    onClick={onInstall}
                    className="inline-flex items-center justify-center gap-2 rounded-full bg-text-primary px-5 py-2.5 text-[12px] font-semibold text-void transition-transform hover:scale-[1.02] active:scale-[0.98]"
                  >
                    <Download className="h-4 w-4" />
                    {error ? "Riprova installazione" : "Installa e riavvia"}
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
