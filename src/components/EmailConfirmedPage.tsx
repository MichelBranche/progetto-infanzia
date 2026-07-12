import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { AlertCircle, CheckCircle2, Loader2, X } from "lucide-react";
import { completeEmailConfirmationFromUrl } from "../lib/completeEmailConfirmation";

type PageState = "loading" | "success" | "error";

export function EmailConfirmedPage() {
  const [state, setState] = useState<PageState>("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const result = await completeEmailConfirmationFromUrl();
      if (cancelled) return;

      if (result.ok) {
        setState("success");
        return;
      }

      setErrorMessage(result.message);
      setState("error");
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="relative flex min-h-[100dvh] flex-col items-center justify-center overflow-auto bg-void px-6 py-12">
      <div className="noise-overlay pointer-events-none absolute inset-0 opacity-30" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_0%,rgba(107,127,255,0.12),transparent)]" />

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative w-full max-w-md text-center"
      >
        <div className="mx-auto mb-8 flex h-14 w-14 items-center justify-center rounded-2xl border border-white/[0.12] bg-white/[0.04]">
          <span className="font-display text-[2rem] font-black italic tracking-[-0.06em] text-text-primary">
            B
          </span>
        </div>

        {state === "loading" && (
          <>
            <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-full bg-white/[0.06]">
              <Loader2 className="h-6 w-6 animate-spin text-text-muted" />
            </div>
            <h1 className="font-display text-[1.75rem] font-semibold tracking-[-0.03em] text-text-primary">
              Conferma in corso…
            </h1>
            <p className="mt-3 text-[14px] leading-relaxed text-text-secondary">
              Attendi un attimo mentre verifichiamo il tuo account.
            </p>
          </>
        )}

        {state === "success" && (
          <>
            <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/15">
              <CheckCircle2 className="h-6 w-6 text-emerald-400" />
            </div>
            <h1 className="font-display text-[1.75rem] font-semibold tracking-[-0.03em] text-text-primary">
              Registrazione riuscita
            </h1>
            <p className="mt-3 text-[15px] leading-relaxed text-text-secondary">
              Il tuo account è stato confermato.
            </p>
            <div className="mt-8 rounded-2xl border border-white/[0.08] bg-white/[0.03] px-5 py-4 text-left">
              <p className="text-[14px] leading-relaxed text-text-primary">
                Chiudi questa scheda e torna all&apos;app Branchefy per accedere con
                email e password.
              </p>
              <p className="mt-3 flex items-start gap-2 text-[13px] leading-relaxed text-text-muted">
                <X className="mt-0.5 h-4 w-4 shrink-0 opacity-70" />
                Puoi chiudere questa finestra: non serve fare altro qui.
              </p>
            </div>
          </>
        )}

        {state === "error" && (
          <>
            <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-full bg-red-500/15">
              <AlertCircle className="h-6 w-6 text-red-400" />
            </div>
            <h1 className="font-display text-[1.75rem] font-semibold tracking-[-0.03em] text-text-primary">
              Conferma non riuscita
            </h1>
            <p className="mt-3 text-[14px] leading-relaxed text-text-secondary">
              {errorMessage ??
                "Il link non è valido. Richiedi una nuova email di conferma dall'app."}
            </p>
            <p className="mt-6 text-[13px] leading-relaxed text-text-muted">
              Torna all&apos;app, registrati di nuovo o contatta il supporto se il
              problema continua.
            </p>
          </>
        )}
      </motion.div>
    </div>
  );
}
