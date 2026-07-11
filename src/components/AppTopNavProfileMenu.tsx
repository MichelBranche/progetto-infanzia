import { CircleUser, LogOut, Users } from "lucide-react";
import type { Profile } from "../types/profile";
import { roleLabel } from "../types/profile";

interface AppTopNavProfileMenuPanelProps {
  profile: Profile;
  onNavigateProfile: () => void;
  onSwitchProfile: () => void;
  onLogout: () => void;
}

export function AppTopNavProfileMenuPanel({
  profile,
  onNavigateProfile,
  onSwitchProfile,
  onLogout,
}: AppTopNavProfileMenuPanelProps) {
  return (
    <div
      className="overflow-hidden rounded-xl border border-white/[0.08] bg-[#0c0c0f] py-1 shadow-[0_20px_60px_rgba(0,0,0,0.55)]"
      role="menu"
    >
      <div className="border-b border-white/[0.06] px-3.5 py-2.5">
        <p className="font-display text-[13px] font-medium text-text-primary">
          {profile.name}
        </p>
        <p className="text-[10px] uppercase tracking-[0.16em] text-text-muted">
          {roleLabel(profile.role)}
        </p>
      </div>
      <button
        type="button"
        role="menuitem"
        onClick={onNavigateProfile}
        className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-[13px] text-text-secondary transition-colors hover:bg-white/[0.04] hover:text-text-primary"
      >
        <CircleUser className="h-4 w-4 shrink-0" strokeWidth={1.5} />
        Profilo e lista
      </button>
      <button
        type="button"
        role="menuitem"
        onClick={onSwitchProfile}
        className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-[13px] text-text-secondary transition-colors hover:bg-white/[0.04] hover:text-text-primary"
      >
        <Users className="h-4 w-4 shrink-0" strokeWidth={1.5} />
        Cambia profilo
      </button>
      <button
        type="button"
        role="menuitem"
        onClick={onLogout}
        className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-[13px] text-text-secondary transition-colors hover:bg-white/[0.04] hover:text-warm"
      >
        <LogOut className="h-4 w-4 shrink-0" strokeWidth={1.5} />
        Logout
      </button>
    </div>
  );
}
