import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { isTauri } from "@tauri-apps/api/core";
import { useCloudAccount } from "./CloudAccountContext";
import { ChatPopup } from "../components/chat/ChatPopup";
import {
  CHAT_POPUP_EVENT,
  CHAT_POPUP_CLOSE_EVENT,
  type ChatPopupCloseDetail,
  type ChatPopupOpenDetail,
} from "../lib/chatPopup";
import {
  consumePendingNotificationAction,
  dispatchNotificationAction,
} from "../lib/osNotifications";
import { FRIEND_REQUESTS_EVENT } from "../lib/friendRequestsNavigation";

interface ChatPopupState {
  conversationId: string;
  title?: string;
  subtitle?: string;
}

interface ChatPopupContextValue {
  open: (conversationId: string, title?: string, subtitle?: string) => void;
  close: () => void;
  isOpen: boolean;
}

const ChatPopupContext = createContext<ChatPopupContextValue | null>(null);

export function ChatPopupProvider({ children }: { children: ReactNode }) {
  const { profile } = useCloudAccount();
  const [state, setState] = useState<ChatPopupState | null>(null);

  const open = useCallback(
    (conversationId: string, title?: string, subtitle?: string) => {
      if (!profile) return;
      setState({ conversationId, title, subtitle });
    },
    [profile],
  );

  const close = useCallback(() => {
    setState(null);
  }, []);

  const openFromDetail = useCallback(
    (detail: ChatPopupOpenDetail) => {
      open(detail.conversationId, detail.title);
    },
    [open],
  );

  useEffect(() => {
    const onPopup = (event: Event) => {
      const detail = (event as CustomEvent<ChatPopupOpenDetail>).detail;
      if (!detail?.conversationId) return;
      openFromDetail(detail);
    };
    const onClosePopup = (event: Event) => {
      if (!state) return;
      const detail = (event as CustomEvent<ChatPopupCloseDetail>).detail ?? {};
      if (
        detail.conversationId &&
        detail.conversationId !== state.conversationId
      ) {
        return;
      }
      close();
    };
    window.addEventListener(CHAT_POPUP_EVENT, onPopup);
    window.addEventListener(CHAT_POPUP_CLOSE_EVENT, onClosePopup);
    return () => {
      window.removeEventListener(CHAT_POPUP_EVENT, onPopup);
      window.removeEventListener(CHAT_POPUP_CLOSE_EVENT, onClosePopup);
    };
  }, [openFromDetail, state, close]);

  useEffect(() => {
    if (!profile) return;
    const pending = consumePendingNotificationAction();
    if (pending) dispatchNotificationAction(pending);
  }, [profile]);

  useEffect(() => {
    if (!profile || !isTauri()) return;
    let unlisten: (() => void) | undefined;

    void (async () => {
      try {
        const { onAction } = await import("@tauri-apps/plugin-notification");
        const listener = await onAction((notification) => {
          const conversationId = notification.extra?.conversationId;
          if (typeof conversationId === "string" && conversationId) {
            const chatTitle =
              typeof notification.extra?.chatTitle === "string"
                ? notification.extra.chatTitle
                : notification.title;
            open(conversationId, chatTitle);
            return;
          }
          if (notification.extra?.action === "friend-requests") {
            window.dispatchEvent(new CustomEvent(FRIEND_REQUESTS_EVENT));
          }
        });
        unlisten = () => void listener.unregister();
      } catch {
        // Su desktop il click sulla notifica OS non è sempre disponibile
      }
    })();

    return () => unlisten?.();
  }, [profile, open]);

  const value = useMemo(
    () => ({ open, close, isOpen: Boolean(state) }),
    [open, close, state],
  );

  return (
    <ChatPopupContext.Provider value={value}>
      {children}
      {profile && state && (
        <ChatPopup
          open
          conversationId={state.conversationId}
          title={state.title}
          subtitle={state.subtitle}
          currentUserId={profile.id}
          onClose={close}
        />
      )}
    </ChatPopupContext.Provider>
  );
}

export function useChatPopup() {
  const ctx = useContext(ChatPopupContext);
  if (!ctx) {
    throw new Error("useChatPopup must be used within ChatPopupProvider");
  }
  return ctx;
}
