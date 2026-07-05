import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export const PROFILE_CARD =
  "rounded-2xl border border-white/[0.07] bg-[#0a0a0e]/80";

export function ProfileSectionLabel({ children }: { children: string }) {
  return (
    <p className="mb-3 text-[11px] font-medium uppercase tracking-[0.22em] text-text-muted">
      {children}
    </p>
  );
}

export function ProfileCard({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`${PROFILE_CARD} p-5 sm:p-6 ${className}`}>
      {children}
    </section>
  );
}

export function ProfileStat({
  label,
  value,
  icon: Icon,
  className = "",
}: {
  label: string;
  value: number | string;
  icon?: LucideIcon;
  className?: string;
}) {
  return (
    <div
      className={`flex flex-col gap-2 rounded-xl bg-white/[0.03] px-4 py-3.5 sm:px-5 sm:py-4 ${className}`}
    >
      <div className="flex items-center gap-2">
        {Icon && (
          <Icon className="h-3.5 w-3.5 shrink-0 text-accent" strokeWidth={2} />
        )}
        <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-text-muted">
          {label}
        </p>
      </div>
      <p className="font-display text-2xl font-semibold tabular-nums tracking-[-0.03em] text-text-primary">
        {value}
      </p>
    </div>
  );
}

export function ProfileTabBar<T extends string>({
  tabs,
  active,
  onChange,
  badge,
}: {
  tabs: { id: T; label: string; icon?: LucideIcon }[];
  active: T;
  onChange: (id: T) => void;
  badge?: Partial<Record<T, number>>;
}) {
  return (
    <div className="flex justify-center">
      <nav
        className="inline-flex max-w-full gap-1 overflow-x-auto rounded-full border border-white/[0.07] bg-white/[0.03] p-1"
        aria-label="Sezioni profilo"
      >
        {tabs.map(({ id, label, icon: Icon }) => {
          const isActive = active === id;
          const count = badge?.[id];
          return (
            <button
              key={id}
              type="button"
              onClick={() => onChange(id)}
              className={`relative flex shrink-0 items-center gap-2 rounded-full px-4 py-2 text-[13px] font-medium transition-colors sm:px-5 ${
                isActive
                  ? "bg-white/[0.1] text-text-primary shadow-sm"
                  : "text-text-muted hover:text-text-secondary"
              }`}
            >
              {Icon && <Icon className="h-4 w-4 shrink-0" strokeWidth={1.85} />}
              {label}
              {count != null && count > 0 && (
                <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[9px] font-semibold text-white">
                  {count > 9 ? "9+" : count}
                </span>
              )}
            </button>
          );
        })}
      </nav>
    </div>
  );
}

export function ProfileEmptyState({
  icon: Icon,
  title,
  description,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
}) {
  return (
    <div className={`${PROFILE_CARD} flex flex-col items-center px-6 py-16 text-center sm:py-20`}>
      <span className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-white/[0.04]">
        <Icon className="h-6 w-6 text-text-muted/60" strokeWidth={1.5} />
      </span>
      <h3 className="font-display text-lg font-medium tracking-[-0.02em] text-text-primary">
        {title}
      </h3>
      <p className="mt-2 max-w-sm text-[14px] leading-relaxed text-text-muted">
        {description}
      </p>
    </div>
  );
}

export function OnlineDot({ online, away }: { online: boolean; away?: boolean }) {
  if (!online) {
    return (
      <span
        className="inline-flex h-2 w-2 rounded-full bg-white/20"
        title="Offline"
      />
    );
  }
  return (
    <span className="relative inline-flex h-2 w-2" title={away ? "Assente" : "Online"}>
      {!away && (
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-mint opacity-35" />
      )}
      <span
        className={`relative inline-flex h-2 w-2 rounded-full ${
          away ? "bg-amber-400" : "bg-mint"
        }`}
      />
    </span>
  );
}

export function FriendListRow({
  name,
  subtitle,
  online,
  away,
  avatarUrl,
  trailing,
}: {
  name: string;
  subtitle?: string;
  online: boolean;
  away?: boolean;
  avatarUrl?: string;
  trailing?: ReactNode;
}) {
  const initial = name.trim().charAt(0).toUpperCase() || "?";

  return (
    <li className="flex items-center gap-3 border-b border-white/[0.05] py-3 last:border-0">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white/[0.06] font-display text-[14px] font-semibold text-text-primary">
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt=""
            className="h-full w-full object-cover"
            draggable={false}
          />
        ) : (
          initial
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <OnlineDot online={online} away={away} />
          <p className="truncate font-display text-[14px] font-medium tracking-[-0.02em] text-text-primary">
            {name}
          </p>
        </div>
        {subtitle && (
          <p className="mt-0.5 truncate text-[12px] text-text-muted">{subtitle}</p>
        )}
      </div>
      {trailing}
    </li>
  );
}
