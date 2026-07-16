import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AnimatePresence, motion } from "framer-motion";
import { openChatPopup } from "../lib/chatPopup";
import { openFriendRequestsScreen } from "../lib/friendRequestsNavigation";
import {
  CheckCircle2,
  ChevronRight,
  Info,
  MessageSquare,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import type { WatchPartyInvitePayload } from "../lib/cloudWatchPartyInvite";
import type { LucideIcon } from "lucide-react";

export type NotificationKind = "info" | "success" | "friend" | "message" | "watchParty";

export type NotificationAction = "open-friend-requests";

export interface AppNotification {
  id: string;
  kind: NotificationKind;
  title: string;
  message?: string;
  conversationId?: string;
  action?: NotificationAction;
  watchPartyInvite?: WatchPartyInvitePayload;
  onWatchPartyJoin?: () => void;
}

interface NotificationContextValue {
  notify: (input: Omit<AppNotification, "id">) => void;
}

const NotificationContext = createContext<NotificationContextValue | null>(null);

const AUTO_DISMISS_MS = 6000;
const MAX_VISIBLE = 4;

function kindMeta(kind: NotificationKind): {
  icon: LucideIcon;
  badgeClass: string;
  progressClass: string;
} {
  switch (kind) {
    case "success":
      return {
        icon: CheckCircle2,
        badgeClass: "bg-mint/20 text-mint",
        progressClass: "bg-mint/70",
      };
    case "friend":
      return {
        icon: UserPlus,
        badgeClass: "bg-accent/20 text-accent",
        progressClass: "bg-accent/70",
      };
    case "message":
      return {
        icon: MessageSquare,
        badgeClass: "bg-sky-400/20 text-sky-300",
        progressClass: "bg-sky-400/70",
      };
    case "watchParty":
      return {
        icon: Users,
        badgeClass: "bg-violet-400/20 text-violet-300",
        progressClass: "bg-violet-400/70",
      };
    default:
      return {
        icon: Info,
        badgeClass: "bg-white/10 text-white/70",
        progressClass: "bg-white/35",
      };
  }
}

function clickHint(item: AppNotification): string | null {
  if (item.kind === "watchParty" && item.onWatchPartyJoin) {
    return "Tocca per unirti";
  }
  if (item.kind === "message" && item.conversationId) return "Tocca per rispondere";
  if (item.action === "open-friend-requests") return "Tocca per gestire";
  return null;
}

function handleNotificationClick(item: AppNotification, dismiss: (id: string) => void) {
  if (item.kind === "watchParty" && item.onWatchPartyJoin) {
    item.onWatchPartyJoin();
    dismiss(item.id);
    return;
  }
  if (item.kind === "message" && item.conversationId) {
    openChatPopup(item.conversationId, item.title);
    dismiss(item.id);
    return;
  }
  if (item.action === "open-friend-requests") {
    openFriendRequestsScreen();
    dismiss(item.id);
  }
}

function NotificationToast({
  item,
  stackIndex,
  onDismiss,
}: {
  item: AppNotification;
  stackIndex: number;
  onDismiss: (id: string) => void;
}) {
  const { icon: KindIcon, badgeClass, progressClass } = kindMeta(item.kind);
  const hint = clickHint(item);
  const clickable = Boolean(hint);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: 28, scale: 0.94 }}
      animate={{
        opacity: 1 - stackIndex * 0.12,
        x: 0,
        scale: 1 - stackIndex * 0.03,
        y: stackIndex * 4,
      }}
      exit={{ opacity: 0, x: 20, scale: 0.96 }}
      transition={{
        type: "spring",
        stiffness: 420,
        damping: 34,
        mass: 0.85,
      }}
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      onClick={clickable ? () => handleNotificationClick(item, onDismiss) : undefined}
      onKeyDown={
        clickable
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                handleNotificationClick(item, onDismiss);
              }
            }
          : undefined
      }
      className={`group/toast pointer-events-auto relative overflow-hidden rounded-[14px] border border-white/[0.1] bg-[#1c1c1e]/72 shadow-[0_8px_32px_rgba(0,0,0,0.42),0_1px_0_rgba(255,255,255,0.06)_inset] backdrop-blur-2xl backdrop-saturate-150 ${
        clickable
          ? "cursor-pointer transition-[filter,transform] hover:brightness-110 active:scale-[0.99]"
          : ""
      }`}
      style={{ zIndex: MAX_VISIBLE - stackIndex }}
    >
      <div className="noise-overlay pointer-events-none absolute inset-0 opacity-[0.04]" />

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onDismiss(item.id);
        }}
        className="absolute right-2 top-2 z-[1] flex h-5 w-5 items-center justify-center rounded-full bg-white/[0.06] text-white/35 opacity-0 transition-all hover:bg-white/10 hover:text-white/70 group-hover/toast:opacity-100"
        aria-label="Chiudi notifica"
      >
        <X className="h-3 w-3" strokeWidth={2.5} />
      </button>

      <div className="relative flex gap-3 p-3.5 pr-8">
        <div className="relative shrink-0">
          <div className="flex h-10 w-10 items-center justify-center rounded-[11px] border border-white/[0.08] bg-[#0a0a0c] shadow-[0_2px_8px_rgba(0,0,0,0.35)]">
            <span className="chromatic-logo chromatic-logo--skew font-display text-[1.15rem] font-black leading-none tracking-[-0.08em]">
              B
            </span>
          </div>
          <span
            className={`absolute -bottom-0.5 -right-0.5 flex h-[18px] w-[18px] items-center justify-center rounded-full border border-[#1c1c1e] ${badgeClass}`}
          >
            <KindIcon className="h-2.5 w-2.5" strokeWidth={2.25} />
          </span>
        </div>

        <div className="min-w-0 flex-1 pt-0.5">
          <p className="font-display text-[13px] font-semibold leading-snug tracking-[-0.02em] text-text-primary">
            {item.title}
          </p>
          {item.message && (
            <p className="mt-0.5 line-clamp-3 text-[12px] leading-relaxed text-white/55">
              {item.message}
            </p>
          )}
          {hint && (
            <p className="mt-2 flex items-center gap-0.5 text-[11px] font-medium text-white/40">
              {hint}
              <ChevronRight className="h-3 w-3 opacity-70" strokeWidth={2.5} />
            </p>
          )}
        </div>
      </div>

      <motion.div
        className={`absolute inset-x-0 bottom-0 h-[2px] origin-left ${progressClass}`}
        initial={{ scaleX: 1 }}
        animate={{ scaleX: 0 }}
        transition={{ duration: AUTO_DISMISS_MS / 1000, ease: "linear" }}
      />
    </motion.div>
  );
}

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<AppNotification[]>([]);
  const timersRef = useRef<Map<string, number>>(new Map());

  const dismiss = useCallback((id: string) => {
    setItems((prev) => prev.filter((n) => n.id !== id));
    const timer = timersRef.current.get(id);
    if (timer) {
      window.clearTimeout(timer);
      timersRef.current.delete(id);
    }
  }, []);

  const notify = useCallback(
    (input: Omit<AppNotification, "id">) => {
      const id = crypto.randomUUID();
      setItems((prev) => [...prev.slice(-(MAX_VISIBLE - 1)), { ...input, id }]);
      const timer = window.setTimeout(() => dismiss(id), AUTO_DISMISS_MS);
      timersRef.current.set(id, timer);
    },
    [dismiss],
  );

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      for (const timer of timers.values()) {
        window.clearTimeout(timer);
      }
      timers.clear();
    };
  }, []);

  const value = useMemo(() => ({ notify }), [notify]);
  const visibleItems = [...items].reverse();

  return (
    <NotificationContext.Provider value={value}>
      {children}
      <div
        className="pointer-events-none fixed right-4 top-[calc(var(--app-nav-height)+0.85rem)] z-[200] flex w-[min(100vw-2rem,21.5rem)] flex-col gap-2.5"
        aria-live="polite"
      >
        <AnimatePresence initial={false} mode="popLayout">
          {visibleItems.map((item, index) => (
            <NotificationToast
              key={item.id}
              item={item}
              stackIndex={index}
              onDismiss={dismiss}
            />
          ))}
        </AnimatePresence>
      </div>
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const ctx = useContext(NotificationContext);
  if (!ctx) {
    throw new Error("useNotifications must be used within NotificationProvider");
  }
  return ctx;
}
