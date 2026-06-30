import { useState } from "react";
import { Loader2, LogIn, LogOut, UserPlus } from "lucide-react";
import { useCloudAccount } from "../context/CloudAccountContext";

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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  if (!configured) {
    return (
      <section className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5">
        <h3 className="text-[15px] font-medium text-text-primary">
          Account online
        </h3>
        <p className="mt-2 text-[13px] leading-relaxed text-text-muted">
          {configHint}
        </p>
      </section>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-6 text-text-muted">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-[13px]">Account cloud…</span>
      </div>
    );
  }

  if (profile) {
    return (
      <section className="rounded-2xl border border-accent/20 bg-accent/5 p-5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-accent">
          Account connesso
        </p>
        <p className="mt-2 text-[15px] font-medium text-text-primary">
          {profile.displayName}
        </p>
        <p className="text-[13px] text-text-muted">{profile.email}</p>
        <p className="mt-2 text-[12px] text-text-secondary">
          Codice cloud:{" "}
          <span className="font-mono font-semibold tracking-wider">
            {profile.friendCode}
          </span>
        </p>
        <button
          type="button"
          onClick={() => void signOut()}
          className="mt-4 inline-flex items-center gap-2 rounded-full border border-white/10 px-4 py-2 text-[12px] text-text-primary hover:bg-white/[0.04]"
        >
          <LogOut className="h-3.5 w-3.5" />
          Esci dall&apos;account
        </button>
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
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5">
      <div className="mb-4 flex gap-2">
        <button
          type="button"
          onClick={() => setMode("login")}
          className={`rounded-full px-3 py-1.5 text-[12px] ${
            mode === "login"
              ? "bg-white text-black"
              : "text-text-muted hover:text-text-primary"
          }`}
        >
          Accedi
        </button>
        <button
          type="button"
          onClick={() => setMode("register")}
          className={`rounded-full px-3 py-1.5 text-[12px] ${
            mode === "register"
              ? "bg-white text-black"
              : "text-text-muted hover:text-text-primary"
          }`}
        >
          Registrati
        </button>
      </div>

      <p className="mb-4 text-[13px] text-text-muted">
        {enabled
          ? "Crea un account con email per avere amici anche fuori casa."
          : configHint}
      </p>

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

      <div className="space-y-3">
        {mode === "register" && (
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Nome visualizzato"
            className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2.5 text-[13px] outline-none focus:border-accent/30"
          />
        )}
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          autoComplete="email"
          className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2.5 text-[13px] outline-none focus:border-accent/30"
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password (min. 6 caratteri)"
          autoComplete={mode === "register" ? "new-password" : "current-password"}
          className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2.5 text-[13px] outline-none focus:border-accent/30"
        />
        <button
          type="button"
          disabled={busy || !email.trim() || password.length < 6}
          onClick={() => void submit()}
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
      </div>
    </section>
  );
}
