import { useRef, useState, type ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Camera,
  ImagePlus,
  Palette,
  Smile,
  Trash2,
  Type,
} from "lucide-react";
import { isTauri } from "@tauri-apps/api/core";
import { useCloudAccount } from "../../context/CloudAccountContext";
import { isCloudEnabled } from "../../lib/cloudConfig";
import { ProfileAvatar } from "../ProfileAvatar";
import {
  PROFILE_AVATAR_ACCEPT,
  pickProfileAvatarPath,
  profileAvatarPreviewFromPath,
  readProfileAvatarFile,
} from "../../lib/profileAvatar";
import {
  PROFILE_COLORS,
  PROFILE_EMOJIS,
  roleLabel,
  type CreateProfileInput,
  type Profile,
  type ProfileAvatarStyle,
  type ProfileRole,
  type UpdateProfileInput,
} from "../../types/profile";

export interface ProfileCustomizeValue {
  name: string;
  role: ProfileRole;
  avatarColor: string;
  accentColor?: string;
  avatarStyle: ProfileAvatarStyle;
  avatarEmoji?: string;
  avatarImagePath?: string;
}

function toPreview(base: Partial<Profile>, value: ProfileCustomizeValue): Profile {
  return {
    id: base.id ?? "preview",
    name: value.name || "Nome",
    role: value.role,
    avatarColor: value.avatarColor,
    accentColor: value.accentColor,
    avatarStyle: value.avatarStyle,
    avatarEmoji: value.avatarStyle === "emoji" ? value.avatarEmoji : undefined,
    avatarImagePath:
      value.avatarStyle === "photo" ? value.avatarImagePath : undefined,
    createdAt: base.createdAt ?? "",
    hasPin: base.hasPin ?? false,
  };
}

export function profileCustomizeToCreate(
  value: ProfileCustomizeValue,
): CreateProfileInput {
  return {
    name: value.name.trim(),
    role: value.role,
    avatarColor: value.avatarColor,
    accentColor:
      value.avatarStyle === "gradient" ? value.accentColor : undefined,
    avatarStyle: value.avatarStyle,
    avatarEmoji: value.avatarStyle === "emoji" ? value.avatarEmoji : undefined,
  };
}

export function profileCustomizeToUpdate(
  value: ProfileCustomizeValue,
): UpdateProfileInput {
  return {
    name: value.name.trim(),
    role: value.role,
    avatarColor: value.avatarColor,
    accentColor:
      value.avatarStyle === "gradient" ? (value.accentColor ?? null) : null,
    avatarStyle: value.avatarStyle,
    avatarEmoji:
      value.avatarStyle === "emoji" ? (value.avatarEmoji ?? null) : null,
    avatarImagePath:
      value.avatarStyle === "photo"
        ? (value.avatarImagePath ?? null)
        : null,
  };
}

export function valueFromProfile(profile: Profile): ProfileCustomizeValue {
  const avatarStyle =
    profile.avatarStyle ??
    (profile.avatarImagePath ? "photo" : profile.avatarEmoji ? "emoji" : "initial");
  return {
    name: profile.name,
    role: profile.role,
    avatarColor: profile.avatarColor,
    accentColor: profile.accentColor ?? PROFILE_COLORS[1],
    avatarStyle,
    avatarEmoji: profile.avatarEmoji ?? PROFILE_EMOJIS[2],
    avatarImagePath: profile.avatarImagePath,
  };
}

const STYLE_OPTIONS: {
  id: ProfileAvatarStyle;
  label: string;
  icon: typeof Camera;
}[] = [
  { id: "photo", label: "Foto", icon: Camera },
  { id: "emoji", label: "Emoji", icon: Smile },
  { id: "initial", label: "Lettera", icon: Type },
  { id: "gradient", label: "Colore", icon: Palette },
];

const ROLE_OPTIONS: { id: ProfileRole; label: string; desc: string }[] = [
  { id: "parent", label: "Genitore", desc: "Controllo completo" },
  { id: "child", label: "Bambino", desc: "Contenuti filtrati" },
  { id: "other", label: "Ospite", desc: "Accesso base" },
];

