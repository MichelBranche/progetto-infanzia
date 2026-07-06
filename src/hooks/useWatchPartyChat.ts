import { useEffect, useState } from "react";
import { ensureWatchPartyChat } from "../lib/cloudChat";
import type { WatchPartySession } from "../types/watchParty";

export function useWatchPartyChat(
  session: WatchPartySession | null | undefined,
  cloudUserId?: string,
) {
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!session || session.relay !== "cloud" || !cloudUserId) {
      setConversationId(null);
      setError(null);
      return;
    }

    let cancelled = false;
    setError(null);

    void ensureWatchPartyChat(session.room.code)
      .then((id) => {
        if (!cancelled) setConversationId(id);
      })
      .catch((err) => {
        if (!cancelled) {
          setConversationId(null);
          setError(err instanceof Error ? err.message : String(err));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [session, cloudUserId]);

  return { conversationId, error };
}
