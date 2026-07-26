import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Loader2 } from "lucide-react";
import {
  ProfileEmptyState,
  ProfileSectionLabel,
} from "../profile/ProfileUi";
import {
  SETTINGS_CARD,
  SettingsButton,
  SettingsInput,
  SettingsPill,
} from "../settings/SettingsUi";

export { ProfileCard } from "../profile/ProfileUi";
export { ProfileEmptyState, ProfileSectionLabel };

export function DevStatsGrid({
  stats,
}: {
  stats: { label: string; value: number | string; icon: LucideIcon }[];
}) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {stats.map((stat) => {
        const Icon = stat.icon;
        return (
          <div
            key={stat.label}
            className={`${SETTINGS_CARD} flex items-center gap-3 p-4`}
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-fill-strong text-text-primary">
              <Icon className="h-[18px] w-[18px]" strokeWidth={2} />
            </span>
            <div className="min-w-0">
              <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-text-muted">
                {stat.label}
              </p>
              <p className="font-display mt-0.5 text-[1.35rem] font-semibold tracking-[-0.03em] text-text-primary tabular-nums">
                {stat.value}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function DevFilterRow({
  children,
  trailing,
}: {
  children?: ReactNode;
  trailing?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      {children ? <div className="flex flex-wrap gap-2">{children}</div> : <div />}
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
    <SettingsPill active={active} onClick={onClick}>
      {children}
    </SettingsPill>
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
    <SettingsInput
      type="search"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="sm:max-w-xs"
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
    <div className="grid gap-4 lg:grid-cols-[minmax(240px,280px)_1fr] xl:grid-cols-[minmax(260px,300px)_1fr]">
      {sidebar}
      {detail}
    </div>
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
    <section
      className={`${SETTINGS_CARD} flex max-h-[min(68vh,680px)] flex-col overflow-hidden !p-0`}
    >
      <p className="border-b border-border px-4 py-3.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-text-muted">
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
      className={`mb-1 flex w-full items-start gap-3 rounded-2xl px-3 py-3 text-left transition-colors ${
        selected
          ? "bg-text-primary text-void shadow-[0_6px_20px_rgba(0,0,0,0.14)]"
          : "hover:bg-fill"
      }`}
    >
      {leading}
      <div className="min-w-0 flex-1">
        <p
          className={`truncate font-display text-[14px] font-medium tracking-[-0.02em] ${
            selected ? "text-void" : "text-text-primary"
          }`}
        >
          {title}
        </p>
        {subtitle && (
          <p
            className={`mt-0.5 truncate text-[11px] ${
              selected ? "text-void/60" : "text-text-muted"
            }`}
          >
            {subtitle}
          </p>
        )}
        {meta && (
          <p
            className={`mt-1 text-[10px] ${
              selected ? "text-void/50" : "text-text-secondary"
            }`}
          >
            {meta}
          </p>
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
    <section className={`${SETTINGS_CARD} min-h-[min(68vh,680px)] p-5 sm:p-6`}>
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
      <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-fill-strong font-display text-[13px] font-semibold text-text-primary">
        {imageUrl ? (
          <img src={imageUrl} alt="" className="h-full w-full object-cover" draggable={false} />
        ) : (
          initial
        )}
      </div>
      {online != null && (
        <span
          className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-panel ${
            online ? "bg-mint" : "bg-fill-strong"
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
    neutral: "border-border bg-fill-muted text-text-muted",
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
          className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-fill-muted px-3.5 py-2.5"
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
    <div className="flex flex-col gap-4 border-b border-border pb-5 sm:flex-row sm:items-start sm:gap-5">
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
    <li className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-fill-muted px-4 py-3">
      <div className="flex min-w-0 items-center gap-3">
        {leading}
        <div className="min-w-0">
          <p className="truncate text-[14px] font-medium text-text-primary">{title}</p>
          {subtitle && (
            <p className="mt-0.5 truncate text-[12px] text-text-muted">{subtitle}</p>
          )}
        </div>
      </div>
      {trailing && (
        <div className="shrink-0 text-right text-[11px] text-text-muted">{trailing}</div>
      )}
    </li>
  );
}

export function DevActionBar({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-wrap gap-2 border-t border-border pt-4">{children}</div>
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
  const variant =
    tone === "danger"
      ? "danger"
      : tone === "accent" || tone === "mint"
        ? "primary"
        : "secondary";

  const toneClass =
    tone === "mint"
      ? "!border-mint/25 !bg-mint/10 !text-mint hover:!bg-mint/15"
      : tone === "warm"
        ? "!border-warm/25 !bg-warm/10 !text-warm hover:!bg-warm/15"
        : tone === "accent"
          ? ""
          : "";

  return (
    <SettingsButton
      variant={variant}
      disabled={disabled}
      onClick={onClick}
      className={toneClass}
    >
      {Icon && (
        <Icon
          className={`h-3.5 w-3.5 ${disabled && Icon === Loader2 ? "animate-spin" : ""}`}
        />
      )}
      {children}
    </SettingsButton>
  );
}

export function DevLoadingState() {
  return (
    <div className="flex min-h-[280px] items-center justify-center py-12">
      <Loader2 className="h-7 w-7 animate-spin text-text-muted" />
    </div>
  );
}

export function DevErrorBanner({ message }: { message: string }) {
  return (
    <div className="rounded-2xl border border-warm/25 bg-warm/10 px-4 py-4 text-[13px] text-warm">
      {message}
    </div>
  );
}

export function DevWarningBanner({ message }: { message: string }) {
  return (
    <div className="rounded-2xl border border-warm/25 bg-warm/10 px-4 py-3 text-[13px] text-warm">
      {message}
    </div>
  );
}

export function DevInfoBanner({ children }: { children: ReactNode }) {
  return (
    <div className={`${SETTINGS_CARD} px-4 py-3 text-[12px] leading-relaxed text-text-secondary`}>
      {children}
    </div>
  );
}
