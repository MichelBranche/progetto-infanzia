import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Plus, Pencil, Trash2, Lock, Settings2 } from "lucide-react";
import { useProfile } from "../context/ProfileContext";
import { useAppAccess } from "../context/AppAccessContext";
import { isBrowserDevMode } from "../lib/tauriEnv";
import { isWebShell } from "../lib/runtimeInvoke";
import { BootLiquidBackground } from "./LiquidBackground";
import { ProfileAvatar } from "./ProfileAvatar";
import { setProfileAvatar, updateProfile } from "../lib/profilesApi";
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

function ProfileTile({
  profile,
  index,
  isManaging,
  onSelect,
  onEdit,
  onRemove,
  canRemove,
}: {
  profile: Profile;
  index: number;
  isManaging: boolean;
  onSelect: () => void;
  onEdit: () => void;
  onRemove: () => void;
  canRemove: boolean;
}) {
  const avatar = (
    <div className="relative">
      <div className="rounded-full p-[3px] transition-all duration-300 group-hover:bg-white/25 group-hover:shadow-[0_0_36px_rgba(255,255,255,0.18)] group-focus-visible:bg-white/25 group-focus-visible:shadow-[0_0_36px_rgba(255,255,255,0.18)]">
        <ProfileAvatar
          profile={profile}
          size="xl"
          className="h-[4.75rem] w-[4.75rem] rounded-full sm:h-[5.5rem] sm:w-[5.5rem]"
        />
      </div>
      {profile.hasPin && (
        <span className="absolute bottom-0 right-0 flex h-6 w-6 items-center justify-center rounded-full bg-void ring-2 ring-void">
          <Lock className="h-3 w-3 text-accent" />
        </span>
      )}
    </div>
  );

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.92 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: index * 0.05, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="group flex w-[5.5rem] flex-col items-center gap-3 sm:w-[6.5rem]"
    >
      {isManaging ? (
        <>
          {avatar}
          <div className="text-center">
            <p className="truncate font-display text-[14px] font-medium text-text-primary">
              {profile.name}
            </p>
            <p className="mt-0.5 text-[11px] text-text-muted">{roleLabel(profile.role)}</p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onEdit}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-white/[0.06] text-text-muted transition-colors hover:bg-white/12 hover:text-text-primary"
              aria-label={`Modifica ${profile.name}`}
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            {canRemove && (
              <button
                type="button"
                onClick={onRemove}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-warm/10 text-warm transition-colors hover:bg-warm/20"
                aria-label={`Elimina ${profile.name}`}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </>
      ) : (
        <button
          type="button"
          onClick={onSelect}
          className="flex w-full flex-col items-center gap-3 rounded-2xl outline-none transition-transform duration-300 hover:scale-[1.04] focus-visible:scale-[1.04]"
        >
          {avatar}
          <p className="max-w-full truncate text-center font-display text-[14px] font-medium text-text-secondary transition-colors group-hover:text-text-primary sm:text-[15px]">
            {profile.name}
          </p>
        </button>
      )}
    </motion.div>
  );
}

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
    refreshProfiles,
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

  const isFormView = creating || Boolean(editingProfile);

  const exitForm = () => {
    setCreating(false);
    setEditingProfile(null);
    setError(null);
  };

  if (loading) {
    return (
      <div className="fixed inset-0 z-[10] flex items-center justify-center bg-[#05000d]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/10 border-t-white/80" />
      </div>
    );
  }

  const formTitle = creating ? "Nuovo profilo" : "Modifica profilo";

  return (
    <div className="fixed inset-0 z-[10] overflow-y-auto overflow-x-hidden bg-[#05000d]">
      <BootLiquidBackground />
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_at_center,transparent_40%,rgba(0,0,0,0.5)_100%)]" />
      <div className="pointer-events-none fixed inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/45 to-transparent" />

      <div className="relative z-[1] flex min-h-full w-full flex-col items-center justify-center px-5 py-10 sm:px-8">
        <div className={`w-full ${isFormView ? "max-w-4xl" : "max-w-3xl"}`}>
        {isFormView ? (
          <header className="relative mb-8 text-center">
            <button
              type="button"
              onClick={exitForm}
              className="absolute left-0 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/[0.06] text-text-secondary transition-colors hover:bg-white/10 hover:text-text-primary sm:left-0"
              aria-label="Indietro"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div className="px-12">
              <p className="font-display text-[22px] font-semibold tracking-[-0.03em] text-text-primary sm:text-[26px]">
                {formTitle}
              </p>
              <p className="mt-0.5 text-[13px] text-text-muted">
                {creating && isWebShell() && profiles.length === 0
                  ? "Il tuo account è attivo. Crea un profilo locale per iniziare."
                  : "Personalizza nome, ruolo e avatar"}
              </p>
            </div>
          </header>
        ) : (
          <header className="mb-14 text-center sm:mb-16">
            <span className="chromatic-logo chromatic-logo--skew">
              Branchefy
            </span>
            <h1 className="font-display mt-6 text-[clamp(1.75rem,4.5vw,2.75rem)] font-semibold tracking-[-0.04em] text-text-primary">
              Chi sta guardando?
            </h1>
            <p className="mx-auto mt-3 max-w-sm text-[14px] leading-relaxed text-text-secondary">
              {browserDev
                ? "Profili salvati in locale (browser dev)"
                : isManaging
                  ? "Modifica o rimuovi i profili esistenti"
                  : "Seleziona un profilo per continuare"}
            </p>
          </header>
        )}

        <AnimatePresence mode="wait">
          {creating ? (
            <ProfileCustomizeForm
              key="create"
              initial={defaultCreateValue(isGuest)}
              submitLabel="Crea profilo"
              submitting={submitting}
              error={error}
              onCancel={exitForm}
              onSubmit={async (value) => {
                setSubmitting(true);
                setError(null);
                try {
                  let profile = await createNewProfile(profileCustomizeToCreate(value));
                  if (value.avatarStyle === "photo" && value.avatarImagePath) {
                    profile = value.avatarImagePath.startsWith("data:")
                      ? await updateProfile(profile.id, {
                          avatarStyle: "photo",
                          avatarImagePath: value.avatarImagePath,
                        })
                      : await setProfileAvatar(profile.id, value.avatarImagePath);
                  }
                  await refreshProfiles();
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
              previewProfileId={editingProfile.id}
              submitLabel="Salva"
              submitting={submitting}
              error={error}
              onCancel={exitForm}
              onSubmit={async (value) => {
                setSubmitting(true);
                setError(null);
                try {
                  await updateExistingProfile(
                    editingProfile.id,
                    profileCustomizeToUpdate(value),
                  );
                  if (value.avatarStyle === "photo" && value.avatarImagePath) {
                    if (value.avatarImagePath.startsWith("data:")) {
                      await updateProfile(editingProfile.id, {
                        avatarStyle: "photo",
                        avatarImagePath: value.avatarImagePath,
                      });
                    } else {
                      await setProfileAvatar(editingProfile.id, value.avatarImagePath);
                    }
                  }
                  await refreshProfiles();
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
              className="flex flex-col items-center"
            >
              <div className="flex flex-wrap items-start justify-center gap-x-6 gap-y-10 sm:gap-x-10">
                {profiles.map((profile, i) => (
                  <ProfileTile
                    key={profile.id}
                    profile={profile}
                    index={i}
                    isManaging={isManaging}
                    onSelect={() => selectProfile(profile)}
                    onEdit={() => setEditingProfile(profile)}
                    onRemove={() => void removeProfile(profile.id)}
                    canRemove={profiles.length > 1}
                  />
                ))}

                {!isManaging && (
                  <motion.button
                    initial={{ opacity: 0, scale: 0.92 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: profiles.length * 0.05 }}
                    type="button"
                    onClick={() => setCreating(true)}
                    className="group flex w-[5.5rem] flex-col items-center gap-3 sm:w-[6.5rem]"
                  >
                    <div className="flex h-[4.75rem] w-[4.75rem] items-center justify-center rounded-full border-2 border-dashed border-white/15 bg-white/[0.02] transition-all duration-300 group-hover:scale-[1.04] group-hover:border-accent/40 group-hover:bg-accent/[0.06] sm:h-[5.5rem] sm:w-[5.5rem]">
                      <Plus className="h-8 w-8 text-text-muted transition-colors group-hover:text-accent" />
                    </div>
                    <span className="text-center text-[14px] text-text-muted transition-colors group-hover:text-text-secondary">
                      Aggiungi
                    </span>
                  </motion.button>
                )}
              </div>

              {profiles.length > 0 && (
                <button
                  type="button"
                  onClick={isManaging ? stopManaging : startManaging}
                  className="mt-14 inline-flex items-center gap-2 rounded-full px-4 py-2 text-[13px] text-text-muted transition-colors hover:text-text-secondary"
                >
                  {isManaging ? (
                    <>
                      <ArrowLeft className="h-3.5 w-3.5" />
                      Fine
                    </>
                  ) : (
                    <>
                      <Settings2 className="h-3.5 w-3.5" />
                      Gestisci profili
                    </>
                  )}
                </button>
              )}
            </motion.div>
          )}
        </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
