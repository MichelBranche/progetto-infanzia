import { motion } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Loader2, RefreshCw, Terminal } from "lucide-react";
import {
  PROFILE_CARD,
  ProfileEmptyState,
  ProfileSectionLabel,
  ProfileStat,
  ProfileTabBar,
} from "../profile/ProfileUi";

export { ProfileCard } from "../profile/ProfileUi";
export { ProfileEmptyState, ProfileSectionLabel, ProfileStat, ProfileTabBar };

export function DevHero({
  onRefresh,
  refreshing,
}: {
  onRefresh: () => void;
  refreshing?: boolean;
}) {
  return (
    <div className="page-px pt-24 pb-2 sm:pt-28">
      <div className="mx-auto max-w-5xl">
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
          className="flex flex-col items-center text-center"
        >
          <div className="relative mb-5">
            <div className="pointer-events-none absolute -inset-10 rounded-full bg-accent/20 opacity-50 blur-3xl" />
            <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl border border-accent/25 bg-accent/10 ring-1 ring-white/10">
              <Terminal className="h-7 w-7 text-accent" strokeWidth={1.75} />
            </div>
          </div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.32em] text-accent">
            Solo sviluppatore
          </p>
          <h1 className="font-display mt-2 text-[clamp(1.75rem,4vw,2.5rem)] font-semibold tracking-[-0.04em] text-text-primary">
            Area privata dev
          </h1>
          <p className="mt-2 max-w-lg text-[14px] leading-relaxed text-text-secondary">
            Utenti cloud, profili su questo dispositivo e feedback inviati dagli
            utenti dell&apos;app.
          </p>
          <button
            type="button"
            onClick={onRefresh}
            disabled={refreshing}
            className="mt-5 inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/[0.04] px-5 py-2.5 text-[13px] font-medium text-text-secondary transition-colors hover:border-white/25 hover:bg-white/[0.07] hover:text-text-primary disabled:opacity-60"
          >
            {refreshing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" strokeWidth={2} />
            )}
            Aggiorna dati
          </button>
        </motion.div>
      </div>
    </div>
  );
}

export function DevStatsGrid({
  stats,
}: {
  stats: { label: string; value: number | string; icon: LucideIcon }[];
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.06, duration: 0.4 }}
      className="page-px mx-auto mt-8 grid max-w-5xl grid-cols-2 gap-3 sm:grid-cols-3"
    >
      {stats.map((stat) => (
        <ProfileStat
          key={stat.label}
          label={stat.label}
          value={stat.value}
          icon={stat.icon}
        />
      ))}
    </motion.div>
  );
}

export function DevFilterRow({
  children,
  trailing,
}: {
  children: ReactNode;
  trailing?: ReactNode;
}) {
  return (
    <div className="page-px mx-auto mt-6 flex max-w-5xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-wrap gap-2">{children}</div>
      {trailing}
    </div>
  );
}

export function DevChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1.5 text-[11px] font-medium transition-colors ${
        active
          ? "border-accent/40 bg-accent/15 text-accent"
          : "border-white/10 text-text-muted hover:border-white/20 hover:text-text-secondary"
      }`}
    >
      {children}
    </button>
  );
}

export function DevSearchInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <input
      type="search"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full rounded-full border border-white/10 bg-black/25 px-4 py-2.5 text-[13px] text-text-primary outline-none placeholder:text-text-muted focus:border-accent/40 sm:max-w-xs"
    />
  );
}

export function DevMasterDetail({
  sidebar,
  detail,
}: {
  sidebar: ReactNode;
  detail: ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1, duration: 0.4 }}
      className="page-px mx-auto grid max-w-5xl gap-4 pb-16 lg:grid-cols-[minmax(260px,300px)_1fr]"
    >
      {sidebar}
      {detail}
    </motion.div>
  );
}

export function DevSidebar({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className={`${PROFILE_CARD} flex max-h-[min(72vh,700px)] flex-col overflow-hidden p-0`}>
      <p className="border-b border-white/[0.06] px-4 py-3.5 text-[11px] font-medium uppercase tracking-[0.2em] text-text-muted">
        {title}
      </p>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">{children}</div>
    </section>
  );
}

export function DevListItem({
  selected,
  onClick,
  title,
  subtitle,
  meta,
  leading,
}: {
  selected: boolean;
  onClick: () => void;
  title: string;
  subtitle?: string;
  meta?: string;
  leading?: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`mb-1 flex w-full items-start gap-3 rounded-xl px-3 py-3 text-left transition-colors ${
        selected
          ? "bg-white/[0.08] ring-1 ring-white/15"
          : "hover:bg-white/[0.04]"
      }`}
    >
      {leading}
      <div className="min-w-0 flex-1">
        <p className="truncate font-display text-[14px] font-medium tracking-[-0.02em] text-text-primary">
          {title}
        </p>
        {subtitle && (
          <p className="mt-0.5 truncate text-[11px] text-text-muted">{subtitle}</p>
        )}
        {meta && (
          <p className="mt-1 text-[10px] text-text-secondary">{meta}</p>
        )}
      </div>
    </button>
  );
}

export function DevDetailPane({
  children,
  empty,
}: {
  children?: ReactNode;
  empty?: ReactNode;
}) {
  return (
    <section className={`${PROFILE_CARD} min-h-[min(72vh,700px)] p-5 sm:p-6`}>
      {children ?? empty}
    </section>
  );
}

export function DevUserAvatar({
  name,
  imageUrl,
  online,
}: {
  name: string;
  imageUrl?: string;
  online?: boolean;
}) {
  const initial = name.trim().charAt(0).toUpperCase() || "?";
  return (
    <div className="relative shrink-0">
      <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-white/[0.06] font-display text-[13px] font-semibold text-text-primary">
        {imageUrl ? (
          <img src={imageUrl} alt="" className="h-full w-full object-cover" draggable={false} />
        ) : (
          initial
        )}
      </div>
      {online != null && (
        <span
          className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-[#0a0a0e] ${
            online ? "bg-mint" : "bg-white/20"
          }`}
        />
      )}
    </div>
  );
}

