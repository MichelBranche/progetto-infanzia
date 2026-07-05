import { useState } from "react";
import {
  Cloud,
  Copy,
  Eye,
  EyeOff,
  Loader2,
  LogIn,
  LogOut,
  UserPlus,
} from "lucide-react";
import { useCloudAccount } from "../context/CloudAccountContext";
import { SETTINGS_CARD } from "./settings/SettingsUi";

type AuthMode = "login" | "register";

export function CloudAuthPanel() {
  const {
    enabled,
    configured,
    configHint,
    loading,
    profile,
    signUp,
    signIn,
    signOut,
  } = useCloudAccount();

  const [mode, setMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  if (!configured) {
    return (
      <section className={SETTINGS_CARD}>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/[0.05]">
            <Cloud className="h-5 w-5 text-text-muted" />
          </div>
          <div>
            <h3 className="text-[15px] font-medium text-text-primary">
              Account online
            </h3>
            <p className="mt-1 text-[13px] leading-relaxed text-text-muted">
              {configHint}
            </p>
          </div>
        </div>
      </section>
    );
  }

  if (loading) {
    return (
      <div className={`flex items-center gap-2 ${SETTINGS_CARD} px-5 py-8`}>
        <Loader2 className="h-4 w-4 animate-spin text-text-muted" />
        <span className="text-[13px] text-text-muted">Verifica account cloud…</span>
      </div>
    );
  }

  const copyFriendCode = async () => {
    if (!profile) return;
    try {
      await navigator.clipboard.writeText(profile.friendCode);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  if (profile) {
    return (
      <section className="overflow-hidden rounded-2xl border border-accent/25 bg-gradient-to-br from-accent/10 via-accent/5 to-transparent p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-accent/15">
              <Cloud className="h-5 w-5 text-accent" />
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-accent">
                Connesso
              </p>
              <p className="mt-1 text-[16px] font-medium text-text-primary">
                {profile.displayName}
              </p>
              <p className="text-[13px] text-text-muted">{profile.email}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void signOut()}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-white/10 px-3 py-1.5 text-[11px] text-text-secondary hover:bg-white/[0.04] hover:text-text-primary"
          >
            <LogOut className="h-3 w-3" />
            Esci
          </button>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3 rounded-xl border border-white/[0.06] bg-black/20 px-4 py-3">
          <div>
            <p className="text-[10px] font-medium uppercase tracking-wider text-text-muted">
              Codice amico cloud
            </p>
            <p className="font-mono text-lg font-semibold tracking-[0.2em] text-text-primary">
              {profile.friendCode}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void copyFriendCode()}
            className="ml-auto inline-flex items-center gap-2 rounded-full border border-white/10 px-3 py-1.5 text-[11px] text-text-primary hover:bg-white/[0.04]"
          >
            <Copy className="h-3.5 w-3.5" />
            {copied ? "Copiato" : "Copia"}
          </button>
        </div>
      </section>
    );
  }

  const submit = async () => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      if (mode === "register") {
        await signUp(email, password, displayName || undefined);
        setMessage("Account creato. Ora puoi aggiungere amici via email.");
      } else {
        await signIn(email, password);
        setMessage("Accesso effettuato.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className={SETTINGS_CARD}>
      <div className="mb-5 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/10">
          <Cloud className="h-5 w-5 text-accent" />
        </div>
        <div>
          <h3 className="text-[15px] font-medium text-text-primary">
            Account online
          </h3>
          <p className="text-[12px] text-text-muted">
            {enabled
              ? "Amici ovunque, anche fuori dalla stessa rete"
              : configHint}
          </p>
        </div>
      </div>

      <div className="mb-5 flex rounded-xl bg-white/[0.04] p-1">
        <button
          type="button"
          onClick={() => {
            setMode("login");
            setError(null);
            setMessage(null);
          }}
          className={`flex-1 rounded-lg py-2 text-[12px] font-medium transition-colors ${
            mode === "login"
              ? "bg-white text-black shadow-sm"
              : "text-text-muted hover:text-text-primary"
          }`}
        >
          Accedi
        </button>
        <button
          type="button"
          onClick={() => {
            setMode("register");
            setError(null);
            setMessage(null);
          }}
          className={`flex-1 rounded-lg py-2 text-[12px] font-medium transition-colors ${
            mode === "register"
              ? "bg-white text-black shadow-sm"
              : "text-text-muted hover:text-text-primary"
          }`}
        >
          Registrati
        </button>
      </div>

      {error && (
        <p className="mb-3 rounded-lg border border-warm/20 bg-warm/10 px-3 py-2 text-[12px] text-warm">
          {error}
        </p>
      )}
      {message && (
        <p className="mb-3 rounded-lg border border-mint/20 bg-mint/10 px-3 py-2 text-[12px] text-mint">
          {message}
        </p>
      )}

      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (!busy && email.trim() && password.length >= 6) {
            void submit();
          }
        }}
      >
        {mode === "register" && (
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
                mode === "register" ? "new-password" : "current-password"
              }
              className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2.5 pr-10 text-[13px] outline-none focus:border-accent/30"
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
        </div>
        <button
          type="submit"
          disabled={busy || !email.trim() || password.length < 6}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-white px-4 py-3 text-[14px] font-semibold text-black disabled:opacity-50"
        >
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : mode === "register" ? (
            <UserPlus className="h-4 w-4" />
          ) : (
            <LogIn className="h-4 w-4" />
          )}
          {mode === "register" ? "Crea account" : "Accedi"}
        </button>
      </form>
    </section>
  );
}
