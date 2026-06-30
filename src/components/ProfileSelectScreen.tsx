import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Pencil, ArrowLeft, Trash2, Lock } from "lucide-react";
import { useProfile } from "../context/ProfileContext";
import { isBrowserDevMode } from "../lib/tauriEnv";
import { ProfileAvatar } from "./ProfileAvatar";
import {
  PROFILE_COLORS,
  PROFILE_EMOJIS,
  roleLabel,
  type CreateProfileInput,
  type Profile,
  type ProfileRole,
  type UpdateProfileInput,
} from "../types/profile";

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

  const [creating, setCreating] = useState(false);
  const [editingProfile, setEditingProfile] = useState<Profile | null>(null);
  const browserDev = isBrowserDevMode();

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
                  ? "Crea il primo profilo per iniziare"
                  : isManaging
                    ? "Modifica o elimina i profili"
                    : "Scegli il tuo profilo per continuare"}
            </p>
          )}
        </div>

        <AnimatePresence mode="wait">
          {creating ? (
            <CreateProfileForm
              key="create"
              onCancel={() => setCreating(false)}
              onSubmit={async (input) => {
                const profile = await createNewProfile(input);
                setCreating(false);
                selectProfile(profile);
              }}
            />
          ) : editingProfile ? (
            <EditProfileForm
              key={editingProfile.id}
              profile={editingProfile}
              onCancel={() => setEditingProfile(null)}
              onSubmit={async (input) => {
                await updateExistingProfile(editingProfile.id, input);
                setEditingProfile(null);
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

function CreateProfileForm({
  onCancel,
  onSubmit,
}: {
  onCancel: () => void;
  onSubmit: (input: CreateProfileInput) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [role, setRole] = useState<ProfileRole>("child");
  const [color, setColor] = useState<string>(PROFILE_COLORS[0]);
  const [emoji, setEmoji] = useState<string>(PROFILE_EMOJIS[2]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const preview: Profile = {
    id: "preview",
    name: name || "Nome",
    role,
    avatarColor: color,
    avatarEmoji: emoji,
    createdAt: "",
    hasPin: false,
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("Inserisci un nome");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit({
        name: name.trim(),
        role,
        avatarColor: color,
        avatarEmoji: emoji,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSubmitting(false);
    }
  };

  return (
    <ProfileFormShell preview={preview} error={error}>
      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-8">
        <NameRoleFields name={name} setName={setName} role={role} setRole={setRole} />
        <AvatarFields color={color} setColor={setColor} emoji={emoji} setEmoji={setEmoji} />
        <SubmitRow submitting={submitting} label="Crea profilo" onCancel={onCancel} />
      </form>
    </ProfileFormShell>
  );
}

function EditProfileForm({
  profile,
  onCancel,
  onSubmit,
}: {
  profile: Profile;
  onCancel: () => void;
  onSubmit: (input: UpdateProfileInput) => Promise<void>;
}) {
  const [name, setName] = useState(profile.name);
  const [role, setRole] = useState<ProfileRole>(profile.role);
  const [color, setColor] = useState(profile.avatarColor);
  const [emoji, setEmoji] = useState(profile.avatarEmoji ?? PROFILE_EMOJIS[2]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const preview: Profile = {
    ...profile,
    name: name || profile.name,
    role,
    avatarColor: color,
    avatarEmoji: emoji,
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("Inserisci un nome");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit({
        name: name.trim(),
        role,
        avatarColor: color,
        avatarEmoji: emoji,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSubmitting(false);
    }
  };

  return (
    <ProfileFormShell preview={preview} error={error}>
      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-8">
        <NameRoleFields name={name} setName={setName} role={role} setRole={setRole} />
        <AvatarFields color={color} setColor={setColor} emoji={emoji} setEmoji={setEmoji} />
        <SubmitRow submitting={submitting} label="Salva modifiche" onCancel={onCancel} />
      </form>
    </ProfileFormShell>
  );
}

function ProfileFormShell({
  preview,
  error,
  children,
}: {
  preview: Profile;
  error: string | null;
  children: React.ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      className="mx-auto max-w-md"
    >
      <div className="mb-8 flex justify-center">
        <ProfileAvatar profile={preview} size="xl" />
      </div>
      {children}
      {error && <p className="mt-4 text-center text-[13px] text-warm">{error}</p>}
    </motion.div>
  );
}

function NameRoleFields({
  name,
  setName,
  role,
  setRole,
}: {
  name: string;
  setName: (v: string) => void;
  role: ProfileRole;
  setRole: (v: ProfileRole) => void;
}) {
  return (
    <>
      <div>
        <label className="mb-2 block text-[11px] font-medium uppercase tracking-[0.2em] text-text-muted">
          Nome
        </label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="es. Papà, Sofia, Marco..."
          autoFocus
          className="w-full rounded-xl border border-white/[0.06] bg-white/[0.03] px-4 py-3 text-[14px] text-text-primary outline-none focus:border-accent/30"
        />
      </div>
      <div>
        <label className="mb-3 block text-[11px] font-medium uppercase tracking-[0.2em] text-text-muted">
          Tipo profilo
        </label>
        <div className="grid grid-cols-3 gap-2">
          {(
            [
              ["parent", "Papà / Mamma", "Gestisce la libreria"],
              ["child", "Bambino", "Solo titoli approvati"],
              ["other", "Ospite", "Famiglia o amici"],
            ] as const
          ).map(([id, label, desc]) => (
            <button
              key={id}
              type="button"
              onClick={() => setRole(id)}
              className={`rounded-xl border p-3 text-left transition-all ${
                role === id
                  ? "border-accent/40 bg-accent/10"
                  : "border-white/[0.06] hover:border-white/10"
              }`}
            >
              <p className="text-[12px] font-medium text-text-primary">{label}</p>
              <p className="mt-0.5 text-[10px] text-text-muted">{desc}</p>
            </button>
          ))}
        </div>
      </div>
    </>
  );
}

function AvatarFields({
  color,
  setColor,
  emoji,
  setEmoji,
}: {
  color: string;
  setColor: (v: string) => void;
  emoji: string;
  setEmoji: (v: string) => void;
}) {
  return (
    <>
      <div>
        <label className="mb-3 block text-[11px] font-medium uppercase tracking-[0.2em] text-text-muted">
          Colore avatar
        </label>
        <div className="flex flex-wrap gap-2">
          {PROFILE_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setColor(c)}
              className={`h-8 w-8 rounded-full transition-transform ${
                color === c ? "scale-110 ring-2 ring-white ring-offset-2 ring-offset-void" : ""
              }`}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
      </div>
      <div>
        <label className="mb-3 block text-[11px] font-medium uppercase tracking-[0.2em] text-text-muted">
          Emoji avatar
        </label>
        <div className="flex flex-wrap gap-2">
          {PROFILE_EMOJIS.map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => setEmoji(e)}
              className={`flex h-10 w-10 items-center justify-center rounded-lg text-xl transition-all ${
                emoji === e
                  ? "bg-white/10 ring-1 ring-accent/40"
                  : "bg-white/[0.03] hover:bg-white/[0.06]"
              }`}
            >
              {e}
            </button>
          ))}
        </div>
      </div>
    </>
  );
}

function SubmitRow({
  submitting,
  label,
  onCancel,
}: {
  submitting: boolean;
  label: string;
  onCancel: () => void;
}) {
  return (
    <div className="flex justify-center gap-3">
      <button
        type="submit"
        disabled={submitting}
        className="rounded-full bg-text-primary px-6 py-2.5 text-[13px] font-medium text-void hover:bg-white disabled:opacity-50"
      >
        {submitting ? "Salvataggio..." : label}
      </button>
      <button
        type="button"
        onClick={onCancel}
        className="rounded-full border border-white/10 px-5 py-2.5 text-[13px] text-text-secondary hover:text-text-primary"
      >
        Annulla
      </button>
    </div>
  );
}
