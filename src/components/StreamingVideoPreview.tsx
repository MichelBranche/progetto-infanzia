import { useEffect, useRef, useState } from "react";
import Hls from "hls.js";
import { getCachedStreamingPreview } from "../lib/streamingPreviewCache";
import type { AddonWatchTarget } from "../lib/streamingBrowse";
import { PreviewLoadingOverlay } from "./VideoPreviewShell";

interface StreamingVideoPreviewProps {
  target: AddonWatchTarget;
  active: boolean;
  maxDurationSec: number;
  className?: string;
  muted?: boolean;
  onEnded?: () => void;
  onUnavailable?: () => void;
}

export function StreamingVideoPreview({
  target,
  active,
  maxDurationSec,
  className = "",
  muted = true,
  onEnded,
  onUnavailable,
}: StreamingVideoPreviewProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const startedAtRef = useRef<number | null>(null);
  const [ready, setReady] = useState(false);
  const [resolving, setResolving] = useState(false);

  useEffect(() => {
    if (!active) {
      setReady(false);
      setResolving(false);
    }
  }, [active, target.metaId, target.slug, target.catalogPrefix]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !active) return;

    let cancelled = false;
    setResolving(true);
    setReady(false);

    void getCachedStreamingPreview(target, maxDurationSec).then((clip) => {
      if (cancelled || !video) return;
      setResolving(false);

      if (!clip) {
        onUnavailable?.();
        return;
      }

      const cleanup = () => {
        if (hlsRef.current) {
          hlsRef.current.destroy();
          hlsRef.current = null;
        }
      };

      const onLoaded = () => {
        try {
          const duration =
            Number.isFinite(video.duration) && video.duration > 0
              ? video.duration
              : 0;
          const safeStart =
            duration > 1
              ? Math.min(Math.max(0, clip.startTimeSec), duration - 1)
              : Math.max(0, clip.startTimeSec);
          video.currentTime = safeStart;
        } catch {
          // ignore seek errors
        }
        void video.play().catch(() => undefined);
        startedAtRef.current = performance.now();
        setReady(true);
      };

      cleanup();

      if (clip.isHls && Hls.isSupported()) {
        const hls = new Hls({ enableWorker: true, maxBufferLength: 15 });
        hlsRef.current = hls;
        hls.loadSource(clip.url);
        hls.attachMedia(video);
        hls.on(Hls.Events.MANIFEST_PARSED, onLoaded);
      } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
        video.src = clip.url;
        if (video.readyState >= 1) onLoaded();
        else video.addEventListener("loadedmetadata", onLoaded, { once: true });
      } else {
        video.src = clip.url;
        if (video.readyState >= 1) onLoaded();
        else video.addEventListener("loadedmetadata", onLoaded, { once: true });
      }
    });

    return () => {
      cancelled = true;
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
      video.pause();
      video.removeAttribute("src");
      video.load();
      startedAtRef.current = null;
    };
  }, [target, active, maxDurationSec, onUnavailable]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = muted;
    if (!muted && active) {
      void video.play().catch(() => undefined);
    }
  }, [muted, active]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !active) return;

    const onTimeUpdate = () => {
      const started = startedAtRef.current;
      if (started == null) return;
      const elapsed = (performance.now() - started) / 1000;
      if (elapsed >= maxDurationSec) {
        video.pause();
        onEnded?.();
      }
    };

    video.addEventListener("timeupdate", onTimeUpdate);
    return () => video.removeEventListener("timeupdate", onTimeUpdate);
  }, [active, maxDurationSec, onEnded]);

  if (!active) return null;

  return (
    <div className={`relative ${className}`}>
      <PreviewLoadingOverlay show={resolving || !ready} />
      <video
        ref={videoRef}
        muted={muted}
        playsInline
        preload="metadata"
        onLoadedData={() => setReady(true)}
        onCanPlay={() => setReady(true)}
        onWaiting={() => setReady(false)}
        className="h-full w-full object-cover"
      />
    </div>
  );
}
