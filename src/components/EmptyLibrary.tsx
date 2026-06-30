import { motion } from "framer-motion";
import { FolderOpen, RefreshCw } from "lucide-react";

interface EmptyLibraryProps {
  mediaRoot: string;
  onRescan: () => void;
  scanning: boolean;
  onAdd?: () => void;
}

export function EmptyLibrary({
  mediaRoot,
  onRescan,
  scanning,
  onAdd,
}: EmptyLibraryProps) {
  return (
    <div className="page-px flex min-h-[60vh] flex-col items-center justify-center pt-24">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-md text-center"
      >
        <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-2xl border border-white/[0.06] bg-white/[0.03]">
          <FolderOpen className="h-6 w-6 text-text-muted" strokeWidth={1.5} />
        </div>

        <h2 className="font-display text-2xl font-semibold tracking-tight text-text-primary">
          Libreria vuota
        </h2>
        <p className="mt-3 text-[14px] leading-relaxed text-text-secondary">
          {onAdd
            ? "Aggiungi il tuo primo contenuto con il menu Aggiungi, oppure metti i file nelle cartelle film, cartoni o serie."
            : "La libreria è ancora vuota. Chiedi a papà o mamma di aggiungere qualcosa!"}
        </p>

        <p className="mt-4 text-[11px] text-text-muted">
          Cartella: {mediaRoot}
        </p>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          {onAdd && (
            <motion.button
              onClick={onAdd}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="inline-flex items-center gap-2 rounded-full bg-text-primary px-6 py-2.5 text-[13px] font-medium text-void transition-colors hover:bg-white"
            >
              Aggiungi contenuto
            </motion.button>
          )}
          {onAdd && (
            <motion.button
              onClick={onRescan}
            disabled={scanning}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-6 py-2.5 text-[13px] font-medium text-text-primary transition-colors hover:border-white/20 hover:bg-white/[0.08] disabled:opacity-50"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${scanning ? "animate-spin" : ""}`}
              strokeWidth={1.5}
            />
            {scanning ? "Scansione..." : "Aggiorna libreria"}
          </motion.button>
          )}
        </div>
      </motion.div>
    </div>
  );
}
