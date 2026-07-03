import { motion } from "framer-motion";
import type { Profile } from "../../types/profile";
import { roleLabel } from "../../types/profile";
import { ProfileAvatar } from "../ProfileAvatar";

interface ProfileHeroProps {
  profile: Profile;
  watchedCount: number;
  listCount: number;
  onlineFriendsCount: number;
  onCustomize: () => void;
}

export function ProfileHero({
  profile,
  watchedCount,
  listCount,
  onlineFriendsCount,
  onCustomize,
}: ProfileHeroProps) {
  const accent = profile.accentColor ?? profile.avatarColor;
  const gradient =
    profile.avatarStyle === "gradient"
      ? `linear-gradient(135deg, ${profile.avatarColor}55 0%, ${accent}33 45%, transparent 80%)`
      : `linear-gradient(135deg, ${profile.avatarColor}44 0%, transparent 70%)`;

  return (
    <div className="relative overflow-hidden border-b border-white/[0.06]">
      <div
        className="pointer-events-none absolute inset-0 opacity-90"
        style={{ background: gradient }}
      />
      <div className="noise-overlay pointer-events-none absolute inset-0 opacity-[0.12]" />
      <div className="page-px relative pb-10 pt-24 sm:pb-12 sm:pt-28">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between"
        >
          <div className="flex items-start gap-5">
            <ProfileAvatar profile={profile} size="lg" />
            <div className="min-w-0 pt-1">
              <p className="text-[10px] font-medium uppercase tracking-[0.34em] text-text-muted">
                Profilo
              </p>
              <h1 className="font-display mt-2 text-[clamp(2rem,4vw,3rem)] font-semibold leading-none tracking-[-0.04em] text-text-primary">
                {profile.name}
              </h1>
              <p className="mt-2 text-[13px] uppercase tracking-[0.18em] text-text-muted">
                {roleLabel(profile.role)}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onCustomize}
            className="inline-flex shrink-0 items-center self-start rounded-full border border-white/12 px-5 py-2.5 text-[11px] font-medium uppercase tracking-[0.14em] text-text-secondary transition-colors hover:border-white/25 hover:text-text-primary lg:self-auto"
          >
            Personalizza
          </button>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08, duration: 0.45 }}
          className="mt-10 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-white/[0.06] bg-white/[0.06] sm:grid-cols-4"
        >
          {[
            { label: "Guardati", value: watchedCount },
            { label: "In lista", value: listCount },
            { label: "Amici online", value: onlineFriendsCount },
          ].map((stat) => (
            <div
              key={stat.label}
              className="bg-[#070709] px-4 py-4 sm:px-5"
            >
              <p className="text-[10px] font-medium uppercase tracking-[0.28em] text-text-muted">
                {stat.label}
              </p>
              <p className="font-display mt-1.5 text-2xl font-semibold tabular-nums tracking-[-0.03em] text-text-primary">
                {stat.value}
              </p>
            </div>
          ))}
          <div className="col-span-2 bg-[#070709] px-4 py-4 sm:col-span-1 sm:px-5">
            <p className="text-[10px] font-medium uppercase tracking-[0.28em] text-text-muted">
              Stato
            </p>
            <p className="mt-2 flex items-center gap-2 text-[13px] text-text-secondary">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-mint opacity-40" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-mint" />
              </span>
              Attivo ora
            </p>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
