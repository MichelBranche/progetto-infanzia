import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import EmojiPicker, { EmojiStyle, Theme } from "emoji-picker-react";
import { Smile } from "lucide-react";

interface ChatEmojiPickerProps {
  onSelect: (emoji: string) => void;
  disabled?: boolean;
}

export function ChatEmojiPicker({ onSelect, disabled = false }: ChatEmojiPickerProps) {
  const [open, setOpen] = useState(false);
  const [panelPos, setPanelPos] = useState<{ bottom: number; left: number } | null>(
    null,
  );
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  const updatePanelPos = () => {
    const button = buttonRef.current;
    if (!button) return;
    const rect = button.getBoundingClientRect();
    const width = Math.min(352, window.innerWidth - 16);
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));
    setPanelPos({
      bottom: window.innerHeight - rect.top + 10,
      left,
    });
  };

  const close = () => {
    setOpen(false);
    setPanelPos(null);
  };

  const toggle = () => {
    if (disabled) return;
    if (open) {
      close();
      return;
    }
    updatePanelPos();
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;

    const onResize = () => updatePanelPos();
    window.addEventListener("resize", onResize);

    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (panelRef.current?.contains(target)) return;
      if (buttonRef.current?.contains(target)) return;
      close();
    };

    const attachId = window.setTimeout(() => {
      document.addEventListener("mousedown", onPointerDown, true);
    }, 0);

    return () => {
      window.clearTimeout(attachId);
      window.removeEventListener("resize", onResize);
      document.removeEventListener("mousedown", onPointerDown, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        disabled={disabled}
        onClick={toggle}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls={open ? panelId : undefined}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-text-secondary transition-colors hover:border-white/20 hover:bg-white/[0.08] hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-40"
        aria-label="Inserisci emoji"
      >
        <Smile className="h-[18px] w-[18px]" strokeWidth={1.85} />
      </button>

      {open &&
        panelPos &&
        createPortal(
          <div
            ref={panelRef}
            id={panelId}
            role="dialog"
            aria-label="Selettore emoji"
            className="chat-emoji-picker fixed z-[220] overflow-hidden rounded-2xl border border-white/[0.08] shadow-[0_20px_50px_rgba(0,0,0,0.55)]"
            style={{
              bottom: panelPos.bottom,
              left: panelPos.left,
              width: Math.min(352, window.innerWidth - 16),
            }}
          >
            <EmojiPicker
              theme={Theme.DARK}
              emojiStyle={EmojiStyle.NATIVE}
              lazyLoadEmojis
              searchPlaceHolder="Cerca emoji…"
              width="100%"
              height={380}
              onEmojiClick={(emojiData) => {
                onSelect(emojiData.emoji);
              }}
            />
          </div>,
          document.body,
        )}
    </>
  );
}
