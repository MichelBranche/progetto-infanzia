import { useEffect, useState } from "react";
import { AlertTriangle, Download, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { checkWebAppUpdate, reloadWebApp } from "../lib/webAppUpdate";
import { playUpdateNotificationSound } from "../lib/updateNotificationSound";

export function WebEssentialUpdateBanner() {
  const [open, setOpen] = useState(false);
  const [remoteVersion, setRemoteVersion] = useState<string | null>(null);
  const [reloading, setReloading] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      const update = await checkWebAppUpdate();
      if (cancelled || !update.needsReload) return;
      setRemoteVersion(update.remoteVersion ?? null);
      setOpen(true);
      playUpdateNotificationSound();
    };

    void run();
    const timer = window.setInterval(() => {
      void run();
    }, 5 * 60 * 1000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[120] flex items-end justify-center bg-black/70 p-4 backdrop-blur-md sm:items-center sm:p-6"
        >
          <motion.div
            role="alertdialog"
            aria-labelledby="web-essential-update-title"
            aria-describedby="web-essential-update-desc"
            initial={{ opacity: 0, y: 24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98 }}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-warm/30 bg-[#120a0a] shadow-[0_32px_80px_rgba(0,0,0,0.7)]"
          >
            <div className="pointer-events-none absolute inset-x-0 top-0 h-36 bg-gradient-to-b from-warm/25 via-warm/5 to-transparent" />

            <div className="relative px-6 pb-5 pt-6 sm:px-7 sm:pt-7">
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-warm/30 bg-warm/10 shadow-[0_0_32px_rgba(251,146,60,0.15)]">
                  <AlertTriangle className="h-5 w-5 text-warm" />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.32em] text-warm">
                    Aggiornamento importante essenziale
                  </p>
                  <h2
                    id="web-essential-update-title"
                    className="font-display mt-1.5 text-[clamp(1.45rem,3vw,1.8rem)] font-semibold leading-tight tracking-[-0.03em] text-text-primary"
                  >
                    È disponibile una nuova versione
                    {remoteVersion ? ` (${remoteVersion})` : ""}
                  </h2>
                  <p
                    id="web-essential-update-desc"
                    className="mt-3 text-[13px] leading-relaxed text-text-secondary"
                  >
                    Questo aggiornamento ripristina la riproduzione di film e serie e
                    migliora la stabilità del player. Ricarica la pagina per applicarlo
                    subito.
                  </p>
                </div>
              </div>
            </div>

            <div className="relative border-t border-white/[0.06] bg-black/30 px-6 py-4 sm:px-7">
              <button
                type="button"
                disabled={reloading}
                onClick={() => {
                  setReloading(true);
                  reloadWebApp();
                }}
                className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-warm px-5 py-3 text-[13px] font-semibold text-void transition-transform hover:scale-[1.01] active:scale-[0.99] disabled:opacity-70"
              >
                {reloading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Download className="h-4 w-4" />
                )}
                {reloading ? "Aggiornamento in corso…" : "Aggiorna ora"}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
