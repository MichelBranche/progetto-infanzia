import { useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { Search, Bell, RefreshCw, ChevronDown, X } from "lucide-react";
import { ProfileAvatar } from "./ProfileAvatar";
import type { Profile } from "../types/profile";
import { isParentProfile } from "../types/profile";

interface HeaderProps {
  profile: Profile;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onOpenSearch: () => void;
  onCloseSearch?: () => void;
  searchActive: boolean;
  onRescan: () => void;
  onSwitchProfile: () => void;
  scanning: boolean;
  totalCount?: number;
}

export function Header({
  profile,
  searchQuery,
  onSearchChange,
  onOpenSearch,
  onCloseSearch,
  searchActive,
  onRescan,
  onSwitchProfile,
  scanning,
  totalCount,
}: HeaderProps) {
  const isParent = isParentProfile(profile);
  const inputRef = useRef<HTMLInputElement>(null);

  const openSearch = () => {
    onOpenSearch();
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  useEffect(() => {
    if (searchActive) {
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [searchActive]);

  return (
    <header
      className={`pointer-events-none absolute top-0 right-0 left-0 flex items-start justify-end page-px py-4 sm:py-5 lg:py-6 ${
        searchActive ? "z-[35]" : "z-20"
      }`}
    >
      <div
        className={`pointer-events-none absolute inset-x-0 top-0 bg-gradient-to-b from-void/95 via-void/50 to-transparent transition-[height] duration-300 ${
          searchActive ? "h-32 sm:h-36" : "h-24 lg:h-28"
        }`}
      />
      <div
        className={`pointer-events-auto relative flex w-full min-w-0 ${
          searchActive
            ? "flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end sm:gap-2"
            : "max-w-full flex-wrap items-center justify-end gap-1.5 sm:gap-2"
        }`}
      >
        {totalCount !== undefined && !searchActive && (
          <span className="hidden text-[11px] tabular-nums text-text-muted sm:block">
            {totalCount} titoli
          </span>
        )}

        <motion.div
          className={`flex h-10 min-w-0 items-center gap-2.5 rounded-full border border-white/[0.08] bg-void/90 shadow-[0_8px_32px_rgba(0,0,0,0.35)] backdrop-blur-xl transition-all duration-300 sm:gap-3 ${
            searchActive
              ? "w-full px-4 sm:h-11 sm:max-w-2xl sm:flex-1 sm:px-5"
              : "px-3.5 sm:px-4"
          }`}
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6, duration: 0.5 }}
        >
          <button
            type="button"
            onClick={openSearch}
            className="shrink-0 text-text-muted transition-colors hover:text-text-primary"
            aria-label="Cerca"
          >
            <Search className="h-4 w-4 sm:h-[18px] sm:w-[18px]" strokeWidth={1.5} />
          </button>
          <input
            ref={inputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            onFocus={openSearch}
            placeholder="Cerca titoli…"
            className={`min-w-0 bg-transparent text-text-primary caret-accent placeholder:text-text-muted outline-none ${
              searchActive
                ? "flex-1 text-[15px] sm:text-base"
                : "w-24 text-[13px] sm:w-36 md:w-44"
            }`}
          />
          {searchActive && (
            <button
              type="button"
              onClick={() => {
                if (searchQuery) onSearchChange("");
                else onCloseSearch?.();
              }}
              className="shrink-0 text-text-muted transition-colors hover:text-text-primary"
              aria-label={searchQuery ? "Cancella ricerca" : "Chiudi ricerca"}
            >
              <X className="h-4 w-4" strokeWidth={1.5} />
            </button>
          )}
        </motion.div>

        {isParent && (
          <motion.button
            onClick={onRescan}
            disabled={scanning}
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.65, duration: 0.5 }}
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            title="Aggiorna libreria"
            className="flex h-10 w-10 items-center justify-center rounded-full border border-white/[0.08] bg-void/75 shadow-[0_8px_32px_rgba(0,0,0,0.2)] backdrop-blur-xl transition-colors hover:border-white/12 disabled:opacity-50"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 text-text-secondary ${scanning ? "animate-spin" : ""}`}
              strokeWidth={1.5}
            />
          </motion.button>
        )}

        <motion.button
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.7, duration: 0.5 }}
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          className="flex h-10 w-10 items-center justify-center rounded-full border border-white/[0.08] bg-void/75 shadow-[0_8px_32px_rgba(0,0,0,0.2)] backdrop-blur-xl transition-colors hover:border-white/12"
        >
          <Bell className="h-3.5 w-3.5 text-text-secondary" strokeWidth={1.5} />
        </motion.button>

        <motion.button
          onClick={onSwitchProfile}
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.75, duration: 0.5 }}
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          className="flex items-center gap-2 rounded-full border border-white/[0.08] bg-void/75 py-1 pl-1 pr-3 shadow-[0_8px_32px_rgba(0,0,0,0.2)] backdrop-blur-xl transition-colors hover:border-white/12"
          title="Cambia profilo"
        >
          <ProfileAvatar profile={profile} size="sm" />
          <span className="hidden max-w-[80px] truncate text-[12px] font-medium text-text-primary sm:block">
            {profile.name}
          </span>
          <ChevronDown className="h-3 w-3 text-text-muted" />
        </motion.button>
      </div>
    </header>
  );
}
