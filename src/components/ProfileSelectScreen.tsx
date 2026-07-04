import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Pencil, ArrowLeft, Trash2, Lock } from "lucide-react";
import { useProfile } from "../context/ProfileContext";
import { useAppAccess } from "../context/AppAccessContext";
import { isBrowserDevMode } from "../lib/tauriEnv";
import { ProfileAvatar } from "./ProfileAvatar";
import { roleLabel, type Profile } from "../types/profile";
import {
  ProfileCustomizeForm,
  profileCustomizeToCreate,
  profileCustomizeToUpdate,
  valueFromProfile,
  type ProfileCustomizeValue,
} from "./profile/ProfileCustomizeForm";
import { PROFILE_COLORS, PROFILE_EMOJIS } from "../types/profile";

const defaultCreateValue = (guest = false): ProfileCustomizeValue => ({
  name: "",
  role: guest ? "other" : "child",
  avatarColor: PROFILE_COLORS[0],
  accentColor: PROFILE_COLORS[1],
  avatarStyle: "emoji",
  avatarEmoji: PROFILE_EMOJIS[2],
});

export function ProfileSelectScreen() {
  const {
    profiles,
    loading,
    selectProfile,
    isManaging,
    startManaging,
    stopManaging,
    createNewProfile,
    updateExistingProfile,
    removeProfile,
  } = useProfile();
  const { isGuest } = useAppAccess();

  const [creating, setCreating] = useState(false);
  const [editingProfile, setEditingProfile] = useState<Profile | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const browserDev = isBrowserDevMode();

  useEffect(() => {
    if (!loading && profiles.length === 0 && !creating && !editingProfile) {
      setCreating(true);
    }
  }, [loading, profiles.length, creating, editingProfile]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center bg-void">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-white/10 border-t-accent" />
      </div>
    );
  }

  return (
    <div className="relative flex h-full flex-col items-center justify-center overflow-auto bg-void px-6 py-12">
      <div className="noise-overlay pointer-events-none absolute inset-0 opacity-30" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_0%,rgba(107,127,255,0.1),transparent)]" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative w-full max-w-3xl"
      >
        <div className="mb-12 text-center">
          <p className="text-[11px] font-medium uppercase tracking-[0.35em] text-text-muted">
            Branchefy
          </p>
          <h1 className="font-display mt-4 text-[clamp(2rem,5vw,3.5rem)] font-semibold tracking-[-0.03em] text-text-primary">
            {creating
              ? "Nuovo profilo"
              : editingProfile
                ? "Modifica profilo"
                : isManaging
                  ? "Gestisci profili"
                  : "Chi sta guardando?"}
          </h1>
          {!creating && !editingProfile && (
            <p className="mt-3 text-[14px] text-text-secondary">
              {browserDev
                ? "Modalità browser dev: profili salvati in localStorage"
                : profiles.length === 0
                  ? isGuest
                    ? "Crea il tuo profilo ospite per iniziare"
                    : "Crea il primo profilo per iniziare"
                  : isManaging
                    ? "Modifica o elimina i profili"
                    : "Scegli il tuo profilo per continuare"}
            </p>
          )}
        </div>

        <AnimatePresence mode="wait">
          {creating ? (
            <ProfileCustomizeForm
              key="create"
              initial={defaultCreateValue(isGuest)}
              submitLabel="Crea profilo"
              submitting={submitting}
              error={error}
              onCancel={() => {
                setCreating(false);
                setError(null);
              }}
              onSubmit={async (value) => {
                setSubmitting(true);
                setError(null);
                try {
                  const profile = await createNewProfile(profileCustomizeToCreate(value));
                  setCreating(false);
                  selectProfile(profile);
                } catch (err) {
                  setError(err instanceof Error ? err.message : String(err));
                } finally {
                  setSubmitting(false);
                }
              }}
            />
          ) : editingProfile ? (
            <ProfileCustomizeForm
              key={editingProfile.id}
              initial={valueFromProfile(editingProfile)}
              submitLabel="Salva modifiche"
              submitting={submitting}
              error={error}
              onCancel={() => {
                setEditingProfile(null);
                setError(null);
              }}
              onSubmit={async (value) => {
                setSubmitting(true);
                setError(null);
                try {
                  await updateExistingProfile(
                    editingProfile.id,
                    profileCustomizeToUpdate(value),
                  );
                  setEditingProfile(null);
                } catch (err) {
                  setError(err instanceof Error ? err.message : String(err));
                } finally {
                  setSubmitting(false);
                }
              }}
            />
          ) : (
            <motion.div
              key="grid"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-wrap items-start justify-center gap-8"
            >
              {profiles.map((profile, i) => (
                <motion.div
                  key={profile.id}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.06 }}
                  className="group relative flex w-28 flex-col items-center gap-3"
                >
                  {isManaging ? (
                    <>
                      <div className="relative">
                        <ProfileAvatar profile={profile} size="xl" />
                        {profile.hasPin && (
                          <span className="absolute -right-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full bg-void ring-2 ring-void">
                            <Lock className="h-3 w-3 text-accent" />
                          </span>
                        )}
                      </div>
                      <div className="text-center">
                        <p className="text-[14px] font-medium text-text-primary">
                          {profile.name}
                        </p>
                        <p className="mt-0.5 text-[10px] uppercase tracking-wider text-text-muted">
                          {roleLabel(profile.role)}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => setEditingProfile(profile)}
                          className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 text-text-muted hover:text-text-primary"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        {profiles.length > 1 && (
                          <button
                            type="button"
                            onClick={() => void removeProfile(profile.id)}
                            className="flex h-8 w-8 items-center justify-center rounded-full border border-warm/20 text-warm hover:bg-warm/10"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => selectProfile(profile)}
                      className="flex w-full flex-col items-center gap-3"
                    >
                      <div className="relative">
                        <ProfileAvatar profile={profile} size="xl" />
                        {profile.hasPin && (
                          <span className="absolute -right-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full bg-void ring-2 ring-void">
                            <Lock className="h-3 w-3 text-accent" />
                          </span>
                        )}
                      </div>
                      <div className="text-center">
                        <p className="text-[14px] font-medium text-text-secondary transition-colors group-hover:text-text-primary">
                          {profile.name}
                        </p>
                        <p className="mt-0.5 text-[10px] uppercase tracking-wider text-text-muted">
                          {roleLabel(profile.role)}
                        </p>
                      </div>
                    </button>
                  )}
                </motion.div>
              ))}

              {!isManaging && (
                <motion.button
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: profiles.length * 0.06 }}
                  onClick={() => setCreating(true)}
                  className="group flex w-28 flex-col items-center gap-3"
                >
                  <div className="flex h-28 w-28 items-center justify-center rounded-xl border border-dashed border-white/15 bg-white/[0.02] transition-colors group-hover:border-accent/40 group-hover:bg-accent/5">
                    <Plus className="h-8 w-8 text-text-muted transition-colors group-hover:text-accent" />
                  </div>
                  <p className="text-[14px] text-text-muted transition-colors group-hover:text-text-secondary">
                    Aggiungi profilo
                  </p>
                </motion.button>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {!creating && !editingProfile && profiles.length > 0 && (
          <div className="mt-12 flex justify-center">
            <button
              type="button"
              onClick={isManaging ? stopManaging : startManaging}
              className="inline-flex items-center gap-2 text-[13px] text-text-muted transition-colors hover:text-text-secondary"
            >
              {isManaging ? (
                <>
                  <ArrowLeft className="h-3.5 w-3.5" />
                  Fatto
                </>
              ) : (
                <>
                  <Pencil className="h-3.5 w-3.5" />
                  Gestisci profili
                </>
              )}
            </button>
          </div>
        )}
      </motion.div>
    </div>
  );
}
