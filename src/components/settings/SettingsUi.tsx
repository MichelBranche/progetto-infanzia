import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export const SETTINGS_CARD =
  "relative overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0a0a0c] shadow-[0_16px_48px_rgba(0,0,0,0.35)]";

export function SettingsCard({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`${SETTINGS_CARD} ${className}`.trim()}>
      <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-accent/15 via-accent/5 to-transparent" />
      <div className="noise-overlay pointer-events-none absolute inset-0 opacity-[0.06]" />
      <div className="relative p-5 sm:p-6">{children}</div>
    </section>
  );
}

export function SettingsGroupLabel({ children }: { children: ReactNode }) {
  return (
    <div className="mb-3 mt-8 flex items-center gap-2 first:mt-0">
      <span className="inline-flex items-center rounded-full border border-accent/25 bg-accent/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.28em] text-accent">
        {children}
      </span>
      <span className="h-px flex-1 bg-white/[0.06]" aria-hidden />
    </div>
  );
}

export function SettingsSection({
  title,
  description,
  icon: Icon,
  children,
  headerRight,
}: {
  title: string;
  description?: string;
  icon?: LucideIcon;
  children?: ReactNode;
  headerRight?: ReactNode;
}) {
  return (
    <SettingsCard>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            {Icon && (
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-accent/25 bg-accent/10 shadow-[0_0_24px_rgba(94,234,212,0.08)]">
                <Icon className="h-5 w-5 text-accent" strokeWidth={2} />
              </span>
            )}
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
      <button
        type="button"
        disabled={disabled}
        onClick={onChange}
        aria-pressed={enabled}
        className={`relative h-7 w-12 shrink-0 rounded-full transition-colors disabled:opacity-50 ${
          enabled ? "bg-accent" : "bg-white/15"
        }`}
      >
        <span
          className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow-sm transition-transform ${
            enabled ? "left-[22px]" : "left-0.5"
          }`}
        />
      </button>
    </div>
  );
}

export function SettingsInput({
  className = "",
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={`w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 text-[14px] text-text-primary outline-none transition-colors placeholder:text-text-muted/50 focus:border-accent/40 focus:bg-white/[0.05] ${className}`}
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
  variant?: "primary" | "secondary" | "accent";
}) {
  const styles = {
    primary:
      "bg-text-primary text-void hover:scale-[1.02] active:scale-[0.98]",
    secondary:
      "border border-white/10 text-text-secondary hover:border-white/20 hover:bg-white/[0.04] hover:text-text-primary",
    accent:
      "border border-accent/30 bg-accent/10 text-text-primary hover:bg-accent/15",
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
      className={`rounded-full border px-3.5 py-1.5 text-[12px] font-medium transition-colors disabled:opacity-50 ${
        active
          ? "border-accent/40 bg-accent/12 text-text-primary"
          : "border-white/[0.08] bg-white/[0.02] text-text-muted hover:border-white/15 hover:text-text-secondary"
      }`}
    >
      {children}
    </button>
  );
}
