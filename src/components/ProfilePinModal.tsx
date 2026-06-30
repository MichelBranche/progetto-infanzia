import { useState } from "react";
import { motion } from "framer-motion";
import { Lock, X } from "lucide-react";
import { ProfileAvatar } from "./ProfileAvatar";
import type { Profile } from "../types/profile";

interface ProfilePinModalProps {
  profile: Profile;
  title?: string;
  onCancel: () => void;
  onSubmit: (pin: string) => Promise<void>;
}

export function ProfilePinModal({
  profile,
  title = "Inserisci il PIN",
  onCancel,
  onSubmit,
}: ProfilePinModalProps) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pin.trim().length < 4) {
      setError("Il PIN ha almeno 4 cifre");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit(pin.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setPin("");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
      <motion.form
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        onSubmit={(e) => void handleSubmit(e)}
        className="relative w-full max-w-sm rounded-2xl border border-white/10 bg-surface p-6 shadow-2xl"
      >
        <button
          type="button"
          onClick={onCancel}
          className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full text-text-muted hover:bg-white/5"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="flex flex-col items-center text-center">
          <ProfileAvatar profile={profile} size="lg" />
          <div className="mt-4 flex items-center gap-2 text-accent">
            <Lock className="h-4 w-4" />
            <span className="text-[11px] font-medium uppercase tracking-[0.2em]">
              Profilo protetto
            </span>
          </div>
          <h2 className="font-display mt-2 text-xl font-semibold text-text-primary">
            {title}
          </h2>
          <p className="mt-1 text-[13px] text-text-muted">{profile.name}</p>
        </div>

        <input
          type="password"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={8}
          autoFocus
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
          placeholder="••••"
          className="mt-6 w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 text-center text-2xl tracking-[0.4em] text-text-primary outline-none focus:border-accent/30"
        />

        {error && (
          <p className="mt-3 text-center text-[13px] text-warm">{error}</p>
        )}

        <button
          type="submit"
          disabled={submitting || pin.length < 4}
          className="mt-5 w-full rounded-full bg-text-primary py-2.5 text-[13px] font-medium text-void disabled:opacity-50"
        >
          {submitting ? "Verifica..." : "Continua"}
        </button>
      </motion.form>
    </div>
  );
}
