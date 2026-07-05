import { useCallback, useEffect, useState } from "react";
import {
  fetchChatMessages,
  sendChatMessage,
  subscribeChatMessages,
} from "../lib/cloudChat";
import { setChatViewActive } from "../lib/activeChatView";
import type { ChatMessage } from "../types/chat";

export function useConversationChat(conversationId: string | null, active = true) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!conversationId) {
      setMessages([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const rows = await fetchChatMessages(conversationId);
      setMessages(rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setMessages([]);
    } finally {
      setLoading(false);
    }
  }, [conversationId]);

  useEffect(() => {
    if (!active || !conversationId) return;
    void refresh();
  }, [active, conversationId, refresh]);

  useEffect(() => {
    if (!active || !conversationId) return;
    setChatViewActive(conversationId, true);
    return () => setChatViewActive(conversationId, false);
  }, [active, conversationId]);

  useEffect(() => {
    if (!active || !conversationId) return;
    return subscribeChatMessages(conversationId, () => {
      void refresh();
    });
  }, [active, conversationId, refresh]);

  const send = useCallback(
    async (body: string) => {
      if (!conversationId) return;
      setSending(true);
      setError(null);
      try {
        const msg = await sendChatMessage(conversationId, body);
        setMessages((prev) => {
          if (prev.some((m) => m.id === msg.id)) return prev;
          return [...prev, msg];
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        throw err;
      } finally {
        setSending(false);
      }
    },
    [conversationId],
  );

  return { messages, loading, sending, error, refresh, send };
}
