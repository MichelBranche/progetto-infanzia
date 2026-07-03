import { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, Bell, RefreshCw, X } from "lucide-react";
import { ProfileAvatar } from "./ProfileAvatar";
import type { Profile } from "../types/profile";
import { isParentProfile, roleLabel } from "../types/profile";

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
  scrolled?: boolean;
}

function ToolbarDivider() {
  return <span className="hidden h-5 w-px shrink-0 bg-white/[0.08] sm:block" />;
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
  scrolled = false,
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
      className={`pointer-events-none absolute top-0 right-0 left-0 z-20 page-px transition-[background,box-shadow] duration-500 ${
        searchActive ? "z-[35]" : ""
      } ${
        scrolled || searchActive
          ? "border-b border-white/[0.06] bg-[#070709]/90 shadow-[0_20px_60px_rgba(0,0,0,0.35)] backdrop-blur-xl"
          : ""
      }`}
    >
      <div className="noise-overlay pointer-events-none absolute inset-0 opacity-[0.12]" />

      <div
        className={`pointer-events-auto relative flex items-stretch justify-end gap-0 py-3 sm:py-4 lg:py-5 ${
          searchActive ? "flex-col sm:flex-row sm:items-center" : ""
        }`}
      >
        <AnimatePresence mode="wait">
          {searchActive ? (
            <motion.div
              key="search-expanded"
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
              className="flex w-full min-w-0 flex-1 items-end gap-3 border-b border-white/20 pb-2 sm:max-w-3xl"
            >
              <span className="mb-0.5 hidden text-[10px] font-medium uppercase tracking-[0.32em] text-text-muted sm:block">
                Ricerca
              </span>
              <Search
                className="mb-0.5 h-4 w-4 shrink-0 text-text-muted"
                strokeWidth={1.5}
              />
              <input
                ref={inputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder="Titoli, serie, cartoni…"
                className="min-w-0 flex-1 bg-transparent font-display text-[15px] tracking-[-0.02em] text-text-primary caret-accent placeholder:text-text-muted/70 outline-none sm:text-[16px]"
              />
              <button
                type="button"
                onClick={() => {
                  if (searchQuery) onSearchChange("");
                  else onCloseSearch?.();
                }}
                className="mb-0.5 flex items-center gap-2 text-[10px] font-medium uppercase tracking-[0.2em] text-text-muted transition-colors hover:text-text-secondary"
                aria-label={searchQuery ? "Cancella ricerca" : "Chiudi ricerca"}
              >
                <X className="h-3.5 w-3.5" strokeWidth={1.5} />
                <span className="hidden sm:inline">Chiudi</span>
              </button>
            </motion.div>
          ) : (
            <motion.div
              key="toolbar"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="flex w-full items-center justify-end gap-3 sm:gap-4"
            >
              <div className="flex items-center gap-3 sm:gap-4">
                <button
                  type="button"
                  onClick={openSearch}
                  className="group flex items-end gap-2.5 border-b border-white/10 pb-1.5 transition-colors hover:border-white/30"
                  aria-label="Cerca"
                >
                  <Search
                    className="mb-0.5 h-3.5 w-3.5 text-text-muted transition-colors group-hover:text-text-secondary"
                    strokeWidth={1.5}
                  />
                  <span className="hidden font-display text-[13px] tracking-[-0.02em] text-text-muted transition-colors group-hover:text-text-secondary sm:inline">
                    Cerca
                  </span>
                  <kbd className="mb-0.5 hidden font-mono text-[9px] text-text-muted/50 sm:inline">
                    /
                  </kbd>
                </button>

                <ToolbarDivider />

                {isParent && (
                  <>
                    <button
                      type="button"
                      onClick={onRescan}
                      disabled={scanning}
                      title="Aggiorna libreria"
                      className="group flex items-center gap-2 text-[10px] font-medium uppercase tracking-[0.22em] text-text-muted transition-colors hover:text-text-secondary disabled:opacity-40"
                    >
                      <RefreshCw
                        className={`h-3.5 w-3.5 ${scanning ? "animate-spin" : ""}`}
                        strokeWidth={1.5}
                      />
                      <span className="hidden md:inline">Sync</span>
                    </button>
                    <ToolbarDivider />
                  </>
                )}

                <button
                  type="button"
                  className="flex h-8 w-8 items-center justify-center text-text-muted transition-colors hover:text-text-secondary"
                  aria-label="Notifiche"
                >
                  <Bell className="h-3.5 w-3.5" strokeWidth={1.5} />
                </button>

                <ToolbarDivider />

                <button
                  type="button"
                  onClick={onSwitchProfile}
                  title="Cambia profilo"
                  className="group flex items-center gap-2.5 py-0.5 text-left transition-opacity hover:opacity-85"
                >
                  <ProfileAvatar profile={profile} size="sm" />
                  <div className="hidden min-w-0 sm:block">
                    <p className="truncate font-display text-[13px] font-medium tracking-[-0.02em] text-text-primary">
                      {profile.name}
                    </p>
                    <p className="truncate text-[9px] uppercase tracking-[0.18em] text-text-muted">
                      {roleLabel(profile.role)}
                    </p>
                  </div>
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </header>
  );
}
