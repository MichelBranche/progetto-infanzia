import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, SkipForward } from "lucide-react";

const AUTOPLAY_COUNTDOWN_SECS = 5;

interface YouTubeNextEpisode {
  videoId: string;
  title: string;
  thumbnail?: string;
}

interface YouTubePlayerProps {
  videoId: string;
  title?: string;
  nextEpisode?: YouTubeNextEpisode;
  autoplayNext?: boolean;
  onPlayNext?: (videoId: string, title: string) => void;
  onBack: () => void | Promise<void>;
}

type YtPlayer = {
  destroy: () => void;
  loadVideoById: (videoId: string) => void;
};

type YtNamespace = {
  Player: new (
    elementId: string,
    config: {
      videoId: string;
      width?: string | number;
      height?: string | number;
      playerVars?: Record<string, string | number>;
      events?: {
        onStateChange?: (event: { data: number }) => void;
        onReady?: () => void;
      };
    },
  ) => YtPlayer;
  PlayerState: {
    ENDED: number;
    PLAYING: number;
    PAUSED: number;
  };
};

declare global {
  interface Window {
    YT?: YtNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

const YT_SCRIPT_ID = "youtube-iframe-api";
let ytApiPromise: Promise<YtNamespace> | null = null;

function loadYouTubeApi(): Promise<YtNamespace> {
  if (window.YT?.Player) {
    return Promise.resolve(window.YT);
  }
  if (ytApiPromise) return ytApiPromise;

  ytApiPromise = new Promise((resolve) => {
    const finish = () => {
      if (window.YT?.Player) resolve(window.YT);
      else window.setTimeout(finish, 40);
    };

    if (!document.getElementById(YT_SCRIPT_ID)) {
      const tag = document.createElement("script");
      tag.id = YT_SCRIPT_ID;
      tag.src = "https://www.youtube.com/iframe_api";
      document.head.appendChild(tag);
    }

    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      finish();
    };
    finish();
  });

  return ytApiPromise;
}

export function YouTubePlayer({
  videoId,
  title,
  nextEpisode,
  autoplayNext = true,
  onPlayNext,
  onBack,
}: YouTubePlayerProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YtPlayer | null>(null);
  const playerMountId = useRef(`yt-player-${Math.random().toString(36).slice(2)}`);
  const autoplayCancelledRef = useRef(false);
  const advancingRef = useRef(false);
  const nextEpisodeRef = useRef(nextEpisode);
  const onPlayNextRef = useRef(onPlayNext);
  const autoplayNextRef = useRef(autoplayNext);

  nextEpisodeRef.current = nextEpisode;
  onPlayNextRef.current = onPlayNext;
  autoplayNextRef.current = autoplayNext;

  const [ready, setReady] = useState(false);
  const [showUpNext, setShowUpNext] = useState(false);
  const [autoplaySeconds, setAutoplaySeconds] = useState<number | null>(null);

  const playNext = useCallback(() => {
    if (!nextEpisode || !onPlayNext || advancingRef.current) return;
    advancingRef.current = true;
    setShowUpNext(false);
    setAutoplaySeconds(null);
    onPlayNext(nextEpisode.videoId, nextEpisode.title);
  }, [nextEpisode, onPlayNext]);

  const cancelAutoplay = useCallback(() => {
    autoplayCancelledRef.current = true;
    setShowUpNext(false);
    setAutoplaySeconds(null);
  }, []);

  useEffect(() => {
    autoplayCancelledRef.current = false;
    advancingRef.current = false;
    setShowUpNext(false);
    setAutoplaySeconds(null);
  }, [videoId]);

  useEffect(() => {
    let cancelled = false;
    const mountId = playerMountId.current;

    void loadYouTubeApi().then((YT) => {
      if (cancelled || !hostRef.current) return;

      const mount = document.createElement("div");
      mount.id = mountId;
      mount.className = "h-full w-full";
      hostRef.current.innerHTML = "";
      hostRef.current.appendChild(mount);

      playerRef.current = new YT.Player(mountId, {
        videoId,
        width: "100%",
        height: "100%",
        playerVars: {
          autoplay: 1,
          rel: 0,
          modestbranding: 1,
          playsinline: 1,
          enablejsapi: 1,
          origin: window.location.origin,
        },
        events: {
          onReady: () => {
            if (!cancelled) setReady(true);
          },
          onStateChange: (event) => {
            if (event.data !== YT.PlayerState.ENDED) return;
            if (
              !autoplayNextRef.current ||
              !nextEpisodeRef.current ||
              !onPlayNextRef.current ||
              autoplayCancelledRef.current
            ) {
              return;
            }
            setShowUpNext(true);
            setAutoplaySeconds(AUTOPLAY_COUNTDOWN_SECS);
          },
        },
      });
    });

    return () => {
      cancelled = true;
      playerRef.current?.destroy();
      playerRef.current = null;
      setReady(false);
    };
  }, []);

  useEffect(() => {
    if (!autoplayNext || !showUpNext || autoplaySeconds === null || autoplaySeconds <= 0) {
      return;
    }
    const timer = window.setTimeout(() => {
      setAutoplaySeconds((secs) => (secs !== null && secs > 0 ? secs - 1 : secs));
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [autoplayNext, showUpNext, autoplaySeconds]);

  useEffect(() => {
    if (!autoplayNext || !showUpNext || autoplaySeconds !== 0) return;
    playNext();
  }, [autoplayNext, showUpNext, autoplaySeconds, playNext]);

  useEffect(() => {
    if (!ready || !playerRef.current) return;
    try {
      playerRef.current.loadVideoById(videoId);
    } catch {
      // player may still be initializing
    }
  }, [videoId, ready]);

  const hasNext = Boolean(nextEpisode && onPlayNext);

  return (
    <div className="fixed inset-0 z-[80] flex flex-col bg-black">
      <div className="flex items-center gap-3 border-b border-white/10 px-4 py-3 sm:px-6">
        <button
          type="button"
          onClick={() => void onBack()}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white transition hover:bg-white/10"
          aria-label="Indietro"
        >
          <ArrowLeft className="h-4 w-4" strokeWidth={1.75} />
        </button>
        {title ? (
          <p className="line-clamp-2 min-w-0 flex-1 text-[14px] font-medium text-white sm:text-[15px]">
            {title}
          </p>
        ) : (
          <div className="min-w-0 flex-1" />
        )}
        {hasNext && (
          <button
            type="button"
            onClick={playNext}
            className="inline-flex shrink-0 items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-2 text-[12px] font-medium text-white transition hover:bg-white/15 sm:px-4 sm:text-[13px]"
          >
            <SkipForward className="h-4 w-4" strokeWidth={1.75} />
            <span className="hidden sm:inline">Prossimo episodio</span>
            <span className="sm:hidden">Prossimo</span>
          </button>
        )}
      </div>

      <div className="relative min-h-0 flex-1">
        <div ref={hostRef} className="absolute inset-0 h-full w-full" />

        <AnimatePresence>
          {showUpNext && nextEpisode && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="pointer-events-auto absolute inset-x-0 bottom-6 z-20 px-4 sm:bottom-8 sm:px-8"
            >
              <div className="mx-auto flex max-w-3xl items-center gap-4 rounded-xl border border-white/10 bg-black/90 p-3 shadow-2xl backdrop-blur-md sm:gap-5 sm:p-4">
                {nextEpisode.thumbnail ? (
                  <div className="relative aspect-video w-28 shrink-0 overflow-hidden rounded-md sm:w-36">
                    <img
                      src={nextEpisode.thumbnail}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                    {autoplaySeconds !== null && autoplaySeconds > 0 && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                        <span className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-white text-lg font-semibold tabular-nums text-white">
                          {autoplaySeconds}
                        </span>
                      </div>
                    )}
                  </div>
                ) : null}
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/55">
                    Prossimo episodio
                  </p>
                  <p className="mt-1 line-clamp-2 text-[15px] font-medium text-white sm:text-[16px]">
                    {nextEpisode.title}
                  </p>
                  {autoplaySeconds !== null && autoplaySeconds > 0 && (
                    <p className="mt-1 text-[12px] text-white/65">
                      Avvio automatico tra {autoplaySeconds}s
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
                  <button
                    type="button"
                    onClick={playNext}
                    className="rounded-full bg-white px-4 py-2 text-[12px] font-semibold text-black sm:text-[13px]"
                  >
                    Riproduci
                  </button>
                  <button
                    type="button"
                    onClick={cancelAutoplay}
                    className="rounded-full border border-white/15 px-4 py-2 text-[12px] text-white/75 sm:text-[13px]"
                  >
                    Annulla
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

export function youtubeVideoIdFromStreamUrl(url: string): string | null {
  const trimmed = url.trim();
  const patterns = [
    /youtube\.com\/embed\/([A-Za-z0-9_-]{11})/i,
    /youtube\.com\/watch\?v=([A-Za-z0-9_-]{11})/i,
    /youtu\.be\/([A-Za-z0-9_-]{11})/i,
  ];
  for (const pattern of patterns) {
    const match = trimmed.match(pattern);
    if (match?.[1]) return match[1];
  }
  return null;
}
