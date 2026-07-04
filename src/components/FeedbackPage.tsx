import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bug,
  CheckCircle2,
  Film,
  Lightbulb,
  Loader2,
  MessageSquare,
  Sparkles,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useCloudAccount } from "../context/CloudAccountContext";
import type { Profile } from "../types/profile";
import { roleLabel } from "../types/profile";
import {
  FEEDBACK_TYPE_OPTIONS,
  type FeedbackType,
} from "../types/feedback";
import { detectPlatform, submitAppFeedback } from "../lib/feedbackApi";
import { fetchAppVersion } from "../lib/appUpdater";

interface FeedbackPageProps {
  profile: Profile;
  activeNav: string;
  onOpenSettings?: () => void;
}

const typeIcons: Record<FeedbackType, typeof Bug> = {
  bug: Bug,
  feedback: MessageSquare,
  feature: Lightbulb,
  title: Film,
};

function typeAccent(type: FeedbackType): string {
  switch (type) {
    case "bug":
      return "border-warm/30 bg-warm/10 text-warm";
    case "feedback":
      return "border-accent/30 bg-accent/10 text-accent";
    case "feature":
      return "border-sky-400/25 bg-sky-400/10 text-sky-300";
    case "title":
      return "border-mint/25 bg-mint/10 text-mint";
    default:
      return "border-white/10 bg-white/[0.04] text-text-muted";
  }
}

