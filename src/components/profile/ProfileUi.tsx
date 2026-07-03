import type { ReactNode } from "react";

export function ProfileSectionLabel({ children }: { children: string }) {
  return (
    <div className="mb-4 flex items-center gap-3">
      <span className="h-px w-4 bg-white/15" />
      <p className="text-[10px] font-medium uppercase tracking-[0.34em] text-text-muted/70">
        {children}
      </p>
    </div>
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
    <section
      className={`rounded-xl border border-white/[0.06] bg-white/[0.02] p-5 sm:p-6 ${className}`}
    >
      {children}
    </section>
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
  trailing,
}: {
  name: string;
  subtitle?: string;
  online: boolean;
  away?: boolean;
  trailing?: ReactNode;
}) {
  return (
    <li className="flex items-center gap-3 border-b border-white/[0.05] py-3 last:border-0">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/[0.04] font-display text-[13px] font-semibold text-text-primary">
        {name.trim().charAt(0).toUpperCase() || "?"}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <OnlineDot online={online} away={away} />
          <p className="truncate font-display text-[14px] font-medium tracking-[-0.02em] text-text-primary">
            {name}
          </p>
        </div>
        {subtitle && (
          <p className="mt-0.5 truncate text-[11px] text-text-muted">{subtitle}</p>
        )}
      </div>
      {trailing}
    </li>
  );
}
