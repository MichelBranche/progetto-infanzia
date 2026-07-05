import { useEffect, useRef, useState } from "react";
import type { MediaItem } from "../types/media";
import { useProfile } from "../context/ProfileContext";
import { useStreamUrl } from "../hooks/useStreamUrl";
import { previewStartTime } from "../lib/preview";
import { PreviewLoadingOverlay } from "./VideoPreviewShell";

interface VideoPreviewProps {
  media: MediaItem;
  active: boolean;
  maxDurationSec: number;
  className?: string;
  muted?: boolean;
  onEnded?: () => void;
}

export function VideoPreview({
  media,
  active,
  maxDurationSec,
  className = "",
  muted = true,
  onEnded,
}: VideoPreviewProps) {
  const { activeProfile } = useProfile();
  const videoRef = useRef<HTMLVideoElement>(null);
  const startedAtRef = useRef<number | null>(null);
  const loadedKeyRef = useRef<string | null>(null);
  const { url } = useStreamUrl(activeProfile?.id, media.id, active);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!active) setReady(false);
  }, [active, url]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !url || !active) return;

    const loadKey = `${media.id}:${url}`;
    if (loadedKeyRef.current === loadKey && !video.paused) {
      return;
    }

    const onLoaded = () => {
      const duration =
        Number.isFinite(video.duration) && video.duration > 0
          ? video.duration
          : (media.watchDuration ?? 0);
      const start = previewStartTime(media, maxDurationSec, duration);
      try {
        const safeStart = Math.min(
          Math.max(0, start),
          Math.max(0, duration - 1),
        );
        if (loadedKeyRef.current !== loadKey) {
          video.currentTime = safeStart;
        }
      } catch {
        // ignore seek errors on unsupported formats
      }
      void video.play().catch(() => undefined);
      startedAtRef.current = performance.now();
      loadedKeyRef.current = loadKey;
    };

    if (video.readyState >= 1 && loadedKeyRef.current === loadKey) {
      void video.play().catch(() => undefined);
      return;
    }

    if (video.readyState >= 1) onLoaded();
    else video.addEventListener("loadedmetadata", onLoaded, { once: true });

    return () => {
      video.removeEventListener("loadedmetadata", onLoaded);
      if (!active) {
        video.pause();
        startedAtRef.current = null;
        loadedKeyRef.current = null;
      }
    };
  }, [url, active, media.id, maxDurationSec, media.watchDuration]);

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

  if (!url || !active) return null;

  return (
    <div className={`relative ${className}`}>
      <PreviewLoadingOverlay show={!ready} />
      <video
        ref={videoRef}
        src={url}
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
