import type { LucideIcon } from "lucide-react";
import type { InputHTMLAttributes, ReactNode } from "react";

/** Card iDraft: raggio ampio, bordo soft, theme-aware */
export const SETTINGS_CARD =
  "settings-card relative overflow-hidden rounded-[1.75rem] border border-border bg-panel shadow-[0_8px_32px_rgba(0,0,0,0.06)]";

const SETTINGS_CARD_INK =
  "settings-card settings-card--ink relative overflow-hidden rounded-[1.75rem] border border-transparent shadow-[0_16px_40px_rgba(0,0,0,0.28)]";

export function SettingsShell({
  sidebar,
  children,
}: {
  sidebar: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="settings-shell relative flex min-h-[min(78vh,820px)] w-full flex-col overflow-hidden rounded-[2rem] border border-border bg-panel/75 shadow-[0_24px_80px_rgba(0,0,0,0.18)] backdrop-blur-2xl sm:rounded-[2.25rem] lg:min-h-[min(82vh,880px)] lg:flex-row">
      <aside className="settings-shell__sidebar flex shrink-0 flex-col border-b border-border bg-panel lg:w-[15.5rem] lg:border-b-0 lg:border-r xl:w-[17rem]">
        {sidebar}
      </aside>
      <div className="settings-shell__main relative min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden">
        {children}
      </div>
    </div>
  );
}

export function SettingsNavItem({
  icon: Icon,
  label,
  active,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={`flex w-full items-center gap-3 rounded-full px-3.5 py-2.5 text-left text-[13px] font-medium transition-colors ${
        active
          ? "bg-text-primary text-void shadow-[0_6px_20px_rgba(0,0,0,0.16)]"
          : "text-text-secondary hover:bg-fill hover:text-text-primary"
      }`}
    >
      <Icon className="h-[18px] w-[18px] shrink-0" strokeWidth={active ? 2.25 : 1.85} />
      <span className="truncate">{label}</span>
    </button>
  );
}

export function SettingsIconBadge({
  icon: Icon,
  className = "",
}: {
  icon: LucideIcon;
  className?: string;
}) {
  return (
    <span
      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-fill-strong text-text-primary ${className}`.trim()}
    >
      <Icon className="h-[18px] w-[18px]" strokeWidth={2} />
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
  variant?: "default" | "accent" | "ink";
}) {
  const shell =
    variant === "ink"
      ? SETTINGS_CARD_INK
      : variant === "accent"
        ? `${SETTINGS_CARD} ring-1 ring-border`
        : SETTINGS_CARD;

  return (
    <section className={`${shell} ${className}`.trim()}>
      <div className="relative p-5 sm:p-6">{children}</div>
    </section>
  );
}

export function SettingsGroupLabel({ children }: { children: ReactNode }) {
  return (
    <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-text-muted">
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
  variant = "default",
}: {
  title: string;
  description?: string;
  icon?: LucideIcon;
  children?: ReactNode;
  headerRight?: ReactNode;
  variant?: "default" | "accent" | "ink";
}) {
  return (
    <SettingsCard variant={variant}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-3">
            {Icon && <SettingsIconBadge icon={Icon} />}
            <div className="min-w-0">
              <h3 className="font-display text-[16px] font-semibold tracking-[-0.03em] text-text-primary sm:text-[17px]">
                {title}
              </h3>
              {description && (
                <p className="mt-1 text-[13px] leading-relaxed text-text-muted">
                  {description}
                </p>
              )}
            </div>
          </div>
        </div>
        {headerRight && <div className="shrink-0 self-start sm:self-center">{headerRight}</div>}
      </div>
      {children && <div className="mt-5">{children}</div>}
    </SettingsCard>
  );
}

export function SettingsDivider({ className = "" }: { className?: string }) {
  return (
    <div className={`h-px bg-border ${className}`.trim()} aria-hidden />
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
      className={`rounded-2xl border border-border bg-fill-muted px-4 py-3.5 ${className}`.trim()}
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
    info: "border-border bg-fill text-text-secondary",
  };

  return (
    <p
      className={`rounded-2xl border px-4 py-3 text-[13px] leading-relaxed ${styles[variant]} ${className}`.trim()}
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
      className={`rounded-2xl border border-dashed border-border bg-fill-muted px-4 py-4 text-center text-[13px] text-text-muted ${className}`.trim()}
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
    <div className="flex rounded-full border border-border bg-fill p-1">
      {options.map((option) => {
        const active = option.id === value;
        return (
          <button
            key={option.id}
            type="button"
            onClick={() => onChange(option.id)}
            className={`min-h-[44px] flex-1 rounded-full px-3 py-2.5 text-[12px] font-semibold transition-all ${
              active
                ? "bg-text-primary text-void shadow-[0_4px_16px_rgba(0,0,0,0.16)]"
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
      className={`relative h-8 w-[3.25rem] shrink-0 rounded-full transition-colors disabled:opacity-50 ${
        enabled ? "bg-text-primary" : "bg-fill-strong"
      }`}
    >
      <span
        className={`absolute top-0.5 h-7 w-7 rounded-full shadow-[0_2px_8px_rgba(0,0,0,0.18)] transition-transform ${
          enabled ? "left-[1.35rem] bg-void" : "left-0.5 bg-panel"
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
    <div className="flex items-center justify-between gap-4 rounded-2xl border border-border bg-fill-muted px-4 py-3.5">
      <div className="min-w-0">
        <p className="text-[14px] font-medium text-text-primary">{label}</p>
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
      className={`w-full rounded-2xl border border-border bg-fill px-4 py-3 text-[14px] text-text-primary outline-none transition-colors placeholder:text-text-muted/70 focus:border-border-hover focus:bg-fill-strong disabled:opacity-50 ${className}`}
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
      "bg-text-primary text-void shadow-[0_6px_20px_rgba(0,0,0,0.14)] hover:opacity-90 active:scale-[0.98]",
    secondary:
      "border border-border bg-fill-muted text-text-primary hover:border-border-hover hover:bg-fill",
    accent:
      "border border-border bg-fill text-text-primary hover:bg-fill-strong",
    danger:
      "border border-warm/25 bg-warm/10 text-warm hover:border-warm/40 hover:bg-warm/15",
  };
  return (
    <button
      type="button"
      className={`inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full px-5 py-2.5 text-[13px] font-semibold transition-all disabled:opacity-50 ${styles[variant]} ${className}`}
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
      className={`inline-flex min-h-[44px] items-center rounded-full border px-4 py-2 text-[12px] font-medium transition-all disabled:opacity-50 ${
        active
          ? "border-transparent bg-text-primary text-void shadow-[0_4px_16px_rgba(0,0,0,0.14)]"
          : "border-border bg-fill-muted text-text-muted hover:border-border-hover hover:text-text-secondary"
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
    <label className="flex cursor-pointer items-center gap-3 rounded-2xl border border-border bg-fill-muted px-3.5 py-3 transition-colors hover:border-border-hover hover:bg-fill">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={onChange}
        className="h-4 w-4 rounded border-border bg-transparent text-text-primary focus:ring-text-primary/20"
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
    <li className="flex items-start gap-3 rounded-2xl border border-border bg-fill-muted p-3.5 transition-colors hover:border-border-hover hover:bg-fill">
      {Icon && (
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-fill-strong">
          <Icon className="h-4 w-4 text-text-primary" strokeWidth={2} />
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
