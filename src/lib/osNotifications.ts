import { isTauri } from "@tauri-apps/api/core";
import { openChatPopup } from "./chatPopup";
import { openFriendRequestsScreen } from "./friendRequestsNavigation";

export type NotificationClickAction =
  | { type: "chat"; conversationId: string; title?: string }
  | { type: "friend-requests" };

export type OsNotificationExtra = {
  conversationId?: string;
  chatTitle?: string;
  action?: "friend-requests";
};

const PENDING_ACTION_KEY = "branchefy-pending-notification-action";

function storePendingAction(action: NotificationClickAction) {
  try {
    sessionStorage.setItem(PENDING_ACTION_KEY, JSON.stringify(action));
  } catch {
    // ignore
  }
}

export function consumePendingNotificationAction(): NotificationClickAction | null {
  try {
    const raw = sessionStorage.getItem(PENDING_ACTION_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(PENDING_ACTION_KEY);
    const parsed = JSON.parse(raw) as NotificationClickAction;
    if (parsed?.type === "chat" && parsed.conversationId) return parsed;
    if (parsed?.type === "friend-requests") return parsed;
  } catch {
    // ignore
  }
  return null;
}

export function dispatchNotificationAction(action: NotificationClickAction) {
  if (action.type === "chat") {
    openChatPopup(action.conversationId, action.title);
    return;
  }
  openFriendRequestsScreen();
}

function resolvePendingAction(
  extra?: OsNotificationExtra,
  title?: string,
): NotificationClickAction | null {
  if (extra?.conversationId) {
    return {
      type: "chat",
      conversationId: extra.conversationId,
      title: extra.chatTitle ?? title,
    };
  }
  if (extra?.action === "friend-requests") {
    return { type: "friend-requests" };
  }
  return null;
}

export async function sendOsNotification(
  title: string,
  body?: string,
  extra?: OsNotificationExtra,
): Promise<void> {
  const pending = resolvePendingAction(extra, title);

  try {
    if (isTauri()) {
      const {
        isPermissionGranted,
        requestPermission,
        sendNotification,
      } = await import("@tauri-apps/plugin-notification");
      let granted = await isPermissionGranted();
      if (!granted) {
        const permission = await requestPermission();
        granted = permission === "granted";
      }
      if (granted) {
        if (pending) storePendingAction(pending);
        sendNotification({
          title,
          body,
          extra: extra
            ? {
                conversationId: extra.conversationId,
                chatTitle: extra.chatTitle ?? title,
                action: extra.action,
              }
            : undefined,
        });
      }
      return;
    }

    if (typeof window !== "undefined" && "Notification" in window) {
      if (Notification.permission === "default") {
        await Notification.requestPermission();
      }
      if (Notification.permission === "granted") {
        const notification = new Notification(title, { body });
        if (pending) {
          notification.onclick = () => {
            window.focus();
            notification.close();
            dispatchNotificationAction(pending);
          };
        }
      }
    }
  } catch {
    // notifiche OS opzionali
  }
}

/** @deprecated Usa consumePendingNotificationAction */
export function consumePendingChatPopup() {
  const action = consumePendingNotificationAction();
  if (action?.type === "chat") {
    return { conversationId: action.conversationId, title: action.title };
  }
  return null;
}