function Section({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-white/[0.07] bg-[#0a0a0e]/80 p-4 sm:p-5">
      <h3 className="mb-4 font-display text-[15px] font-medium tracking-[-0.02em] text-text-primary">
        {title}
      </h3>
      {children}
    </section>
  );
}

function ColorSwatches({
  value,
  onChange,
}: {
  value: string;
  onChange: (color: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {PROFILE_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          className={`h-8 w-8 rounded-full transition-transform ${
            value === c
              ? "scale-110 ring-2 ring-white ring-offset-2 ring-offset-[#0a0a0e]"
              : "hover:scale-105"
          }`}
          style={{ backgroundColor: c }}
          aria-label={`Colore ${c}`}
        />
      ))}
      <label className="flex h-9 cursor-pointer items-center gap-2 rounded-full border border-white/10 px-3 text-[12px] text-text-muted transition-colors hover:border-white/20">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-5 w-5 cursor-pointer rounded-full border-0 bg-transparent p-0"
        />
        Altro
      </label>
    </div>
  );
}

function ProfileFormActions({
  dockActions,
  submitLabel,
  submitting,
  canSubmit,
  onCancel,
}: {
  dockActions: boolean;
  submitLabel: string;
  submitting?: boolean;
  canSubmit: boolean;
  onCancel: () => void;
}) {
  const docked =
    "fixed inset-x-0 bottom-0 z-20 border-t border-white/[0.08] bg-[#05000d]/94 px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur-xl sm:static sm:z-auto sm:mx-auto sm:mt-2 sm:max-w-md sm:border-0 sm:bg-transparent sm:px-0 sm:py-0 sm:pb-0 sm:backdrop-blur-none";
  const embedded =
    "sticky bottom-0 -mx-1 border-t border-white/[0.06] bg-[#0a0a0e]/95 px-1 pb-1 pt-4 backdrop-blur-sm";

  return (
    <div className={dockActions ? docked : embedded}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-center sm:gap-4">
        <motion.button
          type="button"
          whileTap={{ scale: 0.98 }}
          whileHover={{ scale: 1.01 }}
          onClick={onCancel}
          className="min-h-12 w-full touch-manipulation rounded-xl border border-white/12 bg-white/[0.03] px-5 py-3.5 text-[15px] font-medium text-text-muted transition-colors hover:border-white/20 hover:bg-white/[0.06] hover:text-text-secondary sm:min-w-[9.5rem] sm:w-auto"
        >
          Annulla
        </motion.button>
        <motion.button
          type="submit"
          disabled={submitting || !canSubmit}
          whileTap={submitting || !canSubmit ? undefined : { scale: 0.98 }}
          whileHover={submitting || !canSubmit ? undefined : { scale: 1.01 }}
          className="min-h-12 w-full touch-manipulation rounded-xl bg-accent px-6 py-3.5 text-[15px] font-semibold text-white shadow-[0_10px_30px_rgba(255,103,64,0.28)] transition-opacity hover:opacity-95 disabled:opacity-40 sm:min-w-[11rem] sm:w-auto"
        >
          {submitting ? "Salvataggio..." : submitLabel}
        </motion.button>
      </div>
    </div>
  );
}

