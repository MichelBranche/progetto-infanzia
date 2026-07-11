import { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { MessageSquare, X } from "lucide-react";
import { ChatPanel } from "./ChatPanel";

interface ChatPopupProps {
  open: boolean;
  conversationId: string;
  title?: string;
  subtitle?: string;
  currentUserId: string;
  onClose: () => void;
}

export function ChatPopup({
  open,
  conversationId,
  title,
  subtitle,
  currentUserId,
  onClose,
}: ChatPopupProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key={conversationId}
          role="dialog"
          aria-label={title ? `Chat con ${title}` : "Chat"}
          initial={{ opacity: 0, y: 48, x: -24, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, x: 0, scale: 1 }}
          exit={{ opacity: 0, y: 32, x: -16, scale: 0.94 }}
          transition={{
            type: "spring",
            damping: 26,
            stiffness: 340,
            mass: 0.85,
          }}
          className="fixed bottom-24 left-4 z-[180] w-[min(calc(100vw-2rem),24rem)] sm:bottom-6 sm:left-6"
        >
          <div className="relative overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0a0a0c] shadow-[0_24px_64px_rgba(0,0,0,0.65)]">
            <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-sky-400/20 via-sky-400/5 to-transparent" />
            <div className="noise-overlay pointer-events-none absolute inset-0 opacity-[0.07]" />

            <div className="relative flex items-start justify-between gap-3 border-b border-white/[0.06] px-4 py-3">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-sky-400/25 bg-sky-400/10 shadow-[0_0_24px_rgba(56,189,248,0.12)]">
                  <MessageSquare className="h-4 w-4 text-sky-300" />
                </div>
                <div className="min-w-0">
                  <p className="truncate font-display text-[14px] font-semibold tracking-[-0.02em] text-text-primary">
                    {title ?? "Messaggi"}
                  </p>
                  {subtitle && (
                    <p className="mt-0.5 truncate text-[11px] text-text-muted">
                      {subtitle}
                    </p>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="shrink-0 rounded-full border border-white/10 bg-black/30 p-2 text-text-muted backdrop-blur-sm transition-colors hover:border-white/20 hover:text-text-primary"
                aria-label="Chiudi chat"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <ChatPanel
              conversationId={conversationId}
              currentUserId={currentUserId}
              compact
              className="!h-[min(50vh,380px)] !rounded-none !border-0 !bg-transparent"
            />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
