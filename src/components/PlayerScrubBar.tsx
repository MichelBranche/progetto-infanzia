import { memo, useCallback, useEffect, useRef, type RefObject } from "react";

interface PlayerScrubBarProps {
  videoRef: RefObject<HTMLVideoElement | null>;
  duration: number;
  disabled?: boolean;
  onBusyChange?: (busy: boolean) => void;
  onSeek: (time: number) => void;
  onSeekCommit?: (time: number) => void;
}

function clamp01(n: number) {
  return Math.max(0, Math.min(1, n));
}

function formatClock(seconds: number): string {
  const t = Math.max(0, Math.floor(seconds || 0));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/**
 * Timeline pointer-driven (niente <input type="range">).
 * Zero setState in hover/drag — solo DOM.
 */
export const PlayerScrubBar = memo(function PlayerScrubBar({
  videoRef,
  duration,
  disabled = false,
  onBusyChange,
  onSeek,
  onSeekCommit,
}: PlayerScrubBarProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const progressFillRef = useRef<HTMLDivElement>(null);
  const bufferFillRef = useRef<HTMLDivElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const tipTimeRef = useRef<HTMLParagraphElement>(null);
  const knobRef = useRef<HTMLDivElement>(null);

  const durationRef = useRef(duration);
  durationRef.current = duration;
  const scrubTimeRef = useRef<number | null>(null);
  const draggingRef = useRef(false);
  const pointerInsideRef = useRef(false);
  const onBusyChangeRef = useRef(onBusyChange);
  onBusyChangeRef.current = onBusyChange;
  const onSeekRef = useRef(onSeek);
  onSeekRef.current = onSeek;
  const onSeekCommitRef = useRef(onSeekCommit);
  onSeekCommitRef.current = onSeekCommit;

  const setTipVisible = (visible: boolean) => {
    if (tipRef.current) tipRef.current.style.opacity = visible ? "1" : "0";
    if (knobRef.current) knobRef.current.style.opacity = visible ? "1" : "0";
  };

  const ratioFromClientX = (clientX: number) => {
    const track = trackRef.current;
    if (!track) return 0;
    const rect = track.getBoundingClientRect();
    if (rect.width <= 0) return 0;
    return clamp01((clientX - rect.left) / rect.width);
  };

  const paintAt = useCallback((ratio: number, dragging: boolean) => {
    const pct = `${ratio * 100}%`;
    if (tipRef.current) tipRef.current.style.left = pct;
    if (knobRef.current) knobRef.current.style.left = pct;
    const dur = durationRef.current;
    const time = ratio * dur;
    if (tipTimeRef.current) tipTimeRef.current.textContent = formatClock(time);
    if (dragging && progressFillRef.current) {
      progressFillRef.current.style.width = pct;
    }
    return time;
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const sync = () => {
      const dur = durationRef.current;
      if (dur <= 0 || draggingRef.current) return;
      const ratio = clamp01(video.currentTime / dur);
      if (progressFillRef.current) {
        progressFillRef.current.style.width = `${ratio * 100}%`;
      }
      if (video.buffered.length > 0 && bufferFillRef.current) {
        try {
          const end = video.buffered.end(video.buffered.length - 1);
          bufferFillRef.current.style.width = `${clamp01(end / dur) * 100}%`;
        } catch {
          // ignore
        }
      }
    };

    video.addEventListener("timeupdate", sync);
    video.addEventListener("progress", sync);
    sync();
    return () => {
      video.removeEventListener("timeupdate", sync);
      video.removeEventListener("progress", sync);
    };
  }, [videoRef, duration]);

  useEffect(() => {
    const onUp = (e: PointerEvent) => {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      const time = scrubTimeRef.current;
      scrubTimeRef.current = null;
      onBusyChangeRef.current?.(false);
      if (time != null) {
        onSeekRef.current(time);
        onSeekCommitRef.current?.(time);
      }
      if (!pointerInsideRef.current) setTipVisible(false);
      try {
        (e.target as Element | null)?.releasePointerCapture?.(e.pointerId);
      } catch {
        // ignore
      }
    };
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, []);

  const onPointerDown = (e: React.PointerEvent) => {
    if (disabled || durationRef.current <= 0) return;
    e.preventDefault();
    e.stopPropagation();
    draggingRef.current = true;
    onBusyChangeRef.current?.(true);
    setTipVisible(true);
    try {
      trackRef.current?.setPointerCapture(e.pointerId);
    } catch {
      // ignore
    }
    const time = paintAt(ratioFromClientX(e.clientX), true);
    scrubTimeRef.current = time;
  };

  const onPointerMove = (e: React.PointerEvent) => {
    e.stopPropagation();
    if (disabled || durationRef.current <= 0) return;
    if (!draggingRef.current && !pointerInsideRef.current) return;
    const ratio = ratioFromClientX(e.clientX);
    if (draggingRef.current) {
      scrubTimeRef.current = paintAt(ratio, true);
    } else {
      paintAt(ratio, false);
    }
  };

  return (
    <div
      className="player-scrub relative mb-3 touch-none select-none sm:mb-4"
      onPointerEnter={() => {
        pointerInsideRef.current = true;
        if (!disabled) setTipVisible(true);
      }}
      onPointerLeave={() => {
        pointerInsideRef.current = false;
        if (!draggingRef.current) setTipVisible(false);
      }}
    >
      <div
        ref={tipRef}
        className="pointer-events-none absolute bottom-full z-30 mb-2 -translate-x-1/2"
        style={{ left: "0%", opacity: 0 }}
      >
        <p
          ref={tipTimeRef}
          className="rounded-md border border-white/15 bg-black/90 px-2.5 py-1 text-center text-[11px] font-semibold tabular-nums text-white"
        >
          0:00
        </p>
      </div>

      <div
        ref={trackRef}
        className="player-scrub-hit relative h-11 cursor-pointer touch-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
      >
        <div className="absolute left-0 right-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-white/20 sm:h-1">
          <div
            ref={bufferFillRef}
            className="absolute inset-y-0 left-0 rounded-full bg-white/25"
            style={{ width: "0%" }}
          />
          <div
            ref={progressFillRef}
            className="absolute inset-y-0 left-0 rounded-full bg-[#e50914]"
            style={{ width: "0%" }}
          />
        </div>
        <div
          ref={knobRef}
          className="pointer-events-none absolute top-1/2 z-10 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[#e50914] bg-white"
          style={{ left: "0%", opacity: 0 }}
        />
      </div>
    </div>
  );
});
