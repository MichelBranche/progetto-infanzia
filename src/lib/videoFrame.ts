import Hls from "hls.js";

const frameCache = new Map<string, string>();
let activeCaptures = 0;
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
    if (activeCaptures < 2) run();
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

export function captureVideoFrame(
  video: HTMLVideoElement,
  timeSec: number,
  width = 320,
): Promise<string | null> {
  return new Promise((resolve) => {
    const cleanup = () => {
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("error", onError);
    };

    const onError = () => {
      cleanup();
      resolve(null);
    };

    const onSeeked = () => {
      cleanup();
      try {
        if (video.videoWidth <= 0 || video.videoHeight <= 0) {
          resolve(null);
          return;
        }
        const canvas = document.createElement("canvas");
        const aspect = video.videoWidth / video.videoHeight;
        canvas.width = width;
        canvas.height = Math.round(width / aspect);
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(null);
          return;
        }
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.82));
      } catch {
        resolve(null);
      }
    };

    video.addEventListener("seeked", onSeeked);
    video.addEventListener("error", onError);
    try {
      const safeTime = Math.max(0, Math.min(timeSec, Math.max(0, video.duration - 0.25)));
      if (Math.abs(video.currentTime - safeTime) < 0.15) {
        onSeeked();
        return;
      }
      video.currentTime = safeTime;
    } catch {
      cleanup();
      resolve(null);
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
  return `scrub:${streamUrl}:${Math.round(timeSec)}`;
}

export async function captureScrubFrame(
  video: HTMLVideoElement,
  streamUrl: string,
  timeSec: number,
): Promise<string | null> {
  const key = scrubFrameCacheKey(streamUrl, timeSec);
  const cached = frameCache.get(key);
  if (cached) return cached;

  const frame = await captureVideoFrame(video, timeSec, 240);
  if (frame) {
    frameCache.set(key, frame);
  }
  return frame;
}
