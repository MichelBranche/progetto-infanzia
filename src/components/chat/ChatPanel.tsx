import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Loader2, Send, Trash2 } from "lucide-react";
import { useConversationChat } from "../../hooks/useConversationChat";
import { parseWatchPartyInviteChatBody } from "../../lib/watchPartyInviteChatMessage";
import { ChatEmojiPicker } from "./ChatEmojiPicker";
import { ChatWatchPartyInviteBubble } from "./ChatWatchPartyInviteBubble";

interface ChatPanelProps {
  conversationId: string | null;
  currentUserId?: string;
  title?: string;
  subtitle?: string;
  compact?: boolean;
  className?: string;
  onDeleteChat?: () => void | Promise<void>;
  deletingChat?: boolean;
  canDeleteChat?: boolean;
  onBack?: () => void;
}

export function ChatPanel({
  conversationId,
  currentUserId,
  title,
  subtitle,
  compact = false,
  className = "",
  onDeleteChat,
  deletingChat = false,
  canDeleteChat = false,
  onBack,
}: ChatPanelProps) {
  const { messages, loading, sending, error, send } = useConversationChat(
    conversationId,
    Boolean(conversationId),
  );
  const [draft, setDraft] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, conversationId]);

  const insertEmoji = (emoji: string) => {
    const input = inputRef.current;
    if (!input) {
      setDraft((current) => current + emoji);
      return;
    }
    const start = input.selectionStart ?? draft.length;
    const end = input.selectionEnd ?? draft.length;
    const next = draft.slice(0, start) + emoji + draft.slice(end);
    setDraft(next);
    requestAnimationFrame(() => {
      input.focus();
      const caret = start + emoji.length;
      input.setSelectionRange(caret, caret);
    });
  };

  const canSend = draft.trim().length > 0 && !sending;

  const handleSend = async () => {
    if (!canSend) return;
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
        compact
          ? "h-[min(42vh,360px)]"
          : className
            ? ""
            : "h-[min(62vh,560px)]"
      } ${className}`}
    >
      {(onBack || title || subtitle || (canDeleteChat && onDeleteChat)) && (
        <div className="flex items-start justify-between gap-3 border-b border-white/[0.06] px-4 py-3">
          <div className="flex min-w-0 items-start gap-2">
            {onBack && (
              <button
                type="button"
                onClick={onBack}
                className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-text-secondary transition-colors hover:bg-white/[0.08] hover:text-text-primary lg:hidden"
                aria-label="Torna alle conversazioni"
              >
                <ArrowLeft className="h-4 w-4" strokeWidth={1.85} />
              </button>
            )}
            <div className="min-w-0">
            {title && (
              <p className="font-display text-[14px] font-medium text-text-primary">{title}</p>
            )}
            {subtitle && <p className="mt-0.5 text-[11px] text-text-muted">{subtitle}</p>}
            </div>
          </div>
          {canDeleteChat && onDeleteChat && (
            <button
              type="button"
              onClick={() => void onDeleteChat()}
              disabled={deletingChat}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-text-muted transition-colors hover:border-warm/30 hover:bg-warm/10 hover:text-warm disabled:opacity-50"
              aria-label="Elimina chat"
              title="Elimina chat"
            >
              {deletingChat ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" strokeWidth={1.85} />
              )}
            </button>
          )}
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
              const invite = parseWatchPartyInviteChatBody(msg.body);
              return (
                <li key={msg.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-[13px] leading-relaxed ${
                      invite
                        ? mine
                          ? "border border-accent/20 bg-accent/10 text-text-primary"
                          : "border border-violet-400/20 bg-violet-400/10 text-text-primary"
                        : mine
                          ? "bg-accent/20 text-text-primary"
                          : "bg-white/[0.06] text-text-secondary"
                    }`}
                  >
                    {invite ? (
                      <ChatWatchPartyInviteBubble payload={invite} mine={Boolean(mine)} />
                    ) : (
                      <p className="whitespace-pre-wrap break-words">{msg.body}</p>
                    )}
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
        onSubmit={(event) => {
          event.preventDefault();
          void handleSend();
        }}
      >
        <ChatEmojiPicker onSelect={insertEmoji} disabled={sending} />
        <input
          ref={inputRef}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Scrivi un messaggio…"
          maxLength={2000}
          disabled={sending}
          className="min-w-0 flex-1 rounded-full border border-white/10 bg-black/25 px-4 py-2.5 text-[13px] text-text-primary outline-none placeholder:text-text-muted focus:border-accent/40 disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={!canSend}
          onClick={(event) => {
            event.preventDefault();
            void handleSend();
          }}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/15 bg-text-primary text-void shadow-[0_4px_16px_rgba(0,0,0,0.28)] transition-[opacity,transform] hover:opacity-90 active:scale-95 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/10 disabled:text-text-muted disabled:opacity-100 disabled:shadow-none"
          aria-label="Invia messaggio"
        >
          {sending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" strokeWidth={2.1} />
          )}
        </button>
      </form>
    </div>
  );
}
