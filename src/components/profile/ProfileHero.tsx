import { motion } from "framer-motion";
import { Pencil, Lock } from "lucide-react";
import type { Profile } from "../../types/profile";
import { roleLabel } from "../../types/profile";
import { ProfileAvatar } from "../ProfileAvatar";
import { OnlineDot, ProfileStat } from "./ProfileUi";
import { Clock, Library, Users } from "lucide-react";

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

  return (
    <div className="page-px pt-24 pb-2 sm:pt-28">
      <div className="mx-auto max-w-3xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="flex flex-col items-center text-center"
        >
          <div className="relative mb-6">
            <div
              className="pointer-events-none absolute -inset-8 rounded-full opacity-40 blur-3xl"
              style={{ background: `radial-gradient(circle, ${accent}88 0%, transparent 70%)` }}
            />
            <div className="relative rounded-full p-1 ring-2 ring-white/15">
              <ProfileAvatar
                profile={profile}
                size="xl"
                className="h-[5.5rem] w-[5.5rem] rounded-full sm:h-[6.5rem] sm:w-[6.5rem]"
              />
            </div>
            {profile.hasPin && (
              <span className="absolute bottom-1 right-1 flex h-7 w-7 items-center justify-center rounded-full bg-void ring-2 ring-void">
                <Lock className="h-3.5 w-3.5 text-accent" />
              </span>
            )}
          </div>

          <h1 className="font-display text-[clamp(1.75rem,4vw,2.5rem)] font-semibold tracking-[-0.04em] text-text-primary">
            {profile.name}
          </h1>

          <span className="mt-2 inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1 text-[11px] font-medium uppercase tracking-[0.14em] text-text-muted">
            <OnlineDot online />
            {roleLabel(profile.role)}
          </span>

          <button
            type="button"
            onClick={onCustomize}
            className="mt-5 inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/[0.04] px-5 py-2.5 text-[13px] font-medium text-text-secondary transition-colors hover:border-white/25 hover:bg-white/[0.07] hover:text-text-primary"
          >
            <Pencil className="h-3.5 w-3.5" strokeWidth={2} />
            Personalizza profilo
          </button>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08, duration: 0.45 }}
          className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-3"
        >
          <ProfileStat label="Guardati" value={watchedCount} icon={Clock} />
          <ProfileStat label="In lista" value={listCount} icon={Library} />
          <ProfileStat
            label="Amici online"
            value={onlineFriendsCount}
            icon={Users}
            className="col-span-2 sm:col-span-1"
          />
        </motion.div>
      </div>
    </div>
  );
}
