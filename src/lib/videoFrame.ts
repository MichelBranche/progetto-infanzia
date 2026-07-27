import Hls from "hls.js";

const frameCache = new Map<string, string>();
let activeCaptures = 0;
const MAX_CONCURRENT_CAPTURES = 3;
const captureQueue: Array<() => void> = [];

function scheduleCapture<T>(fn: () => Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const run = () => {
      activeCaptures += 1;
      fn()
        .then(resolve, reject)
        .finally(() => {
          activeCaptures -= 1;
          const next = captureQueue.shift();
          if (next) next();
        });
    };
    if (activeCaptures < MAX_CONCURRENT_CAPTURES) run();
    else captureQueue.push(run);
  });
}

/** Punto deterministico nel video (stesso seed → stesso frame). */
export function seededPreviewTime(seed: string, durationSec: number): number {
  if (!Number.isFinite(durationSec) || durationSec <= 0) return 0;

  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  const t = (Math.abs(hash) % 10_000) / 10_000;

  const margin =
    durationSec > 180
      ? Math.min(90, durationSec * 0.08)
      : durationSec > 60
        ? Math.min(15, durationSec * 0.06)
        : Math.min(4, durationSec * 0.05);

  const min = margin;
  const max = Math.max(min, durationSec - margin - 0.5);
  if (max <= min) return Math.max(0, durationSec * 0.35);
  return min + t * (max - min);
}

/** Un seek che non torna blocca tutta la coda delle anteprime. */
const SEEK_TIMEOUT_MS = 2500;
const SCRUB_SEEK_TIMEOUT_MS = 6000;

type FrameCallbackVideo = HTMLVideoElement & {
  requestVideoFrameCallback?: (callback: () => void) => number;
  cancelVideoFrameCallback?: (handle: number) => void;
};

export function captureVideoFrame(
  video: HTMLVideoElement,
  timeSec: number,
  width = 320,
  timeoutMs = SEEK_TIMEOUT_MS,
): Promise<string | null> {
  return new Promise((resolve) => {
    let settled = false;
    let frameHandle: number | null = null;
    const frameVideo = video as FrameCallbackVideo;

    const cleanup = () => {
      window.clearTimeout(timer);
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("error", onError);
      if (frameHandle !== null) {
        frameVideo.cancelVideoFrameCallback?.(frameHandle);
        frameHandle = null;
      }
    };

    const finish = (frame: string | null) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(frame);
    };

    const timer = window.setTimeout(() => finish(null), timeoutMs);

    const onError = () => finish(null);

    const draw = () => {
      try {
        if (video.videoWidth <= 0 || video.videoHeight <= 0) {
          finish(null);
          return;
        }
        const canvas = document.createElement("canvas");
        const aspect = video.videoWidth / video.videoHeight;
        canvas.width = width;
        canvas.height = Math.round(width / aspect);
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          finish(null);
          return;
        }
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        finish(canvas.toDataURL("image/jpeg", 0.82));
      } catch {
        finish(null);
      }
    };

    const onSeeked = () => {
      video.removeEventListener("seeked", onSeeked);
      // "seeked" può precedere la presentazione del nuovo frame: senza questa
      // attesa si finisce per catturare l'immagine del punto precedente.
      if (typeof frameVideo.requestVideoFrameCallback === "function") {
        frameHandle = frameVideo.requestVideoFrameCallback(() => {
          frameHandle = null;
          draw();
        });
        return;
      }
      draw();
    };

    video.addEventListener("seeked", onSeeked);
    video.addEventListener("error", onError);
    try {
      const safeTime = Math.max(0, Math.min(timeSec, Math.max(0, video.duration - 0.25)));
      if (Math.abs(video.currentTime - safeTime) < 0.08 && video.readyState >= 2) {
        onSeeked();
        return;
      }
      video.currentTime = safeTime;
    } catch {
      finish(null);
    }
  });
}

function waitForMetadata(video: HTMLVideoElement, timeoutMs = 12_000): Promise<number> {
  return new Promise((resolve, reject) => {
    if (video.readyState >= 1 && Number.isFinite(video.duration) && video.duration > 0) {
      resolve(video.duration);
      return;
    }

    const timer = window.setTimeout(() => {
      cleanup();
      reject(new Error("metadata timeout"));
    }, timeoutMs);

    const onMeta = () => {
      cleanup();
      resolve(video.duration);
    };
    const onError = () => {
      cleanup();
      reject(new Error("video error"));
    };
    const cleanup = () => {
      window.clearTimeout(timer);
      video.removeEventListener("loadedmetadata", onMeta);
      video.removeEventListener("error", onError);
    };

    video.addEventListener("loadedmetadata", onMeta, { once: true });
    video.addEventListener("error", onError, { once: true });
  });
}

function attachStreamToVideo(
  video: HTMLVideoElement,
  url: string,
  isHls: boolean,
): () => void {
  video.crossOrigin = "anonymous";
  video.muted = true;
  video.playsInline = true;
  video.preload = "metadata";

  let hls: Hls | null = null;

  if (isHls && Hls.isSupported()) {
    hls = new Hls({ enableWorker: true });
    hls.loadSource(url);
    hls.attachMedia(video);
    return () => {
      hls?.destroy();
    };
  }

  video.src = url;
  return () => {
    video.removeAttribute("src");
    video.load();
  };
}

export async function captureFrameFromStream(
  cacheKey: string,
  url: string,
  isHls: boolean,
  seed: string,
  durationHintSec = 24 * 60,
): Promise<string | null> {
  const cached = frameCache.get(cacheKey);
  if (cached) return cached;

  return scheduleCapture(async () => {
    const again = frameCache.get(cacheKey);
    if (again) return again;

    const video = document.createElement("video");
    video.className = "pointer-events-none fixed opacity-0";
    video.style.left = "-9999px";
    document.body.appendChild(video);

    const detach = attachStreamToVideo(video, url, isHls);

    try {
      const duration = await waitForMetadata(video).catch(() => durationHintSec);
      const time = seededPreviewTime(seed, duration);
      const frame = await captureVideoFrame(video, time);
      if (frame) {
        frameCache.set(cacheKey, frame);
        if (frameCache.size > 120) {
          const first = frameCache.keys().next().value;
          if (first) frameCache.delete(first);
        }
      }
      return frame;
    } finally {
      detach();
      video.remove();
    }
  });
}

export function scrubFrameCacheKey(streamUrl: string, timeSec: number): string {
  return `scrub:${streamUrl}:${Math.round(timeSec * 2) / 2}`;
}

export async function captureScrubFrame(
  video: HTMLVideoElement,
  streamUrl: string,
  timeSec: number,
): Promise<string | null> {
  const key = scrubFrameCacheKey(streamUrl, timeSec);
  const cached = frameCache.get(key);
  if (cached) return cached;

  // Non passare dalla coda globale condivisa con le miniature episodi:
  // lo scrub ha già una coda seriale sul proprio video element.
  const frame = await captureVideoFrame(video, timeSec, 280, SCRUB_SEEK_TIMEOUT_MS);
  if (frame) {
    frameCache.set(key, frame);
    if (frameCache.size > 200) {
      const first = frameCache.keys().next().value;
      if (first) frameCache.delete(first);
    }
  }
  return frame;
}
