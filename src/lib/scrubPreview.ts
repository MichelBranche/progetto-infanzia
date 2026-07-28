import { captureScrubFrame, revokeFrameUrl } from "./videoFrame";

export function scrubBucketInterval(durationSec: number): number {
  if (!Number.isFinite(durationSec) || durationSec <= 0) return 5;
  if (durationSec <= 600) return 2;
  if (durationSec <= 3600) return 5;
  if (durationSec <= 7200) return 8;
  return 10;
}

export function scrubBucketForTime(timeSec: number, interval: number): number {
  return Math.floor(Math.max(0, timeSec) / interval) * interval;
}

const MAX_FRAMES_PER_STREAM = 160;
/** Oltre questa soglia i prefetch in attesa sono già obsoleti: meglio scartarli. */
const MAX_PENDING_LOW_JOBS = 3;

type CapturePriority = "high" | "low";

interface QueueJob {
  bucket: number;
  priority: CapturePriority;
  resolve: (value: string | null) => void;
}

export class ScrubPreviewEngine {
  private frames = new Map<number, string>();
  private inflight = new Map<number, Promise<string | null>>();
  private interval = 5;
  private duration = 0;
  private warmupStarted = false;
  private destroyed = false;
  private queue: QueueJob[] = [];
  private draining = false;

  constructor(
    private streamUrl: string,
    private video: HTMLVideoElement,
  ) {}

  destroy() {
    this.destroyed = true;
    this.queue = [];
    this.inflight.clear();
    for (const url of this.frames.values()) {
      revokeFrameUrl(url);
    }
    this.frames.clear();
  }

  setDuration(durationSec: number) {
    if (!Number.isFinite(durationSec) || durationSec <= 0) return;
    if (Math.abs(this.duration - durationSec) < 0.5 && this.warmupStarted) return;

    this.duration = durationSec;
    this.interval = scrubBucketInterval(durationSec);
    // Niente warmup automatico: le catture partono solo su hover fermo
    // (altrimenti il 2° decoder compete col player appena si arma).
    this.warmupStarted = true;
  }

  getNearestFrame(timeSec: number): string | null {
    const bucket = scrubBucketForTime(timeSec, this.interval);
    const direct = this.frames.get(bucket);
    if (direct) return direct;

    // Meglio un frame vicino subito che un riquadro vuoto: la cattura precisa
    // arriva un attimo dopo e sostituisce l'immagine.
    for (let step = 1; step <= 12; step += 1) {
      const delta = step * this.interval;
      const before = this.frames.get(bucket - delta);
      if (before) return before;
      const after = this.frames.get(bucket + delta);
      if (after) return after;
    }
    return null;
  }

  prefetchAround(timeSec: number) {
    const bucket = scrubBucketForTime(timeSec, this.interval);
    const targets = [
      bucket - this.interval * 2,
      bucket - this.interval,
      bucket + this.interval,
      bucket + this.interval * 2,
    ];
    for (const t of targets) {
      if (t < 0 || t > this.duration) continue;
      void this.ensureFrame(t, "low");
    }
  }

  ensureFrame(timeSec: number, priority: CapturePriority): Promise<string | null> {
    const bucket = scrubBucketForTime(timeSec, this.interval);
    const cached = this.frames.get(bucket);
    if (cached) return Promise.resolve(cached);

    const pending = this.inflight.get(bucket);
    if (pending) return pending;

    const promise = new Promise<string | null>((resolve) => {
      this.enqueue({ bucket, priority, resolve });
    });
    this.inflight.set(bucket, promise);
    promise.finally(() => {
      this.inflight.delete(bucket);
    });
    return promise;
  }

  /** Il puntatore si è spostato: i prefetch attorno al punto vecchio non servono. */
  cancelPending() {
    if (this.queue.length === 0) return;
    const dropped = this.queue.filter((job) => job.priority === "low");
    this.queue = this.queue.filter((job) => job.priority === "high");
    for (const job of dropped) job.resolve(null);
  }

  private enqueue(job: QueueJob) {
    if (this.destroyed) {
      job.resolve(null);
      return;
    }
    if (job.priority === "high") {
      // Una richiesta dell'utente non deve mettersi in fila dietro i prefetch.
      this.cancelPending();
      this.queue.unshift(job);
    } else {
      if (this.queue.length >= MAX_PENDING_LOW_JOBS) {
        job.resolve(null);
        return;
      }
      this.queue.push(job);
    }
    void this.drainQueue();
  }

  private async drainQueue() {
    if (this.draining || this.destroyed) return;
    this.draining = true;

    while (this.queue.length > 0 && !this.destroyed) {
      const highIdx = this.queue.findIndex((j) => j.priority === "high");
      const idx = highIdx >= 0 ? highIdx : 0;
      const [job] = this.queue.splice(idx, 1);
      if (!job) break;

      const cached = this.frames.get(job.bucket);
      if (cached) {
        job.resolve(cached);
        continue;
      }

      const frame = await captureScrubFrame(this.video, this.streamUrl, job.bucket);
      if (frame) {
        this.rememberFrame(job.bucket, frame);
      }
      job.resolve(frame);
    }

    this.draining = false;
    if (this.queue.some((j) => j.priority === "high")) {
      void this.drainQueue();
    }
  }

  private rememberFrame(bucket: number, frame: string) {
    const prev = this.frames.get(bucket);
    if (prev && prev !== frame) revokeFrameUrl(prev);
    this.frames.set(bucket, frame);
    if (this.frames.size > MAX_FRAMES_PER_STREAM) {
      const first = this.frames.keys().next().value;
      if (first != null) {
        const old = this.frames.get(first);
        this.frames.delete(first);
        if (old && old !== frame) revokeFrameUrl(old);
      }
    }
  }
}
