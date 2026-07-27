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
  const hoverTimeRef = useRef<number | null>(null);
  /** Secondo decoder solo dopo il primo hover — evita spike all'apertura player. */
  const [previewArmed, setPreviewArmed] = useState(false);
  const [previewReady, setPreviewReady] = useState(false);

  const [hover, setHover] = useState<{ percent: number; time: number } | null>(
    null,
  );
  const [displayFrame, setDisplayFrame] = useState<string | null>(null);
  const [frameLoading, setFrameLoading] = useState(false);
  /** Posizione trascinata: il seek reale parte solo al rilascio. */
  const [scrubTime, setScrubTime] = useState<number | null>(null);
  const scrubTimeRef = useRef<number | null>(null);
  const draggingRef = useRef(false);
  const pointerInsideRef = useRef(false);
  const settleTimerRef = useRef<number | null>(null);

  useEffect(() => {
    setPreviewArmed(false);
    setPreviewReady(false);
  }, [streamUrl, isHls]);

  useEffect(() => {
    if (!previewArmed || disabled || !streamUrl) return;
    const video = previewVideoRef.current;
    if (!video) return;

    let cancelled = false;
    setPreviewReady(false);

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

    const markReady = () => {
      if (cancelled) return;
      if (video.duration > 0) {
        engineRef.current?.setDuration(video.duration);
      }
      setPreviewReady(true);
    };

    if (isHls && Hls.isSupported()) {
      // Anteprima dedicata: qualità minima, buffer corto. Non deve competere
      // con il player principale sui segmenti ad alta risoluzione.
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: false,
        maxBufferLength: 4,
        maxMaxBufferLength: 8,
        backBufferLength: 0,
        startFragPrefetch: false,
        capLevelToPlayerSize: false,
        abrEwmaDefaultEstimate: 300_000,
        // Un solo livello basso: seek molto più veloci sul proxy.
        autoStartLoad: true,
      });
      previewHlsRef.current = hls;
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        if (hls.levels.length > 0) {
          const lowest = hls.levels.reduce(
            (best, level, index) =>
              (level.height ?? 0) < (hls.levels[best]?.height ?? Infinity)
                ? index
                : best,
            0,
          );
          hls.currentLevel = lowest;
          hls.loadLevel = lowest;
        }
        markReady();
      });
      hls.loadSource(streamUrl);
      hls.attachMedia(video);
    } else {
      video.src = streamUrl;
    }

    video.addEventListener("loadedmetadata", markReady);
    if (video.readyState >= 1) markReady();

    return () => {
      cancelled = true;
      video.removeEventListener("loadedmetadata", markReady);
      previewHlsRef.current?.destroy();
      previewHlsRef.current = null;
      engineRef.current?.destroy();
      engineRef.current = null;
      video.removeAttribute("src");
      video.load();
      setPreviewReady(false);
    };
  }, [previewArmed, streamUrl, isHls, disabled]);

  useEffect(() => {
    if (duration > 0) {
      engineRef.current?.setDuration(duration);
    }
  }, [duration]);

  const resolveFrame = useCallback(
    (time: number, gen: number) => {
      const engine = engineRef.current;
      if (!engine || disabled || !previewReady) {
        if (!disabled) setFrameLoading(true);
        return;
      }

      const nearest = engine.getNearestFrame(time);
      if (nearest) {
        lastFrameRef.current = nearest;
        setDisplayFrame(nearest);
        setFrameLoading(false);
      } else if (!lastFrameRef.current) {
        setFrameLoading(true);
      }

      // Mentre il puntatore si muove si mostra solo ciò che è già in cache:
      // catturare a ogni pixel significherebbe un seek del decoder per pixel.
      if (settleTimerRef.current !== null) {
        window.clearTimeout(settleTimerRef.current);
      }
      settleTimerRef.current = window.setTimeout(() => {
        settleTimerRef.current = null;
        if (hoverGenRef.current !== gen) return;

        void engine.ensureFrame(time, "high").then((frame) => {
          if (hoverGenRef.current !== gen) return;
          if (frame) {
            lastFrameRef.current = frame;
            setDisplayFrame(frame);
          }
          setFrameLoading(false);
          if (hoverGenRef.current === gen) engine.prefetchAround(time);
        });
      }, 90);
    },
    [disabled, previewReady],
  );

  // L'engine arriva dopo il primo hover: ripeti la richiesta in sospeso.
  useEffect(() => {
    if (!previewReady || hoverTimeRef.current == null) return;
    const gen = hoverGenRef.current + 1;
    hoverGenRef.current = gen;
    resolveFrame(hoverTimeRef.current, gen);
  }, [previewReady, resolveFrame]);

  const applyHoverAt = useCallback(
    (clientX: number) => {
      const bar = barRef.current;
      if (!bar || duration <= 0 || disabled) return;

      const rect = bar.getBoundingClientRect();
      const ratio = clampRatio(clientX, rect);
      const time = ratio * duration;
      const gen = hoverGenRef.current + 1;
      hoverGenRef.current = gen;
      hoverTimeRef.current = time;

      setHover({ percent: ratio * 100, time });
      resolveFrame(time, gen);
    },
    [duration, disabled, resolveFrame],
  );

  const queueHoverUpdate = useCallback(
    (clientX: number) => {
      if (!previewArmed) setPreviewArmed(true);
      pendingXRef.current = clientX;
      if (rafRef.current != null) return;
      rafRef.current = window.requestAnimationFrame(() => {
        rafRef.current = null;
        const x = pendingXRef.current;
        pendingXRef.current = null;
        if (x != null) applyHoverAt(x);
      });
    },
    [applyHoverAt, previewArmed],
  );

  const clearHover = useCallback(() => {
    if (draggingRef.current) return;
    if (rafRef.current != null) {
      window.cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (settleTimerRef.current !== null) {
      window.clearTimeout(settleTimerRef.current);
      settleTimerRef.current = null;
    }
    pendingXRef.current = null;
    hoverTimeRef.current = null;
    hoverGenRef.current += 1;
    engineRef.current?.cancelPending();
    setHover(null);
    setDisplayFrame(null);
    setFrameLoading(false);
    lastFrameRef.current = null;
  }, []);

  const commitScrub = useCallback(() => {
    const time = scrubTimeRef.current;
    draggingRef.current = false;
    scrubTimeRef.current = null;
    setScrubTime(null);
    if (time != null) {
      onSeek(time);
      onSeekCommit?.(time);
    }
    // Rilascio avvenuto lontano dalla barra: l'anteprima non deve restare su.
    if (!pointerInsideRef.current) clearHover();
  }, [onSeek, onSeekCommit, clearHover]);

  const isScrubbing = scrubTime != null;

  useEffect(() => {
    if (!isScrubbing) return;
    // Il rilascio può avvenire fuori dalla barra: intercettalo comunque.
    window.addEventListener("pointerup", commitScrub);
    window.addEventListener("pointercancel", commitScrub);
    return () => {
      window.removeEventListener("pointerup", commitScrub);
      window.removeEventListener("pointercancel", commitScrub);
    };
  }, [isScrubbing, commitScrub]);

  useEffect(
    () => () => {
      if (rafRef.current != null) {
        window.cancelAnimationFrame(rafRef.current);
      }
      if (settleTimerRef.current !== null) {
        window.clearTimeout(settleTimerRef.current);
      }
    },
    [],
  );

  const showPreview = hover != null;
  const previewImage = displayFrame ?? lastFrameRef.current;
  const activeProgressPct =
    scrubTime != null && duration > 0
      ? Math.max(0, Math.min(100, (scrubTime / duration) * 100))
      : progressPct;

  return (
    <div
      ref={barRef}
      className="group/scrub relative mb-4 touch-none"
      onPointerEnter={() => {
        pointerInsideRef.current = true;
        if (!previewArmed && !disabled) setPreviewArmed(true);
      }}
      onPointerMove={(e) => {
        // Durante il drag dell'<input> i move arrivano qui: aggiorna anteprima
        // senza far seekare il player principale.
        queueHoverUpdate(e.clientX);
      }}
      onPointerLeave={() => {
        pointerInsideRef.current = false;
        clearHover();
      }}
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
                  src={previewImage}
                  alt=""
                  className="h-full w-full object-cover"
                  style={{ opacity: frameLoading ? 0.78 : 1 }}
                  draggable={false}
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

      {/* Video nascosto: sorgente/HLS solo dopo previewArmed. */}
      <video
        ref={previewVideoRef}
        className="pointer-events-none fixed -left-[9999px] h-px w-px opacity-0"
        muted
        playsInline
        preload="none"
      />

      <div className="relative h-1 rounded-full bg-white/20 transition-all group-hover/scrub:h-1.5">
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-white/30"
          style={{ width: `${bufferPct}%` }}
        />
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-[#e50914]"
          style={{ width: `${activeProgressPct}%` }}
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
          value={scrubTime ?? currentTime}
          disabled={disabled}
          onPointerDown={() => {
            draggingRef.current = true;
            if (!previewArmed) setPreviewArmed(true);
          }}
          onChange={(e) => {
            const time = Number(e.target.value);
            if (draggingRef.current) {
              // Trascinamento: muovi solo l'indicatore. Un seek per pixel
              // svuoterebbe il buffer HLS a ripetizione.
              scrubTimeRef.current = time;
              setScrubTime(time);
            } else {
              onSeek(time);
              onSeekCommit?.(time);
            }
            hoverTimeRef.current = time;
            const bar = barRef.current;
            if (bar) {
              const rect = bar.getBoundingClientRect();
              queueHoverUpdate(
                rect.left + (time / Math.max(duration, 1)) * rect.width,
              );
            }
          }}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        />
      </div>
    </div>
  );
}