export function DevBadge({
  tone = "neutral",
  children,
}: {
  tone?: "mint" | "warm" | "accent" | "neutral";
  children: ReactNode;
}) {
  const tones = {
    mint: "border-mint/25 bg-mint/10 text-mint",
    warm: "border-warm/30 bg-warm/10 text-warm",
    accent: "border-accent/30 bg-accent/10 text-accent",
    neutral: "border-white/12 bg-white/[0.04] text-text-muted",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-wider ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

export function DevMetaGrid({
  items,
}: {
  items: { label: string; value: ReactNode }[];
}) {
  return (
    <dl className="grid gap-2 sm:grid-cols-2">
      {items.map((item) => (
        <div
          key={item.label}
          className="flex items-center justify-between gap-3 rounded-xl bg-white/[0.03] px-3.5 py-2.5"
        >
          <dt className="text-[12px] text-text-muted">{item.label}</dt>
          <dd className="text-right text-[12px] text-text-primary">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function DevDetailHeader({
  title,
  subtitle,
  badges,
  avatar,
}: {
  title: string;
  subtitle?: string;
  badges?: ReactNode;
  avatar?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 border-b border-white/[0.06] pb-5 sm:flex-row sm:items-start sm:gap-5">
      {avatar}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-display text-xl font-semibold tracking-[-0.03em] text-text-primary">
            {title}
          </h3>
          {badges}
        </div>
        {subtitle && (
          <p className="mt-1 text-[13px] text-text-muted">{subtitle}</p>
        )}
      </div>
    </div>
  );
}

export function DevRowList({
  children,
  maxHeight = "max-h-[min(48vh,480px)]",
}: {
  children: ReactNode;
  maxHeight?: string;
}) {
  return <ul className={`space-y-2 overflow-y-auto pr-1 ${maxHeight}`}>{children}</ul>;
}

export function DevRowItem({
  title,
  subtitle,
  trailing,
  leading,
}: {
  title: string;
  subtitle?: string;
  trailing?: ReactNode;
  leading?: ReactNode;
}) {
  return (
    <li className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3">
      <div className="flex min-w-0 items-center gap-3">
        {leading}
        <div className="min-w-0">
        <p className="truncate text-[14px] font-medium text-text-primary">{title}</p>
        {subtitle && (
          <p className="mt-0.5 truncate text-[12px] text-text-muted">{subtitle}</p>
        )}
        </div>
      </div>
      {trailing && <div className="shrink-0 text-right text-[11px] text-text-muted">{trailing}</div>}
    </li>
  );
}

export function DevActionBar({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-wrap gap-2 border-t border-white/[0.06] pt-4">{children}</div>
  );
}

export function DevActionButton({
  tone = "neutral",
  disabled,
  onClick,
  icon: Icon,
  children,
}: {
  tone?: "mint" | "warm" | "danger" | "neutral" | "accent";
  disabled?: boolean;
  onClick: () => void;
  icon?: LucideIcon;
  children: ReactNode;
}) {
  const tones = {
    mint: "border-mint/25 bg-mint/10 text-mint hover:bg-mint/15",
    warm: "border-warm/25 bg-warm/10 text-warm hover:bg-warm/15",
    danger: "border-red-500/30 bg-red-500/10 text-red-300 hover:bg-red-500/15",
    accent: "border-accent/25 bg-accent/10 text-accent hover:bg-accent/15",
    neutral: "border-white/10 text-text-secondary hover:bg-white/[0.04]",
  };
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-[12px] font-medium transition-colors disabled:opacity-50 ${tones[tone]}`}
    >
      {Icon && (
        <Icon className={`h-3.5 w-3.5 ${disabled && Icon === Loader2 ? "animate-spin" : ""}`} />
      )}
      {children}
    </button>
  );
}

export function DevLoadingState() {
  return (
    <div className="page-px flex min-h-[360px] items-center justify-center pb-16">
      <Loader2 className="h-7 w-7 animate-spin text-text-muted" />
    </div>
  );
}

export function DevErrorBanner({ message }: { message: string }) {
  return (
    <div className="page-px mx-auto max-w-5xl pb-16">
      <div className="rounded-2xl border border-warm/25 bg-warm/10 px-4 py-4 text-[13px] text-warm">
        {message}
      </div>
    </div>
  );
}

export function DevWarningBanner({ message }: { message: string }) {
  return (
    <div className="page-px mx-auto mb-4 max-w-5xl">
      <div className="rounded-2xl border border-warm/25 bg-warm/10 px-4 py-3 text-[13px] text-warm">
        {message}
      </div>
    </div>
  );
}
