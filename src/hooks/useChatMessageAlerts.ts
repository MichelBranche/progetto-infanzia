import { useCallback, useEffect, useRef } from "react";
import { useCloudAccount } from "../context/CloudAccountContext";
import { useNotifications } from "../context/NotificationContext";
import { isChatViewActive } from "../lib/activeChatView";
import { playChatNotificationSound } from "../lib/chatNotificationSound";
import {
  chatDisplayTitle,
  listMyChats,
  subscribeIncomingChatMessages,
} from "../lib/cloudChat";
import {
  formatChatMessagePreview,
  isWatchPartyInviteChatBody,
} from "../lib/watchPartyInviteChatMessage";
import { sendOsNotification } from "../lib/osNotifications";
import type { ChatConversation } from "../types/chat";
import type { ChatMessage } from "../types/chat";

const POLL_FALLBACK_MS = 45_000;

function previewBody(body: string) {
  return formatChatMessagePreview(body);
}

export function useChatMessageAlerts() {
  const { profile } = useCloudAccount();
  const { notify } = useNotifications();
  const seenMessageIdsRef = useRef<Set<string> | null>(null);
  const chatsRef = useRef<Map<string, ChatConversation>>(new Map());

  const refreshChats = useCallback(async () => {
    const chats = await listMyChats();
    chatsRef.current = new Map(chats.map((chat) => [chat.id, chat]));
    return chats;
  }, []);

  const seedSeenFromChats = useCallback((chats: ChatConversation[]) => {
    const seen = new Set<string>();
    for (const chat of chats) {
      if (chat.lastMessage?.id) seen.add(chat.lastMessage.id);
    }
    seenMessageIdsRef.current = seen;
  }, []);

  const pushMessageAlert = useCallback(
    (message: ChatMessage) => {
      if (isWatchPartyInviteChatBody(message.body)) return;

      const chat = chatsRef.current.get(message.conversationId);
      const chatTitle = chat ? chatDisplayTitle(chat) : "Chat";
      const title =
        chat?.kind === "direct"
          ? `Messaggio da ${chatTitle}`
          : `Nuovo messaggio in ${chatTitle}`;

      playChatNotificationSound();
      notify({
        kind: "message",
        title,
        message: previewBody(message.body),
        conversationId: message.conversationId,
      });
      void sendOsNotification(title, previewBody(message.body), {
        conversationId: message.conversationId,
        chatTitle,
      });
    },
    [notify],
  );

  const handleIncoming = useCallback(
    async (message: ChatMessage) => {
      if (!profile) return;
      if (message.senderId === profile.id) return;
      if (isChatViewActive(message.conversationId)) return;

      if (!seenMessageIdsRef.current) {
        seenMessageIdsRef.current = new Set();
      }
      if (seenMessageIdsRef.current.has(message.id)) return;
      seenMessageIdsRef.current.add(message.id);

      if (!chatsRef.current.has(message.conversationId)) {
        try {
          await refreshChats();
        } catch {
          // ignore lookup errors
        }
      }

      pushMessageAlert(message);
    },
    [profile, pushMessageAlert, refreshChats],
  );

  const poll = useCallback(async () => {
    if (!profile) {
      seenMessageIdsRef.current = null;
      chatsRef.current.clear();
      return;
    }

    try {
      const chats = await refreshChats();
      if (!seenMessageIdsRef.current) {
        seedSeenFromChats(chats);
        return;
      }

      for (const chat of chats) {
        const last = chat.lastMessage;
        if (!last || last.senderId === profile.id) continue;
        if (seenMessageIdsRef.current.has(last.id)) continue;
        if (isChatViewActive(chat.id)) {
          seenMessageIdsRef.current.add(last.id);
          continue;
        }

        seenMessageIdsRef.current.add(last.id);
        pushMessageAlert({
          id: last.id,
          conversationId: chat.id,
          senderId: last.senderId,
          body: last.body,
          createdAt: last.createdAt,
        });
      }
    } catch {
      // ignore transient network errors
    }
  }, [profile, pushMessageAlert, refreshChats, seedSeenFromChats]);

  useEffect(() => {
    if (!profile) return;

    void poll();
    const unsubscribe = subscribeIncomingChatMessages((message) => {
      void handleIncoming(message);
    });
    const id = window.setInterval(() => void poll(), POLL_FALLBACK_MS);

    return () => {
      unsubscribe();
      window.clearInterval(id);
    };
  }, [profile, poll, handleIncoming]);
}
