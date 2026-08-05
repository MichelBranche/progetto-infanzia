import { useEffect, useRef, type RefObject } from "react";
import {
  cinemaColorsDelta,
  DEFAULT_CINEMA_COLORS,
  getVideoContentRect,
  isCinemaAmbientTainted,
  lerpCinemaColors,
  releaseCinemaAmbientResources,
  rgbCss,
  sampleVideoEdges,
  type CinemaEdgeColors,
} from "../lib/cinemaAmbient";

/** Sample su timer (non a ogni video frame): evita di bloccare la UI. */
const SAMPLE_FPS = 12;
const TARGET_BLEND = 0.4;
const SMOOTH_HZ = 4.0;
/** Paint DOM max — abbastanza fluido, meno lavoro di stile. */
const PAINT_FPS = 30;
const PAINT_EPSILON = 0.8;
const FAIL_LIMIT = 8;
const BLEED = 0.28;
const BLEED_COMPACT = 0.2;

type FrameVideo = HTMLVideoElement & {
  requestVideoFrameCallback?: (cb: (now: number) => void) => number;
  cancelVideoFrameCallback?: (id: number) => void;
};

type CinemaAmbientProps = {
  videoRef: RefObject<HTMLVideoElement | null>;
  enabled: boolean;
  playing: boolean;
  compact?: boolean;
  onUnsupported?: () => void;
};

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true
  );
}

function applyColors(root: HTMLElement, c: CinemaEdgeColors) {
  root.style.setProperty("--cinema-left", rgbCss(c.left));
  root.style.setProperty("--cinema-right", rgbCss(c.right));
  root.style.setProperty("--cinema-top", rgbCss(c.top));
  root.style.setProperty("--cinema-bottom", rgbCss(c.bottom));
  root.style.setProperty("--cinema-tl", rgbCss(c.topLeft));
  root.style.setProperty("--cinema-tr", rgbCss(c.topRight));
  root.style.setProperty("--cinema-bl", rgbCss(c.bottomLeft));
  root.style.setProperty("--cinema-br", rgbCss(c.bottomRight));
  root.style.setProperty("--cinema-accent", rgbCss(c.accent, 0.9));
}

function clearBoxStyles(el: HTMLElement) {
  el.style.removeProperty("position");
  el.style.removeProperty("left");
  el.style.removeProperty("top");
  el.style.removeProperty("width");
  el.style.removeProperty("height");
  el.style.removeProperty("right");
  el.style.removeProperty("bottom");
  el.style.removeProperty("object-fit");
}

function applyFrameBox(
  root: HTMLElement,
  video: HTMLVideoElement,
  compact: boolean,
) {
  const stage = root.parentElement;
  if (!stage) return;
  const sw = stage.clientWidth;
  const sh = stage.clientHeight;
  const rect = getVideoContentRect(video, sw, sh);
  if (!rect) return;

  const bleed =
    Math.min(rect.width, rect.height) * (compact ? BLEED_COMPACT : BLEED);

  root.style.position = "absolute";
  root.style.left = `${Math.round(rect.left - bleed)}px`;
  root.style.top = `${Math.round(rect.top - bleed)}px`;
  root.style.width = `${Math.round(rect.width + bleed * 2)}px`;
  root.style.height = `${Math.round(rect.height + bleed * 2)}px`;
  root.style.right = "auto";
  root.style.bottom = "auto";

  video.style.position = "absolute";
  video.style.left = `${Math.round(rect.left)}px`;
  video.style.top = `${Math.round(rect.top)}px`;
  video.style.width = `${Math.round(rect.width)}px`;
  video.style.height = `${Math.round(rect.height)}px`;
  video.style.right = "auto";
  video.style.bottom = "auto";
  video.style.objectFit = "fill";
}

