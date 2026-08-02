import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { AlertCircle, CheckCircle2, Eye, EyeOff, Loader2, KeyRound } from "lucide-react";
import { completePasswordRecoveryFromUrl } from "../lib/completePasswordRecovery";
import { updatePassword, signOutCloud } from "../lib/cloudAuth";

type PageState = "loading" | "form" | "success" | "error";

export function ResetPasswordPage() {
  const [state, setState] = useState<PageState>("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const result = await completePasswordRecoveryFromUrl();
      if (cancelled) return;

      if (result.ok) {
        setState("form");
        return;
      }

      setErrorMessage(result.message);
      setState("error");
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const submit = async () => {
    setBusy(true);
    setErrorMessage(null);
    try {
      if (password.length < 6) {
        throw new Error("La password deve avere almeno 6 caratteri.");
      }
      if (password !== confirm) {
        throw new Error("Le due password non coincidono.");
      }
      await updatePassword(password);
      await signOutCloud();
      setState("success");
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

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
              Verifica link…
            </h1>
            <p className="mt-3 text-[14px] leading-relaxed text-text-secondary">
              Controlliamo il link di reimpostazione password.
            </p>
          </>
        )}

        {state === "form" && (
          <>
            <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-full bg-accent/15">
              <KeyRound className="h-6 w-6 text-accent" />
            </div>
            <h1 className="font-display text-[1.75rem] font-semibold tracking-[-0.03em] text-text-primary">
              Nuova password
            </h1>
            <p className="mt-3 text-[14px] leading-relaxed text-text-secondary">
              Scegli una password nuova (minimo 6 caratteri), poi torna all&apos;app
              e accedi.
            </p>

            {errorMessage && (
              <p className="mt-4 rounded-xl border border-warm/25 bg-warm/10 px-3 py-2 text-left text-[13px] text-warm">
                {errorMessage}
              </p>
            )}

            <form
              className="mt-6 space-y-3 text-left"
              onSubmit={(e) => {
                e.preventDefault();
                if (!busy) void submit();
              }}
            >
              <label className="block space-y-1.5">
                <span className="text-[11px] font-medium text-text-muted">
                  Nuova password
                </span>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="new-password"
                    className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2.5 pr-10 text-[13px] text-text-primary outline-none focus:border-accent/30"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-text-muted hover:bg-white/5 hover:text-text-primary"
                    aria-label={showPassword ? "Nascondi password" : "Mostra password"}
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </label>
              <label className="block space-y-1.5">
                <span className="text-[11px] font-medium text-text-muted">
                  Conferma password
                </span>
                <input
                  type={showPassword ? "text" : "password"}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  autoComplete="new-password"
                  className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2.5 text-[13px] text-text-primary outline-none focus:border-accent/30"
                />
              </label>
              <button
                type="submit"
                disabled={busy || password.length < 6 || confirm.length < 6}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-white px-4 py-3 text-[14px] font-semibold text-black disabled:opacity-50"
              >
                {busy ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <KeyRound className="h-4 w-4" />
                )}
                Salva password
              </button>
            </form>
          </>
        )}

        {state === "success" && (
          <>
            <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/15">
              <CheckCircle2 className="h-6 w-6 text-emerald-400" />
            </div>
            <h1 className="font-display text-[1.75rem] font-semibold tracking-[-0.03em] text-text-primary">
              Password aggiornata
            </h1>
            <p className="mt-3 text-[15px] leading-relaxed text-text-secondary">
              Chiudi questa scheda e torna a Branchefy per accedere con la nuova
              password.
            </p>
          </>
        )}

        {state === "error" && (
          <>
            <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-full bg-warm/15">
              <AlertCircle className="h-6 w-6 text-warm" />
            </div>
            <h1 className="font-display text-[1.75rem] font-semibold tracking-[-0.03em] text-text-primary">
              Link non valido
            </h1>
            <p className="mt-3 text-[14px] leading-relaxed text-text-secondary">
              {errorMessage ?? "Non è stato possibile aprire il reset password."}
            </p>
            <p className="mt-4 text-[13px] text-text-muted">
              Torna all&apos;app e richiedi un nuovo link da «Password dimenticata».
            </p>
          </>
        )}
      </motion.div>
    </div>
  );
}
