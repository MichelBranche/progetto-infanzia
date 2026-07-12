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
import { EmailConfirmationRequiredError } from "../lib/cloudAuthErrors";
import { useCloudAccount } from "../context/CloudAccountContext";
import {
  SettingsAlert,
  SettingsButton,
  SettingsCard,
  SettingsField,
  SettingsIconBadge,
  SettingsInput,
  SettingsInset,
  SettingsSegmented,
} from "./settings/SettingsUi";

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
      <SettingsCard>
        <div className="flex items-center gap-3">
          <SettingsIconBadge icon={Cloud} className="opacity-70" />
          <div>
            <h3 className="font-display text-[15px] font-semibold tracking-[-0.02em] text-text-primary">
              Account online
            </h3>
            <p className="mt-1 text-[13px] leading-relaxed text-text-muted">
              {configHint}
            </p>
          </div>
        </div>
      </SettingsCard>
    );
  }

  if (loading && !profile) {
    return (
      <SettingsCard>
        <div className="flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin text-text-muted" />
          <span className="text-[13px] text-text-muted">Verifica account cloud…</span>
        </div>
      </SettingsCard>
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
      <SettingsCard variant="accent">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <SettingsIconBadge icon={Cloud} />
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-accent">
                Connesso
              </p>
              <p className="font-display mt-1 text-[17px] font-semibold tracking-[-0.02em] text-text-primary">
                {profile.displayName}
              </p>
              <p className="text-[13px] text-text-muted">{profile.email}</p>
            </div>
          </div>
          <SettingsButton
            variant="secondary"
            onClick={() => void signOut()}
            className="shrink-0 px-3 py-2"
          >
            <LogOut className="h-3 w-3" />
            Esci
          </SettingsButton>
        </div>

        <SettingsInset className="mt-5 flex flex-wrap items-center gap-3">
          <div>
            <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-text-muted">
              Codice amico cloud
            </p>
            <p className="font-mono text-lg font-semibold tracking-[0.2em] text-text-primary">
              {profile.friendCode}
            </p>
          </div>
          <SettingsButton
            variant="secondary"
            onClick={() => void copyFriendCode()}
            className="ml-auto px-3 py-2"
          >
            <Copy className="h-3.5 w-3.5" />
            {copied ? "Copiato" : "Copia"}
          </SettingsButton>
        </SettingsInset>
      </SettingsCard>
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
      if (err instanceof EmailConfirmationRequiredError) {
        setMessage(err.message);
        setMode("login");
        setPassword("");
      } else {
        setError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <SettingsCard>
      <div className="mb-5 flex items-center gap-3">
        <SettingsIconBadge icon={Cloud} />
        <div>
          <h3 className="font-display text-[15px] font-semibold tracking-[-0.02em] text-text-primary">
            Account online
          </h3>
          <p className="text-[12px] text-text-muted">
            {enabled
              ? "Amici ovunque, anche fuori dalla stessa rete"
              : configHint}
          </p>
        </div>
      </div>

      <SettingsSegmented
        value={mode}
        options={[
          { id: "login", label: "Accedi" },
          { id: "register", label: "Registrati" },
        ]}
        onChange={(next) => {
          setMode(next);
          setError(null);
          setMessage(null);
        }}
      />

      {error && <SettingsAlert className="mt-4">{error}</SettingsAlert>}
      {message && (
        <SettingsAlert variant="success" className="mt-4">
          {message}
        </SettingsAlert>
      )}

      <form
        className="mt-5 space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (!busy && email.trim() && password.length >= 6) {
            void submit();
          }
        }}
      >
        {mode === "register" && (
          <SettingsField label="Nome visualizzato">
            <SettingsInput
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Come ti vedono gli amici"
              autoComplete="name"
            />
          </SettingsField>
        )}
        <SettingsField label="Email">
          <SettingsInput
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="tu@email.it"
            autoComplete="email"
          />
        </SettingsField>
        <SettingsField label="Password">
          <div className="relative">
            <SettingsInput
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Minimo 6 caratteri"
              autoComplete={mode === "register" ? "new-password" : "current-password"}
              className="pr-11"
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
        </SettingsField>
        <SettingsButton
          type="submit"
          variant="primary"
          disabled={busy || !email.trim() || password.length < 6}
          className="w-full py-3"
        >
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : mode === "register" ? (
            <UserPlus className="h-4 w-4" />
          ) : (
            <LogIn className="h-4 w-4" />
          )}
          {mode === "register" ? "Crea account" : "Accedi"}
        </SettingsButton>
      </form>
    </SettingsCard>
  );
}
