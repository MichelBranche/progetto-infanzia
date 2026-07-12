import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  Clock,
  Cloud,
  Eye,
  EyeOff,
  Loader2,
  LogIn,
  Sparkles,
  UserPlus,
  UserRound,
} from "lucide-react";
import { useCloudAccount } from "../context/CloudAccountContext";
import { useAppAccess } from "../context/AppAccessContext";
import { readAppAccessMode } from "../lib/appAccess";
import { isWebShell } from "../lib/runtimeInvoke";
import { GUEST_DAILY_LIMIT_SECONDS } from "../lib/guestUsage";
import { formatDuration } from "../types/media";

type Step = "choose" | "auth";
type AuthMode = "login" | "register";

export function AppAccessScreen() {
  const { enabled: cloudEnabled, configHint, signIn, signUp } = useCloudAccount();
  const { completeGuestSetup, completeRegisteredSetup } = useAppAccess();

  const [step, setStep] = useState<Step>("choose");
  const [authMode, setAuthMode] = useState<AuthMode>("register");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const guestLimitLabel = formatDuration(GUEST_DAILY_LIMIT_SECONDS) ?? "2h";

  const submitAuth = async () => {
    setBusy(true);
    setError(null);
    try {
      if (authMode === "register") {
        await signUp(email, password, displayName || undefined);
      } else {
        await signIn(email, password);
      }
      completeRegisteredSetup();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative flex h-full flex-col items-center justify-center overflow-auto bg-void px-6 py-12">
      <div className="noise-overlay pointer-events-none absolute inset-0 opacity-30" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_0%,rgba(107,127,255,0.12),transparent)]" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative w-full max-w-lg"
      >
        <div className="mb-10 text-center">
          <p className="text-[11px] font-medium uppercase tracking-[0.35em] text-text-muted">
            Benvenuto in Branchefy
          </p>
          <h1 className="font-display mt-4 text-[clamp(2rem,5vw,3rem)] font-semibold tracking-[-0.03em] text-text-primary">
            {step === "choose" ? "Come vuoi iniziare?" : "Il tuo account"}
          </h1>
          <p className="mt-3 text-[14px] leading-relaxed text-text-secondary">
            {step === "choose"
              ? "Registrati per l'accesso completo oppure prova l'app come ospite."
              : "Accedi o crea un account per sbloccare tutte le funzioni."}
          </p>
        </div>

        <AnimatePresence mode="wait">
          {step === "choose" ? (
            <motion.div
              key="choose"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              className="space-y-4"
            >
              {cloudEnabled ? (
                <button
                  type="button"
                  onClick={() => {
                    setStep("auth");
                    setAuthMode("register");
                    setError(null);
                  }}
                  className="group w-full rounded-2xl border border-accent/25 bg-gradient-to-br from-accent/12 via-accent/5 to-transparent p-5 text-left transition-colors hover:border-accent/40"
                >
                  <div className="flex items-start gap-4">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-accent/15">
                      <Cloud className="h-5 w-5 text-accent" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-display text-lg font-semibold text-text-primary">
                        Registrati o accedi
                      </p>
                      <p className="mt-1 text-[13px] leading-relaxed text-text-secondary">
                        Accesso illimitato, amici cloud, feedback e sincronizzazione.
                      </p>
                      <p className="mt-3 inline-flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-accent">
                        <Sparkles className="h-3.5 w-3.5" />
                        Consigliato
                      </p>
                    </div>
                  </div>
                </button>
              ) : (
                <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] px-5 py-4 text-[13px] text-text-muted">
                  {configHint}
                </div>
              )}

              <button
                type="button"
                onClick={() => {
                  completeGuestSetup();
                }}
                className="group w-full rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5 text-left transition-colors hover:border-white/15 hover:bg-white/[0.04]"
              >
                <div className="flex items-start gap-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/[0.05]">
                    <UserRound className="h-5 w-5 text-text-secondary" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-display text-lg font-semibold text-text-primary">
                      Continua come ospite
                    </p>
                    <p className="mt-1 text-[13px] leading-relaxed text-text-secondary">
                      Nessuna email richiesta. Puoi guardare contenuti con un limite
                      giornaliero.
                    </p>
                    <p className="mt-3 inline-flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-text-muted">
                      <Clock className="h-3.5 w-3.5" />
                      Max {guestLimitLabel} al giorno
                    </p>
                  </div>
                </div>
              </button>
            </motion.div>
          ) : (
            <motion.div
              key="auth"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5"
            >
              <button
                type="button"
                onClick={() => {
                  setStep("choose");
                  setError(null);
                }}
                className="mb-5 inline-flex items-center gap-2 text-[12px] text-text-muted transition-colors hover:text-text-secondary"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Indietro
              </button>

              <div className="mb-5 flex rounded-xl bg-white/[0.04] p-1">
                <button
                  type="button"
                  onClick={() => {
                    setAuthMode("register");
                    setError(null);
                  }}
                  className={`flex-1 rounded-lg py-2 text-[12px] font-medium transition-colors ${
                    authMode === "register"
                      ? "bg-white text-black shadow-sm"
                      : "text-text-muted hover:text-text-primary"
                  }`}
                >
                  Registrati
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAuthMode("login");
                    setError(null);
                  }}
                  className={`flex-1 rounded-lg py-2 text-[12px] font-medium transition-colors ${
                    authMode === "login"
                      ? "bg-white text-black shadow-sm"
                      : "text-text-muted hover:text-text-primary"
                  }`}
                >
                  Accedi
                </button>
              </div>

              {error && (
                <p className="mb-3 rounded-lg border border-warm/20 bg-warm/10 px-3 py-2 text-[12px] text-warm">
                  {error}
                </p>
              )}

              <form
                className="space-y-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!busy && email.trim() && password.length >= 6) {
                    void submitAuth();
                  }
                }}
              >
                {authMode === "register" && (
                  <div>
                    <label className="mb-1.5 block text-[11px] font-medium text-text-muted">
                      Nome visualizzato
                    </label>
                    <input
                      type="text"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder="Come ti vedono gli amici"
                      autoComplete="name"
                      className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2.5 text-[13px] outline-none focus:border-accent/30"
                    />
                  </div>
                )}
                <div>
                  <label className="mb-1.5 block text-[11px] font-medium text-text-muted">
                    Email
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="tu@email.it"
                    autoComplete="email"
                    className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2.5 text-[13px] outline-none focus:border-accent/30"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-[11px] font-medium text-text-muted">
                    Password
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Minimo 6 caratteri"
                      autoComplete={
                        authMode === "register" ? "new-password" : "current-password"
                      }
                      className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2.5 pr-10 text-[13px] outline-none focus:border-accent/30"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-text-muted hover:bg-white/5 hover:text-text-primary"
                      aria-label={
                        showPassword ? "Nascondi password" : "Mostra password"
                      }
                    >
                      {showPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={busy || !email.trim() || password.length < 6}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-white px-4 py-3 text-[14px] font-semibold text-black disabled:opacity-50"
                >
                  {busy ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : authMode === "register" ? (
                    <UserPlus className="h-4 w-4" />
                  ) : (
                    <LogIn className="h-4 w-4" />
                  )}
                  {authMode === "register" ? "Crea account" : "Accedi"}
                </button>
              </form>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}

/** Auto-complete registered setup when cloud session already exists. */
export function AppAccessBootstrap() {
  const { user, loading: cloudLoading } = useCloudAccount();
  const { setupComplete, completeRegisteredSetup, logoutAccess, syncFromStorage } =
    useAppAccess();

  useEffect(() => {
    if (!cloudLoading && user && !setupComplete) {
      completeRegisteredSetup();
    }
  }, [cloudLoading, user, setupComplete, completeRegisteredSetup]);

  useEffect(() => {
    if (!isWebShell() || cloudLoading || !setupComplete) return;
    const mode = readAppAccessMode();
    if (mode === "registered" && !user) {
      logoutAccess();
      syncFromStorage();
    }
  }, [cloudLoading, user, setupComplete, logoutAccess, syncFromStorage]);

  return null;
}