export function FeedbackPage({
  profile,
  activeNav,
  onOpenSettings,
}: FeedbackPageProps) {
  const { enabled: cloudEnabled, profile: cloudProfile, user } =
    useCloudAccount();
  const [type, setType] = useState<FeedbackType>("feedback");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [appVersion, setAppVersion] = useState("…");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const selectedOption = useMemo(
    () => FEEDBACK_TYPE_OPTIONS.find((opt) => opt.id === type)!,
    [type],
  );

  const needsSubject = type === "feature" || type === "title";
  const canSubmit = cloudEnabled && Boolean(user);

  useEffect(() => {
    void fetchAppVersion().then(setAppVersion);
  }, []);

  const handleSubmit = useCallback(async () => {
    setError(null);
    setSubmitting(true);
    try {
      await submitAppFeedback({
        type,
        message,
        subject: needsSubject ? subject : undefined,
        profileName: profile.name,
        profileRole: profile.role,
        userId: user?.id,
        context: {
          activeNav,
          appVersion,
          platform: detectPlatform(),
        },
      });
      setSent(true);
      setMessage("");
      setSubject("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }, [
    activeNav,
    appVersion,
    message,
    needsSubject,
    profile.name,
    profile.role,
    subject,
    type,
    user?.id,
  ]);

  if (sent) {
    return (
      <div className="page-px flex min-h-[60vh] flex-col items-center justify-center pb-16 pt-24 sm:pt-28">
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          className="max-w-md text-center"
        >
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-mint/25 bg-mint/10">
            <CheckCircle2 className="h-7 w-7 text-mint" />
          </div>
          <h2 className="font-display mt-5 text-2xl font-semibold text-text-primary">
            Grazie!
          </h2>
          <p className="mt-2 text-[14px] leading-relaxed text-text-secondary">
            La tua segnalazione è stata ricevuta. La leggeremo appena possibile.
          </p>
          <button
            type="button"
            onClick={() => setSent(false)}
            className="mt-6 rounded-full border border-white/10 px-5 py-2.5 text-[12px] font-medium text-text-secondary transition-colors hover:bg-white/[0.04]"
          >
            Invia un&apos;altra richiesta
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="page-px pb-16 pt-24 sm:pt-28">
      <div className="mb-8 flex items-start gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-accent/25 bg-accent/10">
          <Sparkles className="h-5 w-5 text-accent" />
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.32em] text-accent">
            Supporto
          </p>
          <h2 className="font-display mt-1 text-3xl font-semibold tracking-[-0.03em] text-text-primary">
            Feedback e richieste
          </h2>
          <p className="mt-1 max-w-xl text-[14px] text-text-secondary">
            Segnala bug, lascia un feedback, chiedi una nuova funzione o
            richiedi un titolo da aggiungere al catalogo.
          </p>
        </div>
      </div>

      {!canSubmit && (
        <div className="mb-6 max-w-2xl rounded-2xl border border-warm/20 bg-warm/10 px-4 py-4 text-[13px] leading-relaxed text-warm">
          {!cloudEnabled
            ? "Il servizio cloud non è configurato su questa build."
            : profile.role === "parent"
              ? "Accedi al tuo account cloud per inviare feedback."
              : "Per inviare una richiesta serve l'account cloud del genitore. Chiedi a un genitore di accedere dall'app."}
          {onOpenSettings && cloudEnabled && !user && profile.role === "parent" && (
            <button
              type="button"
              onClick={onOpenSettings}
              className="mt-3 block rounded-full border border-warm/30 px-4 py-2 text-[12px] font-medium text-warm transition-colors hover:bg-warm/10"
            >
              Vai alle Impostazioni
            </button>
          )}
        </div>
      )}

      <div className="max-w-2xl space-y-6">
        <section>
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-text-muted">
            Tipo di richiesta
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {FEEDBACK_TYPE_OPTIONS.map((option) => {
              const Icon = typeIcons[option.id];
              const selected = type === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => {
                    setType(option.id);
                    setError(null);
                  }}
                  className={`rounded-2xl border px-4 py-3.5 text-left transition-colors ${
                    selected
                      ? typeAccent(option.id)
                      : "border-white/[0.07] bg-white/[0.02] text-text-secondary hover:border-white/12 hover:bg-white/[0.04]"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Icon className="h-4 w-4 shrink-0" />
                    <span className="font-medium text-text-primary">
                      {option.label}
                    </span>
                  </div>
                  <p className="mt-1 text-[12px] text-text-muted">
                    {option.description}
                  </p>
                </button>
              );
            })}
          </div>
        </section>

        <AnimatePresence mode="wait">
          {needsSubject && (
            <motion.section
              key={`subject-${type}`}
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <label className="block">
                <span className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.18em] text-text-muted">
                  {selectedOption.subjectLabel}
                  {type === "title" && (
                    <span className="ml-1 text-warm">*</span>
                  )}
                </span>
                <input
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder={selectedOption.subjectPlaceholder}
                  className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-[14px] text-text-primary outline-none placeholder:text-text-muted focus:border-accent/40"
                />
              </label>
            </motion.section>
          )}
        </AnimatePresence>

        <section>
          <label className="block">
            <span className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.18em] text-text-muted">
              Descrizione
            </span>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={selectedOption.placeholder}
              rows={6}
              className="w-full resize-y rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-[14px] leading-relaxed text-text-primary outline-none placeholder:text-text-muted focus:border-accent/40"
            />
          </label>
        </section>

        <details className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3 text-[12px] text-text-muted">
          <summary className="cursor-pointer select-none text-text-secondary">
            Dati inviati automaticamente
          </summary>
          <ul className="mt-3 space-y-1.5">
            <li>Versione app: {appVersion}</li>
            <li>Piattaforma: {detectPlatform()}</li>
            <li>
              Profilo: {profile.name} ({roleLabel(profile.role)})
            </li>
            <li>Schermata: {activeNav}</li>
            {cloudProfile?.email && <li>Account: {cloudProfile.email}</li>}
          </ul>
        </details>

        {error && (
          <div className="rounded-xl border border-warm/25 bg-warm/10 px-4 py-3 text-[13px] text-warm">
            {error}
          </div>
        )}

        <button
          type="button"
          disabled={!canSubmit || submitting || message.trim().length < 10}
          onClick={() => void handleSubmit()}
          className="inline-flex items-center gap-2 rounded-full bg-text-primary px-6 py-3 text-[13px] font-semibold text-void transition-transform hover:scale-[1.02] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
        >
          {submitting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <MessageSquare className="h-4 w-4" />
          )}
          Invia richiesta
        </button>
      </div>
    </div>
  );
}
