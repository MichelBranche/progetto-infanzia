import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export const SETTINGS_CARD =
  "rounded-2xl border border-white/[0.07] bg-[#0a0a0e]/80 p-5 sm:p-6";

export function SettingsGroupLabel({ children }: { children: ReactNode }) {
  return (
    <p className="mb-3 mt-10 first:mt-0 text-[11px] font-medium uppercase tracking-[0.22em] text-text-muted">
      {children}
    </p>
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
    <section className={SETTINGS_CARD}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5">
            {Icon && (
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white/[0.06]">
                <Icon className="h-4 w-4 text-accent" strokeWidth={2} />
              </span>
            )}
            <h3 className="font-display text-[16px] font-medium tracking-[-0.02em] text-text-primary">
              {title}
            </h3>
          </div>
          {description && (
            <p className="mt-2 text-[13px] leading-relaxed text-text-muted">{description}</p>
          )}
        </div>
        {headerRight}
      </div>
      {children && <div className="mt-4">{children}</div>}
    </section>
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
    <div className="flex items-center justify-between gap-4 rounded-xl bg-white/[0.03] px-4 py-3">
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
      className={`w-full rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-[14px] text-text-primary outline-none transition-colors placeholder:text-text-muted/50 focus:border-white/25 focus:bg-white/[0.05] ${className}`}
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
    primary: "bg-accent text-white hover:opacity-90",
    secondary:
      "border border-white/10 bg-white/[0.03] text-text-primary hover:border-white/18 hover:bg-white/[0.06]",
    accent:
      "border border-accent/30 bg-accent/10 text-text-primary hover:bg-accent/15",
  };
  return (
    <button
      type="button"
      className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-[13px] font-medium transition-colors disabled:opacity-50 ${styles[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