export function ProfileCustomizeForm({
  initial,
  previewProfileId,
  showRole = true,
  submitLabel,
  submitting,
  error,
  dockActions = false,
  onCancel,
  onSubmit,
}: {
  initial: ProfileCustomizeValue;
  previewProfileId?: string;
  showRole?: boolean;
  submitLabel: string;
  submitting?: boolean;
  error?: string | null;
  dockActions?: boolean;
  onCancel: () => void;
  onSubmit: (value: ProfileCustomizeValue) => Promise<void>;
}) {
  const [value, setValue] = useState(initial);
  const [localError, setLocalError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { profile: cloudProfile, configured: cloudConfigured } = useCloudAccount();
  const preview = toPreview({ id: previewProfileId ?? "preview" }, value);
  const showCloudAvatarHint =
    isCloudEnabled() &&
    cloudConfigured &&
    value.avatarStyle === "photo";

  const patch = (partial: Partial<ProfileCustomizeValue>) =>
    setValue((current) => ({ ...current, ...partial }));

  const applyImagePath = (path: string) => {
    patch({ avatarStyle: "photo", avatarImagePath: path });
    setLocalError(null);
  };

  const pickPhoto = async () => {
    try {
      if (isTauri()) {
        const path = await pickProfileAvatarPath();
        if (path) applyImagePath(path);
        return;
      }
      fileInputRef.current?.click();
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : String(err));
    }
  };

  const onFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const dataUrl = await readProfileAvatarFile(file);
      applyImagePath(dataUrl);
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!value.name.trim()) return;
    if (value.avatarStyle === "photo" && !value.avatarImagePath) {
      setLocalError("Carica una foto profilo in formato JPEG (.jpg).");
      return;
    }
    setLocalError(null);
    await onSubmit(value);
  };

  const showColorPickers =
    value.avatarStyle === "emoji" ||
    value.avatarStyle === "initial" ||
    value.avatarStyle === "gradient";

  const glow =
    value.avatarStyle === "gradient"
      ? `radial-gradient(circle at 50% 50%, ${value.avatarColor}55 0%, ${value.accentColor ?? value.avatarColor}22 45%, transparent 70%)`
      : `radial-gradient(circle at 50% 50%, ${value.avatarColor}44 0%, transparent 68%)`;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      className={`mx-auto w-full max-w-xl ${dockActions ? "pb-28 sm:pb-4" : "pb-2"}`}
    >
      <form onSubmit={(e) => void handleSubmit(e)}>
        <div className="flex flex-col items-center gap-8">
          <aside className="flex w-full justify-center">
            <div
              className="relative flex w-full max-w-[240px] flex-col items-center rounded-3xl border border-white/[0.08] bg-[#0a0a0e]/90 px-6 py-8"
              style={{ boxShadow: `0 24px 80px ${value.avatarColor}18` }}
            >
              <div
                className="pointer-events-none absolute inset-0 rounded-3xl opacity-80"
                style={{ background: glow }}
              />
              <div className="relative mb-5">
                <ProfileAvatar
                  profile={preview}
                  size="xl"
                  className="h-32 w-32 rounded-full shadow-[0_16px_40px_rgba(0,0,0,0.45)]"
                />
              </div>
              <p className="relative text-center font-display text-[18px] font-semibold tracking-[-0.03em] text-text-primary">
                {value.name.trim() || "Il tuo profilo"}
              </p>
              <p className="relative mt-1 text-[12px] text-text-muted">
                {roleLabel(value.role)}
              </p>
            </div>
          </aside>

          <div className="w-full max-w-xl space-y-4">
            <Section title="Nome">
              <input
                value={value.name}
                onChange={(e) => patch({ name: e.target.value })}
                placeholder="Come ti chiami?"
                autoFocus
                className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 font-display text-[16px] tracking-[-0.02em] text-text-primary outline-none transition-colors placeholder:text-text-muted/50 focus:border-white/25 focus:bg-white/[0.05]"
              />
            </Section>

            {showRole && (
              <Section title="Tipo di profilo">
                <div className="grid gap-2 sm:grid-cols-3">
                  {ROLE_OPTIONS.map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => patch({ role: opt.id })}
                      className={`rounded-xl border px-3 py-3 text-left transition-all ${
                        value.role === opt.id
                          ? "border-accent/40 bg-accent/10"
                          : "border-white/[0.07] bg-white/[0.02] hover:border-white/14"
                      }`}
                    >
                      <p className="text-[13px] font-medium text-text-primary">
                        {opt.label}
                      </p>
                      <p className="mt-0.5 text-[11px] text-text-muted">{opt.desc}</p>
                    </button>
                  ))}
                </div>
              </Section>
            )}

            <Section title="Avatar">
              <div className="mb-4 flex flex-wrap gap-1 rounded-xl bg-white/[0.04] p-1">
                {STYLE_OPTIONS.map((opt) => {
                  const Icon = opt.icon;
                  const active = value.avatarStyle === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => patch({ avatarStyle: opt.id })}
                      className={`flex flex-1 min-w-[4.5rem] items-center justify-center gap-1.5 rounded-lg px-2 py-2.5 text-[12px] font-medium transition-all ${
                        active
                          ? "bg-white/12 text-text-primary shadow-sm"
                          : "text-text-muted hover:text-text-secondary"
                      }`}
                    >
                      <Icon className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
                      {opt.label}
                    </button>
                  );
                })}
              </div>

              <AnimatePresence mode="wait">
                {value.avatarStyle === "photo" && (
                  <motion.div
                    key="photo"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden"
                  >
                    <button
                      type="button"
                      onClick={() => void pickPhoto()}
                      className="flex w-full flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-white/14 bg-white/[0.02] px-4 py-8 transition-colors hover:border-accent/35 hover:bg-accent/[0.04]"
                    >
                      {value.avatarImagePath ? (
                        <img
                          src={profileAvatarPreviewFromPath(value.avatarImagePath)}
                          alt=""
                          className="h-24 w-24 rounded-full object-cover ring-2 ring-white/15"
                        />
                      ) : (
                        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white/[0.06]">
                          <ImagePlus className="h-6 w-6 text-text-muted" />
                        </span>
                      )}
                      <span className="text-[13px] text-text-secondary">
                        {value.avatarImagePath
                          ? "Tocca per cambiare foto"
                          : "Carica JPEG (.jpg) · max 1 MB"}
                      </span>
                      {showCloudAvatarHint && (
                        <span className="max-w-xs text-center text-[11px] leading-relaxed text-text-muted">
                          {cloudProfile
                            ? "Con l'account cloud attivo, la foto sarà visibile agli amici cloud e sincronizzata su altri dispositivi."
                            : "Accedi all'account cloud per condividere la foto con gli amici e sincronizzarla tra dispositivi."}
                        </span>
                      )}
                    </button>
                    {value.avatarImagePath && (
                      <button
                        type="button"
                        onClick={() => patch({ avatarImagePath: undefined })}
                        className="mt-3 inline-flex items-center gap-1.5 text-[12px] text-warm transition-opacity hover:opacity-80"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Rimuovi foto
                      </button>
                    )}
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept={PROFILE_AVATAR_ACCEPT}
                      className="hidden"
                      onChange={(e) => void onFileChange(e)}
                    />
                  </motion.div>
                )}

                {value.avatarStyle === "emoji" && (
                  <motion.div
                    key="emoji"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="grid grid-cols-6 gap-2 sm:grid-cols-8 sm:gap-1.5 md:grid-cols-10"
                  >
                    {PROFILE_EMOJIS.map((e) => (
                      <button
                        key={e}
                        type="button"
                        onClick={() => patch({ avatarEmoji: e })}
                        className={`flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl text-xl transition-all active:scale-95 ${
                          value.avatarEmoji === e
                            ? "bg-accent/15 ring-1 ring-accent/40"
                            : "bg-white/[0.03] hover:bg-white/[0.07]"
                        }`}
                      >
                        {e}
                      </button>
                    ))}
                  </motion.div>
                )}

                {showColorPickers && value.avatarStyle !== "emoji" && (
                  <motion.div
                    key="colors"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="space-y-4"
                  >
                    <div>
                      <p className="mb-2 text-[12px] text-text-muted">
                        {value.avatarStyle === "gradient"
                          ? "Colore principale"
                          : "Colore di sfondo"}
                      </p>
                      <ColorSwatches
                        value={value.avatarColor}
                        onChange={(c) => patch({ avatarColor: c })}
                      />
                    </div>
                    {value.avatarStyle === "gradient" && (
                      <div>
                        <p className="mb-2 text-[12px] text-text-muted">
                          Colore secondario
                        </p>
                        <ColorSwatches
                          value={value.accentColor ?? PROFILE_COLORS[1]}
                          onChange={(c) => patch({ accentColor: c })}
                        />
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </Section>

            {(error || localError) && (
              <p className="rounded-xl border border-warm/20 bg-warm/10 px-4 py-3 text-[13px] text-warm">
                {error ?? localError}
              </p>
            )}

            <ProfileFormActions
              dockActions={dockActions}
              submitLabel={submitLabel}
              submitting={submitting}
              canSubmit={Boolean(value.name.trim())}
              onCancel={onCancel}
            />
          </div>
        </div>
      </form>
    </motion.div>
  );
}
