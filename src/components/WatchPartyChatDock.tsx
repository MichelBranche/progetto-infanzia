import { useEffect, useRef, useState } from "react";
import { ChevronDown, MessageSquare } from "lucide-react";
import { useWatchPartyChat } from "../hooks/useWatchPartyChat";
import { ChatPanel } from "./chat/ChatPanel";
import type { WatchPartySession } from "../types/watchParty";

interface WatchPartyChatDockProps {
  session: WatchPartySession | null;
  cloudUserId?: string;
}

/**
 * Chat della stanza sempre a portata di mano durante il watch party:
 * pannello ancorato in basso a destra, collassabile a tendina. La chat è
 * disponibile solo per le stanze online (cloud); in LAN il dock non compare.
 *
 * Il pannello resta montato anche da collassato (altezza 0 via grid-rows) così
 * la sottoscrizione ai messaggi resta viva e il badge "non letti" funziona.
 */
export function WatchPartyChatDock({
  session,
  cloudUserId,
}: WatchPartyChatDockProps) {
  const cloudSession = session?.relay === "cloud" ? session : null;
  const { conversationId } = useWatchPartyChat(cloudSession, cloudUserId);
  const [collapsed, setCollapsed] = useState(false);
  const [count, setCount] = useState(0);
  const seenRef = useRef(0);

  // Reset all'ingresso/uscita da una stanza (cambio conversazione).
  useEffect(() => {
    setCollapsed(false);
    setCount(0);
    seenRef.current = 0;
  }, [conversationId]);

  // Da aperto, tutti i messaggi sono "letti".
  useEffect(() => {
    if (!collapsed) seenRef.current = count;
  }, [collapsed, count]);

  if (!cloudSession || !cloudUserId || !conversationId) return null;

  const unread = collapsed ? Math.max(0, count - seenRef.current) : 0;

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[80] flex max-w-[calc(100vw-2rem)] justify-end">
      <div className="pointer-events-auto flex w-[min(92vw,340px)] flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#0d0d12] shadow-[0_20px_60px_rgba(0,0,0,0.6)]">
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          className="flex items-center justify-between gap-2 border-b border-white/10 bg-white/[0.03] px-4 py-2.5 text-left transition-colors hover:bg-white/[0.06]"
          aria-expanded={!collapsed}
          aria-label={collapsed ? "Apri chat stanza" : "Riduci chat stanza"}
        >
          <span className="flex items-center gap-2 text-[13px] font-medium text-white">
            <MessageSquare className="h-4 w-4 text-accent" />
            Chat stanza
            {unread > 0 && (
              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1.5 text-[11px] font-semibold text-void">
                {unread > 9 ? "9+" : unread}
              </span>
            )}
          </span>
          <ChevronDown
            className={`h-4 w-4 text-text-muted transition-transform duration-300 ${
              collapsed ? "-rotate-180" : "rotate-0"
            }`}
          />
        </button>

        <div
          className="grid transition-[grid-template-rows] duration-300 ease-out"
          style={{ gridTemplateRows: collapsed ? "0fr" : "1fr" }}
        >
          <div className="overflow-hidden">
            <ChatPanel
              conversationId={conversationId}
              currentUserId={cloudUserId}
              className="h-[min(52vh,420px)] rounded-none border-0"
              onActivity={setCount}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
