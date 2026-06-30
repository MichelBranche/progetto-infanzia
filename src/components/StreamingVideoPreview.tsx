import { useEffect, useRef, useState } from "react";
import Hls from "hls.js";
import { getCachedScPreview } from "../lib/streamingPreviewCache";
import { PreviewLoadingOverlay } from "./VideoPreviewShell";

interface StreamingVideoPreviewProps {
  titleId: string;
  slug: string;
  active: boolean;
  maxDurationSec: number;
  className?: string;
  muted?: boolean;
  onEnded?: () => void;
}

export function StreamingVideoPreview({
  titleId,
  slug,
  active,
  maxDurationSec,
  className = "",
  muted = true,
  onEnded,
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
  }, [active, titleId, slug]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !active) return;

    let cancelled = false;
    setResolving(true);
    setReady(false);

    void getCachedScPreview(titleId, slug).then((stream) => {
      if (cancelled || !video) return;
      setResolving(false);

      if (!stream) return;

      const cleanup = () => {
        if (hlsRef.current) {
          hlsRef.current.destroy();
          hlsRef.current = null;
        }
      };

      const onLoaded = () => {
        try {
          video.currentTime = 0;
        } catch {
          // ignore seek errors
        }
        void video.play().catch(() => undefined);
        startedAtRef.current = performance.now();
        setReady(true);
      };

      cleanup();

      if (stream.isHls && Hls.isSupported()) {
        const hls = new Hls({ enableWorker: true, maxBufferLength: 15 });
        hlsRef.current = hls;
        hls.loadSource(stream.url);
        hls.attachMedia(video);
        hls.on(Hls.Events.MANIFEST_PARSED, onLoaded);
      } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
        video.src = stream.url;
        if (video.readyState >= 1) onLoaded();
        else video.addEventListener("loadedmetadata", onLoaded, { once: true });
      } else {
        video.src = stream.url;
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
  }, [titleId, slug, active]);

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
