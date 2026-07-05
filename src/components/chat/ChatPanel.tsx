import { useEffect, useRef, useState } from "react";
import { Loader2, Send } from "lucide-react";
import { useConversationChat } from "../../hooks/useConversationChat";

interface ChatPanelProps {
  conversationId: string | null;
  currentUserId?: string;
  title?: string;
  subtitle?: string;
  compact?: boolean;
  className?: string;
}

export function ChatPanel({
  conversationId,
  currentUserId,
  title,
  subtitle,
  compact = false,
  className = "",
}: ChatPanelProps) {
  const { messages, loading, sending, error, send } = useConversationChat(
    conversationId,
    Boolean(conversationId),
  );
  const [draft, setDraft] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, conversationId]);

  const handleSend = async () => {
    if (!draft.trim() || sending) return;
    const text = draft;
    setDraft("");
    try {
      await send(text);
    } catch {
      setDraft(text);
    }
  };

  if (!conversationId) {
    return (
      <div className={`flex items-center justify-center rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6 text-[13px] text-text-muted ${className}`}>
        Seleziona una conversazione
      </div>
    );
  }

  return (
    <div
      className={`flex min-h-0 flex-col overflow-hidden rounded-2xl border border-white/[0.07] bg-[#0a0a0e]/80 ${
        compact ? "h-[min(42vh,360px)]" : "h-[min(62vh,560px)]"
      } ${className}`}
    >
      {(title || subtitle) && (
        <div className="border-b border-white/[0.06] px-4 py-3">
          {title && (
            <p className="font-display text-[14px] font-medium text-text-primary">{title}</p>
          )}
          {subtitle && <p className="mt-0.5 text-[11px] text-text-muted">{subtitle}</p>}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        {loading && messages.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-text-muted" />
          </div>
        ) : messages.length === 0 ? (
          <p className="py-8 text-center text-[13px] text-text-muted">
            Nessun messaggio. Scrivi il primo!
          </p>
        ) : (
          <ul className="space-y-2">
            {messages.map((msg) => {
              const mine = currentUserId && msg.senderId === currentUserId;
              return (
                <li key={msg.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-[13px] leading-relaxed ${
                      mine
                        ? "bg-accent/20 text-text-primary"
                        : "bg-white/[0.06] text-text-secondary"
                    }`}
                  >
                    <p className="whitespace-pre-wrap break-words">{msg.body}</p>
                    <p className="mt-1 text-[10px] opacity-60">
                      {new Date(msg.createdAt).toLocaleTimeString("it-IT", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        <div ref={bottomRef} />
      </div>

      {error && (
        <p className="border-t border-warm/20 bg-warm/10 px-4 py-2 text-[12px] text-warm">
          {error}
        </p>
      )}

      <form
        className="flex items-center gap-2 border-t border-white/[0.06] p-3"
        onSubmit={(e) => {
          e.preventDefault();
          void handleSend();
        }}
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Scrivi un messaggio…"
          maxLength={2000}
          className="min-w-0 flex-1 rounded-full border border-white/10 bg-black/25 px-4 py-2.5 text-[13px] text-text-primary outline-none placeholder:text-text-muted focus:border-accent/40"
        />
        <button
          type="submit"
          disabled={sending || !draft.trim()}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent text-white transition-opacity hover:opacity-90 disabled:opacity-40"
          aria-label="Invia"
        >
          {sending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
        </button>
      </form>
    </div>
  );
}
