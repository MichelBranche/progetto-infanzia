import { memo, useCallback, useRef, useState, type RefObject } from "react";
import { Volume2, VolumeX } from "lucide-react";

interface PlayerVolumeControlProps {
  videoRef: RefObject<HTMLVideoElement | null>;
  initialVolume?: number;
  onBusyChange?: (busy: boolean) => void;
}

function clamp01(n: number) {
  return Math.max(0, Math.min(1, n));
}

/**
 * Volume pointer-driven (niente range nativo). Solo DOM durante il drag.
 */
export const PlayerVolumeControl = memo(function PlayerVolumeControl({
  videoRef,
  initialVolume = 1,
  onBusyChange,
}: PlayerVolumeControlProps) {
  const [expanded, setExpanded] = useState(false);
  const lastNonZeroRef = useRef(Math.max(0.05, initialVolume || 1));
  const volumeRef = useRef(clamp01(initialVolume));
  const mutedRef = useRef(false);
  const draggingRef = useRef(false);
  const trackRef = useRef<HTMLDivElement>(null);
  const fillRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLDivElement>(null);
  const volIconRef = useRef<SVGSVGElement>(null);
  const muteIconRef = useRef<SVGSVGElement>(null);
  const onBusyChangeRef = useRef(onBusyChange);
  onBusyChangeRef.current = onBusyChange;

  const paintIcon = (muted: boolean) => {
    if (volIconRef.current) volIconRef.current.style.display = muted ? "none" : "block";
    if (muteIconRef.current) muteIconRef.current.style.display = muted ? "block" : "none";
  };

  const paintFill = (v: number) => {
    const pct = `${clamp01(v) * 100}%`;
    if (fillRef.current) fillRef.current.style.width = pct;
    if (thumbRef.current) thumbRef.current.style.left = pct;
  };

  const applyToVideo = useCallback(
    (v: number, mute: boolean) => {
      const video = videoRef.current;
      if (!video) return;
      video.volume = clamp01(v);
      video.muted = mute || v === 0;
    },
    [videoRef],
  );

  const setFromClientX = (clientX: number) => {
    const track = trackRef.current;
    if (!track) return;
    const rect = track.getBoundingClientRect();
    if (rect.width <= 0) return;
    const v = clamp01((clientX - rect.left) / rect.width);
    if (v > 0) lastNonZeroRef.current = v;
    const muted = v === 0;
    volumeRef.current = v;
    mutedRef.current = muted;
    applyToVideo(v, muted);
    paintFill(v);
    paintIcon(muted);
  };

  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) return;
    if (mutedRef.current || video.volume === 0 || video.muted) {
      const restore = lastNonZeroRef.current || 1;
      volumeRef.current = restore;
      mutedRef.current = false;
      applyToVideo(restore, false);
      paintFill(restore);
      paintIcon(false);
    } else {
      if (volumeRef.current > 0) lastNonZeroRef.current = volumeRef.current;
      mutedRef.current = true;
      applyToVideo(volumeRef.current, true);
      paintFill(0);
      paintIcon(true);
    }
  };

  return (
    <div
      className="relative hidden items-center sm:flex"
      onMouseEnter={() => setExpanded(true)}
      onMouseLeave={() => {
        if (!draggingRef.current) setExpanded(false);
      }}
    >
      <button
        type="button"
        onClick={toggleMute}
        className="relative flex h-9 w-9 items-center justify-center rounded-full text-white/80 hover:bg-white/10 hover:text-white"
        aria-label="Volume"
      >
        <Volume2 ref={volIconRef} className="h-5 w-5" />
        <VolumeX
          ref={muteIconRef}
          className="absolute h-5 w-5"
          style={{ display: "none" }}
        />
      </button>
      <div
        className={`overflow-hidden transition-[max-width,opacity] duration-100 ease-out ${
          expanded ? "max-w-[5.5rem] opacity-100" : "max-w-0 opacity-0"
        }`}
      >
        <div
          ref={trackRef}
          className="player-volume-track relative mx-1 h-3 w-20 cursor-pointer touch-none select-none"
          onPointerDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            draggingRef.current = true;
            onBusyChangeRef.current?.(true);
            try {
              trackRef.current?.setPointerCapture(e.pointerId);
            } catch {
              // ignore
            }
            setFromClientX(e.clientX);
          }}
          onPointerMove={(e) => {
            e.stopPropagation();
            if (!draggingRef.current) return;
            setFromClientX(e.clientX);
          }}
          onPointerUp={(e) => {
            e.stopPropagation();
            if (!draggingRef.current) return;
            draggingRef.current = false;
            onBusyChangeRef.current?.(false);
            try {
              trackRef.current?.releasePointerCapture(e.pointerId);
            } catch {
              // ignore
            }
          }}
          onPointerCancel={() => {
            draggingRef.current = false;
            onBusyChangeRef.current?.(false);
          }}
        >
          <div className="absolute left-0 right-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-white/30">
            <div
              ref={fillRef}
              className="absolute inset-y-0 left-0 rounded-full bg-white"
              style={{ width: `${clamp01(initialVolume) * 100}%` }}
            />
          </div>
          <div
            ref={thumbRef}
            className="pointer-events-none absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white"
            style={{ left: `${clamp01(initialVolume) * 100}%` }}
          />
        </div>
      </div>
    </div>
  );
});
