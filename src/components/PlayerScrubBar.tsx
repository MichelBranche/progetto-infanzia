import { useCallback, useEffect, useRef, useState } from "react";
import Hls from "hls.js";
import { captureScrubFrame, captureVideoFrame } from "../lib/videoFrame";
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
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const captureGenRef = useRef(0);

  const [hover, setHover] = useState<{ percent: number; time: number } | null>(
    null,
  );
  const [previewFrame, setPreviewFrame] = useState<string | null>(null);

  useEffect(() => {
    const video = previewVideoRef.current;
    if (!video || !streamUrl || disabled) return;

    if (previewHlsRef.current) {
      previewHlsRef.current.destroy();
      previewHlsRef.current = null;
    }

    video.crossOrigin = "anonymous";
    video.muted = true;
    video.playsInline = true;
    video.preload = "metadata";

    if (isHls && Hls.isSupported()) {
      const hls = new Hls({ enableWorker: true });
      previewHlsRef.current = hls;
      hls.loadSource(streamUrl);
      hls.attachMedia(video);
      return () => {
        hls.destroy();
        previewHlsRef.current = null;
      };
    }

    video.src = streamUrl;
    return () => {
      video.removeAttribute("src");
      video.load();
    };
  }, [streamUrl, isHls, disabled]);

  const updateHover = useCallback(
    (clientX: number) => {
      const bar = barRef.current;
      if (!bar || duration <= 0) return;
      const rect = bar.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      const time = ratio * duration;
      setHover({ percent: ratio * 100, time });

      clearTimeout(debounceRef.current);
      const gen = captureGenRef.current + 1;
      captureGenRef.current = gen;

      debounceRef.current = setTimeout(() => {
        void (async () => {
          const video = previewVideoRef.current;
          if (!video || disabled) return;

          let frame = await captureScrubFrame(video, streamUrl, time);
          if (!frame && video.readyState >= 2) {
            frame = await captureVideoFrame(video, time, 240);
          }
          if (captureGenRef.current === gen) {
            setPreviewFrame(frame);
          }
        })();
      }, 45);
    },
    [duration, streamUrl, disabled],
  );

  const clearHover = useCallback(() => {
    clearTimeout(debounceRef.current);
    captureGenRef.current += 1;
    setHover(null);
    setPreviewFrame(null);
  }, []);

  return (
    <div
      ref={barRef}
      className="group/scrub relative mb-4"
      onMouseMove={(e) => updateHover(e.clientX)}
      onMouseLeave={clearHover}
    >
      {hover && previewFrame && (
        <div
          className="pointer-events-none absolute bottom-full z-30 mb-2 -translate-x-1/2"
          style={{ left: `${hover.percent}%` }}
        >
          <img
            src={previewFrame}
            alt=""
            className="w-[168px] rounded-md border border-white/20 bg-black shadow-[0_8px_24px_rgba(0,0,0,0.55)]"
          />
          <p className="mt-1 text-center text-[11px] font-medium text-white/85">
            {formatDuration(hover.time)}
          </p>
        </div>
      )}

      <video
        ref={previewVideoRef}
        className="pointer-events-none fixed -left-[9999px] h-px w-px opacity-0"
        muted
        playsInline
        preload="metadata"
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
            updateHover(
              barRef.current
                ? barRef.current.getBoundingClientRect().left +
                    (time / Math.max(duration, 1)) * barRef.current.offsetWidth
                : 0,
            );
          }}
          onMouseUp={(e) => onSeekCommit?.(Number(e.currentTarget.value))}
          onTouchEnd={(e) => onSeekCommit?.(Number(e.currentTarget.value))}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        />
      </div>
    </div>
  );
}
