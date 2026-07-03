import { useState } from "react";
import { motion } from "framer-motion";
import { ProfileAvatar } from "../ProfileAvatar";
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
  };
}

export function valueFromProfile(profile: Profile): ProfileCustomizeValue {
  const avatarStyle =
    profile.avatarStyle ?? (profile.avatarEmoji ? "emoji" : "initial");
  return {
    name: profile.name,
    role: profile.role,
    avatarColor: profile.avatarColor,
    accentColor: profile.accentColor ?? PROFILE_COLORS[1],
    avatarStyle,
    avatarEmoji: profile.avatarEmoji ?? PROFILE_EMOJIS[2],
  };
}

const STYLE_OPTIONS: { id: ProfileAvatarStyle; label: string; hint: string }[] = [
  { id: "emoji", label: "Emoji", hint: "Scegli un'icona" },
  { id: "initial", label: "Iniziale", hint: "Lettera del nome" },
  { id: "gradient", label: "Gradiente", hint: "Due colori" },
];

export function ProfileCustomizeForm({
  initial,
  showRole = true,
  submitLabel,
  submitting,
  error,
  onCancel,
  onSubmit,
}: {
  initial: ProfileCustomizeValue;
  showRole?: boolean;
  submitLabel: string;
  submitting?: boolean;
  error?: string | null;
  onCancel: () => void;
  onSubmit: (value: ProfileCustomizeValue) => Promise<void>;
}) {
  const [value, setValue] = useState(initial);
  const preview = toPreview({ id: "preview" }, value);

  const patch = (partial: Partial<ProfileCustomizeValue>) =>
    setValue((current) => ({ ...current, ...partial }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!value.name.trim()) return;
    await onSubmit(value);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      className="mx-auto w-full max-w-md"
    >
      <div className="mb-8 flex flex-col items-center gap-3">
        <ProfileAvatar profile={preview} size="xl" />
        <p className="text-[10px] uppercase tracking-[0.28em] text-text-muted">
          Anteprima
        </p>
      </div>

      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-7">
        <div>
          <label className="mb-2 block text-[10px] font-medium uppercase tracking-[0.28em] text-text-muted">
            Nome
          </label>
          <input
            value={value.name}
            onChange={(e) => patch({ name: e.target.value })}
            placeholder="es. Papà, Sofia, Marco..."
            autoFocus
            className="w-full border-b border-white/10 bg-transparent px-0 py-2 font-display text-[15px] tracking-[-0.02em] text-text-primary outline-none transition-colors placeholder:text-text-muted/60 focus:border-white/35"
          />
        </div>

        {showRole && (
          <div>
            <label className="mb-3 block text-[10px] font-medium uppercase tracking-[0.28em] text-text-muted">
              Tipo profilo
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  ["parent", "Genitore", "Gestisce tutto"],
                  ["child", "Bambino", "Contenuti filtrati"],
                  ["other", "Ospite", "Accesso limitato"],
                ] as const
              ).map(([id, label, desc]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => patch({ role: id })}
                  className={`rounded-lg border px-2 py-2.5 text-left transition-colors ${
                    value.role === id
                      ? "border-white/25 bg-white/[0.06]"
                      : "border-white/[0.06] hover:border-white/12"
                  }`}
                >
                  <p className="text-[11px] font-medium text-text-primary">{label}</p>
                  <p className="mt-0.5 text-[9px] leading-snug text-text-muted">{desc}</p>
                </button>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-text-muted">
              Ruolo attuale: {roleLabel(value.role)}
            </p>
          </div>
        )}

        <div>
          <label className="mb-3 block text-[10px] font-medium uppercase tracking-[0.28em] text-text-muted">
            Stile avatar
          </label>
          <div className="grid grid-cols-3 gap-2">
            {STYLE_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => patch({ avatarStyle: opt.id })}
                className={`rounded-lg border px-2 py-2 text-left transition-colors ${
                  value.avatarStyle === opt.id
                    ? "border-white/25 bg-white/[0.06]"
                    : "border-white/[0.06] hover:border-white/12"
                }`}
              >
                <p className="text-[11px] font-medium text-text-primary">{opt.label}</p>
                <p className="mt-0.5 text-[9px] text-text-muted">{opt.hint}</p>
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="mb-3 block text-[10px] font-medium uppercase tracking-[0.28em] text-text-muted">
            {value.avatarStyle === "gradient" ? "Colore principale" : "Colore"}
          </label>
          <div className="flex flex-wrap items-center gap-2">
            {PROFILE_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => patch({ avatarColor: c })}
                className={`h-7 w-7 rounded-full transition-transform ${
                  value.avatarColor === c
                    ? "scale-110 ring-2 ring-white ring-offset-2 ring-offset-void"
                    : ""
                }`}
                style={{ backgroundColor: c }}
                aria-label={`Colore ${c}`}
              />
            ))}
            <label className="relative ml-1 flex h-8 cursor-pointer items-center gap-2 rounded-lg border border-white/[0.08] px-2 text-[10px] uppercase tracking-wider text-text-muted hover:border-white/15">
              <input
                type="color"
                value={value.avatarColor}
                onChange={(e) => patch({ avatarColor: e.target.value })}
                className="h-5 w-5 cursor-pointer rounded border-0 bg-transparent p-0"
              />
              Custom
            </label>
          </div>
        </div>

        {value.avatarStyle === "gradient" && (
          <div>
            <label className="mb-3 block text-[10px] font-medium uppercase tracking-[0.28em] text-text-muted">
              Colore secondario
            </label>
            <div className="flex flex-wrap items-center gap-2">
              {PROFILE_COLORS.map((c) => (
                <button
                  key={`accent-${c}`}
                  type="button"
                  onClick={() => patch({ accentColor: c })}
                  className={`h-7 w-7 rounded-full transition-transform ${
                    value.accentColor === c
                      ? "scale-110 ring-2 ring-white ring-offset-2 ring-offset-void"
                      : ""
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
              <label className="relative ml-1 flex h-8 cursor-pointer items-center gap-2 rounded-lg border border-white/[0.08] px-2 text-[10px] uppercase tracking-wider text-text-muted">
                <input
                  type="color"
                  value={value.accentColor ?? PROFILE_COLORS[1]}
                  onChange={(e) => patch({ accentColor: e.target.value })}
                  className="h-5 w-5 cursor-pointer rounded border-0 bg-transparent p-0"
                />
                Custom
              </label>
            </div>
          </div>
        )}

        {value.avatarStyle === "emoji" && (
          <div>
            <label className="mb-3 block text-[10px] font-medium uppercase tracking-[0.28em] text-text-muted">
              Emoji
            </label>
            <div className="grid grid-cols-8 gap-1.5 sm:grid-cols-10">
              {PROFILE_EMOJIS.map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => patch({ avatarEmoji: e })}
                  className={`flex h-9 w-9 items-center justify-center rounded-lg text-lg transition-colors ${
                    value.avatarEmoji === e
                      ? "bg-white/10 ring-1 ring-white/25"
                      : "bg-white/[0.03] hover:bg-white/[0.06]"
                  }`}
                >
                  {e}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="flex justify-center gap-3 pt-2">
          <button
            type="submit"
            disabled={submitting || !value.name.trim()}
            className="rounded-full bg-text-primary px-6 py-2.5 text-[12px] font-medium uppercase tracking-[0.12em] text-void hover:bg-white disabled:opacity-50"
          >
            {submitting ? "Salvataggio..." : submitLabel}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-full border border-white/10 px-6 py-2.5 text-[12px] font-medium uppercase tracking-[0.12em] text-text-muted hover:border-white/20 hover:text-text-secondary"
          >
            Annulla
          </button>
        </div>
      </form>

      {error && (
        <p className="mt-4 text-center text-[13px] text-warm">{error}</p>
      )}
    </motion.div>
  );
}
