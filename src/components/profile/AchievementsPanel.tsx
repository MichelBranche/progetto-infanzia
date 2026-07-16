import { Lock } from "lucide-react";
import { ListSkeleton } from "../Skeleton";
import {
  ACHIEVEMENT_CATEGORY_ICONS,
  ACHIEVEMENT_CATEGORY_LABELS,
  ACHIEVEMENT_DEFINITIONS,
  type AchievementCategory,
  type ProfileAchievementsState,
  achievementProgressLabel,
  statForCategory,
  unlockedAchievementIds,
} from "../../lib/achievements";
import { PROFILE_CARD } from "./ProfileUi";

interface AchievementsPanelProps {
  state: ProfileAchievementsState | null;
  loading: boolean;
}

function CategorySummary({
  category,
  state,
}: {
  category: AchievementCategory;
  state: ProfileAchievementsState;
}) {
  const Icon = ACHIEVEMENT_CATEGORY_ICONS[category];
  const current = statForCategory(state.stats, category);
  const categoryDefs = ACHIEVEMENT_DEFINITIONS.filter((item) => item.category === category);
  const unlockedInCategory = categoryDefs.filter((item) =>
    unlockedAchievementIds(state.unlocked).has(item.id),
  ).length;

  return (
    <div className="rounded-xl bg-white/[0.03] px-4 py-3.5">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-accent" strokeWidth={2} />
        <p className="text-[12px] font-medium uppercase tracking-[0.14em] text-text-muted">
          {ACHIEVEMENT_CATEGORY_LABELS[category]}
        </p>
      </div>
      <p className="font-display mt-2 text-xl font-semibold tracking-[-0.03em] text-text-primary">
        {current}
      </p>
      <p className="mt-1 text-[12px] text-text-muted">
        {unlockedInCategory}/{categoryDefs.length} traguardi ·{" "}
        {achievementProgressLabel(category, state.stats)}
      </p>
    </div>
  );
}

export function AchievementsPanel({ state, loading }: AchievementsPanelProps) {
  if (loading) {
    return (
      <div className="px-1 py-4">
        <ListSkeleton rows={5} variant="line" />
      </div>
    );
  }

  if (!state) {
    return (
      <div className={`${PROFILE_CARD} px-6 py-16 text-center`}>
        <p className="text-[14px] text-text-muted">
          Impossibile caricare i traguardi in questo momento.
        </p>
      </div>
    );
  }

  const unlockedIds = unlockedAchievementIds(state.unlocked);

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-3">
        <CategorySummary category="completions" state={state} />
        <CategorySummary category="friends" state={state} />
        <CategorySummary category="list" state={state} />
      </div>

      <section className={`${PROFILE_CARD} p-5 sm:p-6`}>
        <p className="mb-4 text-[11px] font-medium uppercase tracking-[0.22em] text-text-muted">
          Tutti i traguardi
        </p>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {ACHIEVEMENT_DEFINITIONS.map((achievement) => {
            const unlocked = unlockedIds.has(achievement.id);
            const Icon = achievement.icon;
            const current = statForCategory(state.stats, achievement.category);
            const progress = Math.min(100, Math.round((current / achievement.threshold) * 100));

            return (
              <div
                key={achievement.id}
                className={`rounded-2xl border p-4 transition-colors ${
                  unlocked
                    ? "border-accent/25 bg-accent/[0.08]"
                    : "border-white/[0.06] bg-white/[0.02]"
                }`}
              >
                <div className="flex items-start gap-3">
                  <span
                    className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${
                      unlocked ? "bg-accent/15 text-accent" : "bg-white/[0.05] text-text-muted"
                    }`}
                  >
                    {unlocked ? (
                      <Icon className="h-5 w-5" strokeWidth={2} />
                    ) : (
                      <Lock className="h-4 w-4" strokeWidth={2} />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-display text-[15px] font-medium tracking-[-0.02em] text-text-primary">
                      {achievement.title}
                    </p>
                    <p className="mt-1 text-[12px] leading-relaxed text-text-muted">
                      {achievement.description}
                    </p>
                    {!unlocked && (
                      <div className="mt-3">
                        <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                          <div
                            className="h-full rounded-full bg-accent transition-all"
                            style={{ width: `${progress}%` }}
                          />
                        </div>
                        <p className="mt-1.5 text-[11px] tabular-nums text-text-muted">
                          {current}/{achievement.threshold}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
