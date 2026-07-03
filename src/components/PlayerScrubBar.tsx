import { useCallback, useEffect, useRef, useState } from "react";
import Hls from "hls.js";
import { ScrubPreviewEngine } from "../lib/scrubPreview";
import { formatDuration } from "../types/media";

interface PlayerScrubBarProps {
  duration: number;
  currentTime: number;
  bufferPct: number;
  progressPct: number;
  streamUrl: string;
  isHls: boolean;
  disabled?: boolean;
  onSeek: (time: number) => void;
  onSeekCommit?: (time: number) => void;
}

function clampRatio(clientX: number, rect: DOMRect): number {
  return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
}

export function PlayerScrubBar({
  duration,
  currentTime,
  bufferPct,
  progressPct,
  streamUrl,
  isHls,
  disabled = false,
  onSeek,
  onSeekCommit,
}: PlayerScrubBarProps) {
  const barRef = useRef<HTMLDivElement>(null);
  const previewVideoRef = useRef<HTMLVideoElement>(null);
  const previewHlsRef = useRef<Hls | null>(null);
  const engineRef = useRef<ScrubPreviewEngine | null>(null);
  const hoverGenRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const pendingXRef = useRef<number | null>(null);
  const lastFrameRef = useRef<string | null>(null);

  const [hover, setHover] = useState<{ percent: number; time: number } | null>(
    null,
  );
  const [displayFrame, setDisplayFrame] = useState<string | null>(null);
  const [frameLoading, setFrameLoading] = useState(false);

  useEffect(() => {
    const video = previewVideoRef.current;
    if (!video || !streamUrl || disabled) return;

    if (previewHlsRef.current) {
      previewHlsRef.current.destroy();
      previewHlsRef.current = null;
    }
    engineRef.current?.destroy();
    engineRef.current = new ScrubPreviewEngine(streamUrl, video);

    video.crossOrigin = "anonymous";
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";

    if (isHls && Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        maxBufferLength: 8,
        maxMaxBufferLength: 16,
        backBufferLength: 0,
        startFragPrefetch: true,
      });
      previewHlsRef.current = hls;
      hls.loadSource(streamUrl);
      hls.attachMedia(video);
    } else {
      video.src = streamUrl;
    }

    const onMeta = () => {
      if (video.duration > 0) {
        engineRef.current?.setDuration(video.duration);
      }
    };
    video.addEventListener("loadedmetadata", onMeta);
    if (video.readyState >= 1) onMeta();

    return () => {
      video.removeEventListener("loadedmetadata", onMeta);
      previewHlsRef.current?.destroy();
      previewHlsRef.current = null;
      engineRef.current?.destroy();
      engineRef.current = null;
      video.removeAttribute("src");
      video.load();
    };
  }, [streamUrl, isHls, disabled]);

  useEffect(() => {
    if (duration > 0) {
      engineRef.current?.setDuration(duration);
    }
  }, [duration]);

  const resolveFrame = useCallback((time: number, gen: number) => {
    const engine = engineRef.current;
    if (!engine || disabled) return;

    const nearest = engine.getNearestFrame(time);
    if (nearest) {
      lastFrameRef.current = nearest;
      setDisplayFrame(nearest);
      setFrameLoading(false);
    } else if (!lastFrameRef.current) {
      setFrameLoading(true);
    }

    engine.prefetchAround(time);

    void engine.ensureFrame(time, "high").then((frame) => {
      if (hoverGenRef.current !== gen) return;
      if (frame) {
        lastFrameRef.current = frame;
        setDisplayFrame(frame);
      }
      setFrameLoading(false);
    });
  }, [disabled]);

  const applyHoverAt = useCallback(
    (clientX: number) => {
      const bar = barRef.current;
      if (!bar || duration <= 0 || disabled) return;

      const rect = bar.getBoundingClientRect();
      const ratio = clampRatio(clientX, rect);
      const time = ratio * duration;
      const gen = hoverGenRef.current + 1;
      hoverGenRef.current = gen;

      setHover({ percent: ratio * 100, time });
      resolveFrame(time, gen);
    },
    [duration, disabled, resolveFrame],
  );

  const queueHoverUpdate = useCallback(
    (clientX: number) => {
      pendingXRef.current = clientX;
      if (rafRef.current != null) return;
      rafRef.current = window.requestAnimationFrame(() => {
        rafRef.current = null;
        const x = pendingXRef.current;
        pendingXRef.current = null;
        if (x != null) applyHoverAt(x);
      });
    },
    [applyHoverAt],
  );

  const clearHover = useCallback(() => {
    if (rafRef.current != null) {
      window.cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    pendingXRef.current = null;
    hoverGenRef.current += 1;
    setHover(null);
    setDisplayFrame(null);
    setFrameLoading(false);
    lastFrameRef.current = null;
  }, []);

  useEffect(
    () => () => {
      if (rafRef.current != null) {
        window.cancelAnimationFrame(rafRef.current);
      }
    },
    [],
  );

  const showPreview = hover != null;
  const previewImage = displayFrame ?? lastFrameRef.current;

  return (
    <div
      ref={barRef}
      className="group/scrub relative mb-4 touch-none"
      onMouseMove={(e) => queueHoverUpdate(e.clientX)}
      onMouseLeave={clearHover}
    >
      {showPreview && (
        <div
          className="pointer-events-none absolute bottom-full z-30 mb-3 -translate-x-1/2 will-change-[left]"
          style={{ left: `${hover.percent}%` }}
        >
          <div className="overflow-hidden rounded-lg border border-white/15 bg-black shadow-[0_12px_40px_rgba(0,0,0,0.65)]">
            <div className="relative aspect-video w-[min(42vw,220px)] bg-white/[0.06]">
              {previewImage ? (
                <img
                  key={previewImage.slice(0, 48)}
                  src={previewImage}
                  alt=""
                  className="h-full w-full object-cover transition-opacity duration-150"
                  style={{ opacity: frameLoading ? 0.72 : 1 }}
                />
              ) : (
                <div className="absolute inset-0 shimmer-bg" />
              )}
              {frameLoading && previewImage && (
                <div className="pointer-events-none absolute inset-0 bg-black/15" />
              )}
            </div>
            <p className="px-2.5 py-1.5 text-center text-[11px] font-semibold tabular-nums tracking-wide text-white/90">
              {formatDuration(hover.time)}
            </p>
          </div>
        </div>
      )}

      <video
        ref={previewVideoRef}
        className="pointer-events-none fixed -left-[9999px] h-px w-px opacity-0"
        muted
        playsInline
        preload="auto"
      />

      <div className="relative h-1 rounded-full bg-white/20 transition-all group-hover/scrub:h-1.5">
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-white/30"
          style={{ width: `${bufferPct}%` }}
        />
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-[#e50914]"
          style={{ width: `${progressPct}%` }}
        />
        {showPreview && (
          <div
            className="pointer-events-none absolute top-1/2 z-10 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[#e50914] bg-white shadow-[0_0_0_2px_rgba(0,0,0,0.35)]"
            style={{ left: `${hover.percent}%` }}
          />
        )}
        <input
          type="range"
          min={0}
          max={duration || 0}
          step={0.1}
          value={currentTime}
          disabled={disabled}
          onChange={(e) => {
            const time = Number(e.target.value);
            onSeek(time);
            const bar = barRef.current;
            if (bar) {
              const rect = bar.getBoundingClientRect();
              queueHoverUpdate(
                rect.left + (time / Math.max(duration, 1)) * rect.width,
              );
            }
          }}
          onMouseUp={(e) => onSeekCommit?.(Number(e.currentTarget.value))}
          onTouchEnd={(e) => onSeekCommit?.(Number(e.currentTarget.value))}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        />
      </div>
    </div>
  );
}
