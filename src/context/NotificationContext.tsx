import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, Info, UserPlus, X } from "lucide-react";

export type NotificationKind = "info" | "success" | "friend";

export interface AppNotification {
  id: string;
  kind: NotificationKind;
  title: string;
  message?: string;
}

interface NotificationContextValue {
  notify: (input: Omit<AppNotification, "id">) => void;
}

const NotificationContext = createContext<NotificationContextValue | null>(null);

const AUTO_DISMISS_MS = 6000;

function kindIcon(kind: NotificationKind) {
  switch (kind) {
    case "success":
      return CheckCircle2;
    case "friend":
      return UserPlus;
    default:
      return Info;
  }
}

function kindStyles(kind: NotificationKind) {
  switch (kind) {
    case "success":
      return "border-mint/25 bg-mint/10";
    case "friend":
      return "border-accent/25 bg-accent/10";
    default:
      return "border-white/10 bg-white/[0.04]";
  }
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
      setItems((prev) => [...prev.slice(-4), { ...input, id }]);
      const timer = window.setTimeout(() => dismiss(id), AUTO_DISMISS_MS);
      timersRef.current.set(id, timer);
    },
    [dismiss],
  );

  const value = useMemo(() => ({ notify }), [notify]);

  return (
    <NotificationContext.Provider value={value}>
      {children}
      <div
        className="pointer-events-none fixed bottom-6 right-6 z-[200] flex w-[min(100vw-2rem,22rem)] flex-col gap-2"
        aria-live="polite"
      >
        <AnimatePresence initial={false}>
          {items.map((item) => {
            const Icon = kindIcon(item.kind);
            return (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, y: 12, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.98 }}
                transition={{ duration: 0.2 }}
                className={`pointer-events-auto rounded-2xl border p-4 shadow-xl backdrop-blur-md ${kindStyles(item.kind)}`}
              >
                <div className="flex gap-3">
                  <Icon className="mt-0.5 h-4 w-4 shrink-0 text-text-primary" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-medium text-text-primary">
                      {item.title}
                    </p>
                    {item.message && (
                      <p className="mt-0.5 text-[12px] leading-relaxed text-text-secondary">
                        {item.message}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => dismiss(item.id)}
                    className="shrink-0 rounded-lg p-1 text-text-muted hover:bg-white/5 hover:text-text-primary"
                    aria-label="Chiudi notifica"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </motion.div>
            );
          })}
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
