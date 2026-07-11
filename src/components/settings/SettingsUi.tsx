import type { LucideIcon } from "lucide-react";
import type { InputHTMLAttributes, ReactNode } from "react";

export const SETTINGS_CARD =
  "relative overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0a0a0c] shadow-[0_16px_48px_rgba(0,0,0,0.35)]";

export function SettingsIconBadge({
  icon: Icon,
  className = "",
}: {
  icon: LucideIcon;
  className?: string;
}) {
  return (
    <span
      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-accent/25 bg-accent/10 shadow-[0_0_24px_rgba(94,234,212,0.08)] ${className}`.trim()}
    >
      <Icon className="h-5 w-5 text-accent" strokeWidth={2} />
    </span>
  );
}

export function SettingsCard({
  children,
  className = "",
  variant = "default",
}: {
  children: ReactNode;
  className?: string;
  variant?: "default" | "accent";
}) {
  const accentRing =
    variant === "accent"
      ? "border-accent/25 shadow-[0_16px_48px_rgba(0,0,0,0.35),0_0_40px_rgba(94,234,212,0.1)]"
      : "";

  return (
    <section className={`${SETTINGS_CARD} ${accentRing} ${className}`.trim()}>
      <div className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-accent/15 via-accent/5 to-transparent" />
      <div className="noise-overlay pointer-events-none absolute inset-0 opacity-[0.06]" />
      <div className="relative p-5 sm:p-6">{children}</div>
    </section>
  );
}

export function SettingsGroupLabel({ children }: { children: ReactNode }) {
  return (
    <div className="mb-3 mt-9 flex items-center gap-3 first:mt-0">
      <span className="inline-flex shrink-0 items-center rounded-full border border-accent/25 bg-accent/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.28em] text-accent">
        {children}
      </span>
      <span className="h-px flex-1 bg-gradient-to-r from-white/[0.08] to-transparent" aria-hidden />
    </div>
  );
}

export function SettingsSection({
  title,
  description,
  icon: Icon,
  children,
  headerRight,
  variant = "default",
}: {
  title: string;
  description?: string;
  icon?: LucideIcon;
  children?: ReactNode;
  headerRight?: ReactNode;
  variant?: "default" | "accent";
}) {
  return (
    <SettingsCard variant={variant}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            {Icon && <SettingsIconBadge icon={Icon} />}
            <div className="min-w-0">
              <h3 className="font-display text-[16px] font-semibold tracking-[-0.02em] text-text-primary">
                {title}
              </h3>
              {description && (
                <p className="mt-1 text-[12px] leading-relaxed text-text-muted">
                  {description}
                </p>
              )}
            </div>
          </div>
        </div>
        {headerRight}
      </div>
      {children && <div className="mt-5">{children}</div>}
    </SettingsCard>
  );
}

export function SettingsDivider({ className = "" }: { className?: string }) {
  return (
    <div
      className={`h-px bg-gradient-to-r from-transparent via-white/[0.08] to-transparent ${className}`.trim()}
      aria-hidden
    />
  );
}

export function SettingsLabel({ children }: { children: ReactNode }) {
  return (
    <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.12em] text-text-muted">
      {children}
    </span>
  );
}

export function SettingsField({
  label,
  children,
  className = "",
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={`block ${className}`.trim()}>
      <SettingsLabel>{label}</SettingsLabel>
      {children}
    </label>
  );
}

export function SettingsInset({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3.5 ${className}`.trim()}
    >
      {children}
    </div>
  );
}

export function SettingsAlert({
  children,
  variant = "error",
  className = "",
}: {
  children: ReactNode;
  variant?: "error" | "success" | "info";
  className?: string;
}) {
  const styles = {
    error: "border-warm/25 bg-warm/10 text-warm",
    success: "border-mint/25 bg-mint/10 text-mint",
    info: "border-white/10 bg-white/[0.03] text-text-secondary",
  };

  return (
    <p
      className={`rounded-xl border px-3.5 py-2.5 text-[12px] leading-relaxed ${styles[variant]} ${className}`.trim()}
    >
      {children}
    </p>
  );
}

export function SettingsEmpty({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <p
      className={`rounded-xl border border-dashed border-white/[0.08] bg-white/[0.02] px-4 py-3.5 text-center text-[13px] text-text-muted ${className}`.trim()}
    >
      {children}
    </p>
  );
}

