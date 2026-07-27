import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Minimize2, Pause, Play, Volume2, VolumeX } from "lucide-react";
import {
  loadYouTubeApi,
  type YtPlayer,
} from "../lib/youtubeIframeApi";

/** https://www.youtube.com/watch?v=aDigLqvugS4 */
const VIDEO_ID = "aDigLqvugS4";
const DOCK_TITLE = "Branchefy";
/** Parte da 0.10s come richiesto. */
const START_AT_SEC = 0.1;
/** Volume YouTube 0–100. */
const DEFAULT_VOLUME = 50;

type StickyYouTubeLayout = "boot" | "sticky";

interface StickyYouTubeDockProps {
  /** boot = centrato sotto il loading; sticky = basso destra in app. */
  layout?: StickyYouTubeLayout;
  /** When true, hide the dock and pause playback (e.g. watch overlay open). */
  forcePaused?: boolean;
}

export function StickyYouTubeDock({
  layout = "sticky",
  forcePaused = false,
}: StickyYouTubeDockProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YtPlayer | null>(null);
  const playerMountId = useRef(`yt-sticky-${Math.random().toString(36).slice(2)}`);
  const forcePausedRef = useRef(forcePaused);
  const wasPlayingBeforeForceRef = useRef(false);
  const playingRef = useRef(false);
  const startedAtSeekRef = useRef(false);

  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [minimized, setMinimized] = useState(false);

  forcePausedRef.current = forcePaused;
  playingRef.current = playing;

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

      const startPlayback = (target: YtPlayer) => {
        try {
          if (!startedAtSeekRef.current) {
            target.seekTo?.(START_AT_SEC, true);
            startedAtSeekRef.current = true;
          }
          target.setVolume?.(DEFAULT_VOLUME);
          target.unMute?.();
          target.playVideo?.();
          setMuted(false);
        } catch {
          try {
            target.setVolume?.(DEFAULT_VOLUME);
            target.mute?.();
            target.playVideo?.();
            setMuted(true);
          } catch {
            // user can press play
          }
        }
      };

      playerRef.current = new YT.Player(mountId, {
        videoId: VIDEO_ID,
        width: "320",
        height: "180",
        playerVars: {
          autoplay: 1,
          mute: 0,
          start: Math.floor(START_AT_SEC),
          rel: 0,
          modestbranding: 1,
          playsinline: 1,
          controls: 0,
          disablekb: 1,
          fs: 0,
          enablejsapi: 1,
          origin: window.location.origin,
        },
        events: {
          onReady: (event) => {
            if (cancelled) return;
            setReady(true);
            if (forcePausedRef.current) {
              try {
                event.target.pauseVideo?.();
              } catch {
                // ignore
              }
              return;
            }
            startPlayback(event.target);
            window.setTimeout(() => {
              if (cancelled || forcePausedRef.current) return;
              const player = playerRef.current;
              if (!player) return;
              try {
                // Affina a 0.10s (start= param è intero) e verifica mute policy.
                player.seekTo?.(START_AT_SEC, true);
                player.setVolume?.(DEFAULT_VOLUME);
                player.playVideo?.();
                if (player.isMuted?.()) {
                  setMuted(true);
                }
              } catch {
                // ignore
              }
            }, 250);
          },
          onStateChange: (event) => {
            setPlaying(event.data === YT.PlayerState.PLAYING);
            if (event.data === YT.PlayerState.ENDED && !forcePausedRef.current) {
              try {
                playerRef.current?.seekTo?.(START_AT_SEC, true);
                playerRef.current?.playVideo?.();
              } catch {
                // ignore
              }
            }
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
    const player = playerRef.current;
    if (!ready || !player) return;

    if (forcePaused) {
      wasPlayingBeforeForceRef.current = playingRef.current;
      try {
        player.pauseVideo?.();
      } catch {
        // ignore
      }
      return;
    }

    if (wasPlayingBeforeForceRef.current) {
      wasPlayingBeforeForceRef.current = false;
      try {
        player.playVideo?.();
      } catch {
        // ignore
      }
    }
  }, [forcePaused, ready]);

  const togglePlay = () => {
    const player = playerRef.current;
    if (!player || forcePaused) return;
    try {
      if (playing) player.pauseVideo?.();
      else player.playVideo?.();
    } catch {
      // ignore
    }
  };

  const toggleMute = () => {
    const player = playerRef.current;
    if (!player) return;
    try {
      if (muted) {
        player.setVolume?.(DEFAULT_VOLUME);
        player.unMute?.();
        setMuted(false);
        if (!playing) player.playVideo?.();
      } else {
        player.mute?.();
        setMuted(true);
      }
    } catch {
      // ignore
    }
  };

  const controls = (
    <>
      <button
        type="button"
        onClick={togglePlay}
        disabled={!ready}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/15 disabled:opacity-40"
        aria-label={playing ? "Pausa" : "Play"}
      >
        {playing ? (
          <Pause className="h-4 w-4" strokeWidth={2} />
        ) : (
          <Play className="h-4 w-4 fill-current" strokeWidth={0} />
        )}
      </button>

      <button
        type="button"
        onClick={toggleMute}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/15"
        aria-label={muted ? "Attiva audio" : "Disattiva audio"}
      >
        {muted ? (
          <VolumeX className="h-4 w-4" strokeWidth={2} />
        ) : (
          <Volume2 className="h-4 w-4" strokeWidth={2} />
        )}
      </button>

      <div className="min-w-0 flex-1 px-1 text-left">
        <p className="truncate text-[12px] font-semibold text-white">{DOCK_TITLE}</p>
        <p className="truncate text-[10px] text-white/50">
          {!ready
            ? "Avvio…"
            : muted
              ? "Tocca per sentire"
              : playing
                ? "In riproduzione"
                : "In pausa"}
        </p>
      </div>
    </>
  );

  const isBoot = layout === "boot";

  return (
    <div
      className={
        isBoot
          ? `lf-sticky-yt lf-sticky-yt--boot pointer-events-auto fixed left-1/2 top-[calc(50%+6.75rem)] z-[110] w-[min(18rem,calc(100vw-3rem))] -translate-x-1/2 ${
              forcePaused ? "invisible pointer-events-none" : ""
            }`
          : `lf-sticky-yt pointer-events-auto fixed bottom-[calc(var(--mobile-nav-height,0px)+1rem)] right-4 z-[45] sm:bottom-6 ${
              forcePaused ? "invisible pointer-events-none" : ""
            }`
      }
      aria-hidden={forcePaused || undefined}
    >
      {/* Iframe YouTube sempre montato ma nascosto — solo audio. */}
      <div
        className="pointer-events-none absolute h-px w-px overflow-hidden opacity-0"
        aria-hidden
      >
        <div ref={hostRef} className="h-[180px] w-[320px]" />
      </div>

      <AnimatePresence mode="wait" initial={false}>
        {!isBoot && minimized ? (
          <motion.button
            key="pill"
            type="button"
            initial={{ opacity: 0, scale: 0.92, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 8 }}
            transition={{ duration: 0.2 }}
            onClick={() => setMinimized(false)}
            className="lf-sticky-yt__pill inline-flex items-center gap-2.5 rounded-full border border-white/12 bg-black/80 px-3.5 py-2.5 shadow-[0_12px_40px_rgba(0,0,0,0.45)] backdrop-blur-xl"
            aria-label="Apri player audio"
          >
            <span
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                playing ? "bg-accent/20 text-accent" : "bg-white/10 text-white"
              }`}
            >
              {playing ? (
                <span className="relative flex h-2 w-2">
                  <span className="absolute inset-0 animate-ping rounded-full bg-accent opacity-60" />
                  <span className="relative h-2 w-2 rounded-full bg-accent" />
                </span>
              ) : (
                <Play className="h-3.5 w-3.5 fill-current" strokeWidth={0} />
              )}
            </span>
            <span className="pr-1 text-left">
              <span className="block text-[10px] font-semibold uppercase tracking-[0.16em] text-white/50">
                Audio
              </span>
              <span className="block max-w-[9rem] truncate text-[13px] font-semibold text-white">
                {DOCK_TITLE}
              </span>
            </span>
          </motion.button>
        ) : (
          <motion.div
            key="dock"
            initial={{ opacity: 0, y: 12, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.96 }}
            transition={{ duration: 0.22 }}
            className="lf-sticky-yt__card flex w-full items-center gap-1.5 rounded-2xl border border-white/12 bg-black/80 px-2.5 py-2 shadow-[0_12px_40px_rgba(0,0,0,0.45)] backdrop-blur-xl"
          >
            {controls}
            {!isBoot && (
              <button
                type="button"
                onClick={() => setMinimized(true)}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white/70 transition hover:bg-white/10 hover:text-white"
                aria-label="Minimizza"
              >
                <Minimize2 className="h-3.5 w-3.5" strokeWidth={2} />
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
