import { useEffect, useRef, useState } from "react";
import { captureFrameFromStream } from "../lib/videoFrame";

interface UseEpisodeFrameThumbnailOptions {
  enabled: boolean;
  cacheKey: string;
  seed: string;
  durationHintSec?: number;
  resolveStream?: () => Promise<{ url: string; isHls: boolean } | null>;
}

export function useEpisodeFrameThumbnail({
  enabled,
  cacheKey,
  seed,
  durationHintSec,
  resolveStream,
}: UseEpisodeFrameThumbnailOptions) {
  const [thumbnail, setThumbnail] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [visible, setVisible] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const node = rootRef.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "120px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!enabled || !visible || !resolveStream) return;

    let cancelled = false;
    setLoading(true);

    void (async () => {
      try {
        const stream = await resolveStream();
        if (cancelled || !stream?.url) return;
        const frame = await captureFrameFromStream(
          cacheKey,
          stream.url,
          stream.isHls,
          seed,
          durationHintSec,
        );
        if (!cancelled && frame) setThumbnail(frame);
      } catch {
        // fallback al placeholder
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    enabled,
    visible,
    cacheKey,
    seed,
    durationHintSec,
    resolveStream,
  ]);

  return { thumbnail, loading, rootRef };
}