export function SettingsSegmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { id: T; label: string }[];
  onChange: (id: T) => void;
}) {
  return (
    <div className="flex rounded-full border border-white/[0.06] bg-white/[0.03] p-1">
      {options.map((option) => {
        const active = option.id === value;
        return (
          <button
            key={option.id}
            type="button"
            onClick={() => onChange(option.id)}
            className={`flex-1 rounded-full px-3 py-2 text-[12px] font-medium transition-all ${
              active
                ? "bg-white text-void shadow-[0_2px_12px_rgba(0,0,0,0.25)]"
                : "text-text-muted hover:text-text-primary"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export function SettingsSwitch({
  enabled,
  disabled,
  onChange,
}: {
  enabled: boolean;
  disabled?: boolean;
  onChange: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onChange}
      aria-pressed={enabled}
      className={`relative h-7 w-12 shrink-0 rounded-full transition-colors disabled:opacity-50 ${
        enabled
          ? "bg-mint shadow-[0_0_16px_rgba(196,181,253,0.42)]"
          : "bg-white/15"
      }`}
    >
      <span
        className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow-sm transition-transform ${
          enabled ? "left-[22px]" : "left-0.5"
        }`}
      />
    </button>
  );
}

export function SettingsToggle({
  label,
  description,
  enabled,
  disabled,
  onChange,
}: {
  label: string;
  description?: string;
  enabled: boolean;
  disabled?: boolean;
  onChange: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-white/[0.04] bg-white/[0.02] px-4 py-3">
      <div className="min-w-0">
        <p className="text-[13px] font-medium text-text-primary">{label}</p>
        {description && (
          <p className="mt-0.5 text-[12px] text-text-muted">{description}</p>
        )}
      </div>
      <SettingsSwitch enabled={enabled} disabled={disabled} onChange={onChange} />
    </div>
  );
}

export function SettingsInput({
  className = "",
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={`w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 text-[14px] text-text-primary outline-none transition-colors placeholder:text-text-muted/50 focus:border-accent/40 focus:bg-white/[0.05] disabled:opacity-50 ${className}`}
      {...props}
    />
  );
}

export function SettingsButton({
  variant = "secondary",
  className = "",
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "accent" | "danger";
}) {
  const styles = {
    primary:
      "bg-text-primary text-void shadow-[0_4px_20px_rgba(255,255,255,0.12)] hover:scale-[1.02] active:scale-[0.98]",
    secondary:
      "border border-white/10 text-text-secondary hover:border-white/20 hover:bg-white/[0.04] hover:text-text-primary",
    accent:
      "border border-accent/30 bg-accent/10 text-text-primary hover:border-accent/45 hover:bg-accent/15",
    danger:
      "border border-warm/25 bg-warm/10 text-warm hover:border-warm/40 hover:bg-warm/15",
  };
  return (
    <button
      type="button"
      className={`inline-flex items-center justify-center gap-2 rounded-full px-5 py-2.5 text-[12px] font-semibold transition-all disabled:opacity-50 ${styles[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

export function SettingsPill({
  active,
  children,
  onClick,
  disabled,
}: {
  active: boolean;
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`rounded-full border px-3.5 py-1.5 text-[12px] font-medium transition-all disabled:opacity-50 ${
        active
          ? "border-accent/40 bg-accent/12 text-text-primary shadow-[0_0_20px_rgba(94,234,212,0.12)]"
          : "border-white/[0.08] bg-white/[0.02] text-text-muted hover:border-white/15 hover:text-text-secondary"
      }`}
    >
      {children}
    </button>
  );
}

export function SettingsCheckboxRow({
  checked,
  disabled,
  label,
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  label: string;
  onChange: () => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3.5 py-3 transition-colors hover:border-white/12 hover:bg-white/[0.04]">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={onChange}
        className="h-4 w-4 rounded border-white/20 bg-transparent text-accent focus:ring-accent/30"
      />
      <span className="text-[13px] text-text-primary">{label}</span>
    </label>
  );
}

export function SettingsListItem({
  icon: Icon,
  title,
  meta,
  description,
  footer,
  actions,
}: {
  icon?: LucideIcon;
  title: string;
  meta?: ReactNode;
  description?: string;
  footer?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <li className="flex items-start gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3.5 transition-colors hover:border-white/10 hover:bg-white/[0.035]">
      {Icon && (
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-accent/20 bg-accent/10">
          <Icon className="h-4 w-4 text-accent" strokeWidth={2} />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-display text-[14px] font-medium tracking-[-0.01em] text-text-primary">
            {title}
          </span>
          {meta}
        </div>
        {description && (
          <p className="mt-0.5 line-clamp-2 text-[12px] leading-relaxed text-text-muted">
            {description}
          </p>
        )}
        {footer && <p className="mt-1.5 text-[11px] text-text-muted/80">{footer}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-col gap-1.5">{actions}</div>}
    </li>
  );
}