export function CinemaAmbient({
  videoRef,
  enabled,
  playing,
  compact = false,
  onUnsupported,
}: CinemaAmbientProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const colorsRef = useRef<CinemaEdgeColors>({ ...DEFAULT_CINEMA_COLORS });
  const targetRef = useRef<CinemaEdgeColors>({ ...DEFAULT_CINEMA_COLORS });
  const failCountRef = useRef(0);
  const onUnsupportedRef = useRef(onUnsupported);
  onUnsupportedRef.current = onUnsupported;

  useEffect(() => {
    if (!enabled || prefersReducedMotion()) {
      releaseCinemaAmbientResources();
      return;
    }

    const root = rootRef.current;
    if (!root) return;

    let paintRaf = 0;
    let sampleTimer = 0;
    let sampleHandle: number | null = null;
    let scheduledVideo: FrameVideo | null = null;
    let lastPaintAt = 0;
    let lastPaintWall = 0;
    let lastBoxKey = "";
    let running = true;
    const sampleInterval = 1000 / SAMPLE_FPS;
    const paintInterval = 1000 / PAINT_FPS;

    const stopPaint = () => {
      if (paintRaf) {
        cancelAnimationFrame(paintRaf);
        paintRaf = 0;
      }
    };

    const stopSample = () => {
      if (sampleTimer) {
        clearTimeout(sampleTimer);
        sampleTimer = 0;
      }
      if (sampleHandle != null && scheduledVideo?.cancelVideoFrameCallback) {
        scheduledVideo.cancelVideoFrameCallback(sampleHandle);
      }
      sampleHandle = null;
      scheduledVideo = null;
    };

    const stopAll = () => {
      stopPaint();
      stopSample();
    };

    const syncBox = () => {
      const video = videoRef.current;
      if (!video) return;
      const stage = root.parentElement;
      if (!stage) return;
      const key = `${stage.clientWidth}x${stage.clientHeight}:${video.videoWidth}x${video.videoHeight}:${compact ? 1 : 0}`;
      if (key === lastBoxKey) return;
      lastBoxKey = key;
      applyFrameBox(root, video, compact);
    };

    const tickPaint = (now: number) => {
      if (!running) return;
      if (document.hidden || !playing) {
        stopPaint();
        return;
      }

      paintRaf = requestAnimationFrame(tickPaint);

      if (now - lastPaintWall < paintInterval) return;
      lastPaintWall = now;

      const dt = lastPaintAt ? Math.min(0.05, (now - lastPaintAt) / 1000) : 0.033;
      lastPaintAt = now;
      const t = 1 - Math.exp(-SMOOTH_HZ * dt);
      const next = lerpCinemaColors(colorsRef.current, targetRef.current, t);
      if (cinemaColorsDelta(colorsRef.current, next) < PAINT_EPSILON) {
        colorsRef.current = next;
        return;
      }
      colorsRef.current = next;
      applyColors(root, next);
    };

    const startPaint = () => {
      if (paintRaf || !running || document.hidden || !playing) return;
      lastPaintAt = 0;
      lastPaintWall = 0;
      paintRaf = requestAnimationFrame(tickPaint);
    };

    const takeSample = () => {
      if (!running || document.hidden || !playing) return;

      const video = videoRef.current;
      if (!video || video.paused || video.ended) {
        stopAll();
        return;
      }

      syncBox();
      const sampled = sampleVideoEdges(video);
      if (!sampled) {
        if (isCinemaAmbientTainted()) {
          failCountRef.current = FAIL_LIMIT;
          stopAll();
          onUnsupportedRef.current?.();
          return;
        }
        failCountRef.current += 1;
        if (failCountRef.current >= FAIL_LIMIT) {
          stopAll();
          onUnsupportedRef.current?.();
          return;
        }
        queueSample(sampleInterval);
        return;
      }

      failCountRef.current = 0;
      targetRef.current = lerpCinemaColors(
        targetRef.current,
        sampled,
        TARGET_BLEND,
      );
      queueSample(sampleInterval);
    };

    const queueSample = (delayMs: number) => {
      if (!running || document.hidden || !playing) return;
      stopSample();
      sampleTimer = window.setTimeout(() => {
        sampleTimer = 0;
        const video = videoRef.current as FrameVideo | null;
        // Un solo RVFC per sample (non a ogni frame video).
        if (video && typeof video.requestVideoFrameCallback === "function") {
          scheduledVideo = video;
          sampleHandle = video.requestVideoFrameCallback(() => {
            sampleHandle = null;
            scheduledVideo = null;
            takeSample();
          });
          return;
        }
        takeSample();
      }, delayMs);
    };

    applyColors(root, colorsRef.current);
    lastBoxKey = "";
    syncBox();
    startPaint();
    queueSample(0);

    const onVisibility = () => {
      if (!running) return;
      if (document.hidden) {
        stopAll();
        return;
      }
      if (playing) {
        startPaint();
        queueSample(0);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    const stage = root.parentElement;
    const ro =
      typeof ResizeObserver !== "undefined" && stage
        ? new ResizeObserver(() => {
            lastBoxKey = "";
            syncBox();
          })
        : null;
    if (stage) ro?.observe(stage);

    const video = videoRef.current;
    const onMeta = () => {
      lastBoxKey = "";
      syncBox();
    };
    video?.addEventListener("loadedmetadata", onMeta);
    video?.addEventListener("resize", onMeta);

    return () => {
      running = false;
      document.removeEventListener("visibilitychange", onVisibility);
      video?.removeEventListener("loadedmetadata", onMeta);
      video?.removeEventListener("resize", onMeta);
      ro?.disconnect();
      stopAll();
      releaseCinemaAmbientResources();
      root.style.removeProperty("--cinema-left");
      root.style.removeProperty("--cinema-right");
      root.style.removeProperty("--cinema-top");
      root.style.removeProperty("--cinema-bottom");
      root.style.removeProperty("--cinema-tl");
      root.style.removeProperty("--cinema-tr");
      root.style.removeProperty("--cinema-bl");
      root.style.removeProperty("--cinema-br");
      root.style.removeProperty("--cinema-accent");
      clearBoxStyles(root);
      if (video) clearBoxStyles(video);
    };
  }, [enabled, playing, videoRef, compact]);

  if (!enabled || prefersReducedMotion()) return null;

  return (
    <div
      ref={rootRef}
      className={`cinema-ambient${compact ? " cinema-ambient--compact" : ""}`}
      aria-hidden
    >
      <span className="cinema-ambient__edge cinema-ambient__edge--left" />
      <span className="cinema-ambient__edge cinema-ambient__edge--right" />
      <span className="cinema-ambient__edge cinema-ambient__edge--top" />
      <span className="cinema-ambient__edge cinema-ambient__edge--bottom" />
      <span className="cinema-ambient__corner cinema-ambient__corner--tl" />
      <span className="cinema-ambient__corner cinema-ambient__corner--tr" />
      <span className="cinema-ambient__corner cinema-ambient__corner--bl" />
      <span className="cinema-ambient__corner cinema-ambient__corner--br" />
      <span className="cinema-ambient__accent" />
    </div>
  );
}
