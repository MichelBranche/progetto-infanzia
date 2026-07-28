import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  formatBanExpiry,
  type AccessBanInfo,
} from "../lib/accessBan";
import { loadYouTubeApi, type YtPlayer } from "../lib/youtubeIframeApi";

const BANNED_MEME_SRC = "/banned-meme.png";
/** https://www.youtube.com/watch?v=sSLOBBCB0tI */
const BANNED_YT_ID = "sSLOBBCB0tI";
const YT_VOLUME = 100;

interface BannedScreenProps {
  info: AccessBanInfo;
  onDismiss?: () => void;
}

export function BannedScreen({ info, onDismiss }: BannedScreenProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YtPlayer | null>(null);
  const mountId = useRef(
    `yt-banned-${Math.random().toString(36).slice(2)}`,
  );
  const [needTap, setNeedTap] = useState(false);

  const expiry = formatBanExpiry(info.expiresAt);
  const headline =
    info.kind === "ip" ? "RETE BANNATA" : "SEI STATO BANNATO";
  const sub =
    info.reason?.trim().toUpperCase() ||
    (info.kind === "ip"
      ? "QUESTA RETE NON PUÒ USARE BRANCHEFY"
      : "ACCOUNT SOSPESO DALL'AMMINISTRAZIONE");

  useEffect(() => {
    let cancelled = false;
    const id = mountId.current;

    void loadYouTubeApi().then((YT) => {
      if (cancelled || !hostRef.current) return;

      const mount = document.createElement("div");
      mount.id = id;
      mount.className = "h-full w-full";
      hostRef.current.innerHTML = "";
      hostRef.current.appendChild(mount);

      const tryPlayLoud = (target: YtPlayer) => {
        try {
          target.setVolume?.(YT_VOLUME);
          target.unMute?.();
          target.playVideo?.();
          setNeedTap(false);
        } catch {
          try {
            target.mute?.();
            target.playVideo?.();
            setNeedTap(true);
          } catch {
            setNeedTap(true);
          }
        }
      };

      const player = new YT.Player(id, {
        videoId: BANNED_YT_ID,
        width: "100%",
        height: "100%",
        playerVars: {
          autoplay: 1,
          controls: 0,
          disablekb: 1,
          fs: 0,
          modestbranding: 1,
          playsinline: 1,
          rel: 0,
          loop: 1,
          playlist: BANNED_YT_ID,
        },
        events: {
          onReady: (event) => {
            if (cancelled) return;
            playerRef.current = event.target;
            tryPlayLoud(event.target);
          },
          onStateChange: (event) => {
            // ‑1 unstarted, 0 ended, 1 playing, 2 paused, 3 buffering, 5 cued
            if (event.data === 0) {
              try {
                event.target.seekTo?.(0, true);
                event.target.playVideo?.();
              } catch {
                // ignore
              }
            }
          },
          onError: () => {
            if (!cancelled) setNeedTap(true);
          },
        },
      });

      playerRef.current = player;
    });

    return () => {
      cancelled = true;
      try {
        playerRef.current?.destroy?.();
      } catch {
        // ignore
      }
      playerRef.current = null;
    };
  }, []);

  const forceAudio = () => {
    const p = playerRef.current;
    if (!p) return;
    try {
      p.setVolume?.(YT_VOLUME);
      p.unMute?.();
      p.playVideo?.();
      setNeedTap(false);
    } catch {
      // ignore
    }
  };

  return (
    <div
      role="alertdialog"
      aria-label="Account bannato"
      className="admin-banned-screen fixed inset-0 z-[220] overflow-hidden bg-black"
      onClick={needTap ? forceAudio : undefined}
    >
      <img
        src={BANNED_MEME_SRC}
        alt=""
        className="absolute inset-0 h-full w-full object-cover"
        draggable={false}
      />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/55 via-transparent to-black/70" />

      {/* Player YT nascosto (solo audio) */}
      <div
        ref={hostRef}
        className="pointer-events-none absolute -left-[9999px] top-0 h-px w-px overflow-hidden opacity-0"
        aria-hidden
      />

      <motion.div
        initial={{ opacity: 0, scale: 0.92 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.35 }}
        className="absolute inset-0 z-[1] flex flex-col items-center justify-between px-4 py-[max(1.25rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))] text-center"
      >
        <p className="admin-banned-impact admin-banned-impact--top mt-2 max-w-[18ch] text-[clamp(2.4rem,10vw,5.5rem)] leading-[0.95]">
          {headline}
        </p>

        <div className="flex w-full max-w-xl flex-col items-center gap-3">
          <p className="admin-banned-impact max-w-[22ch] text-[clamp(1.35rem,5.5vw,2.75rem)] leading-[1.05]">
            {sub}
          </p>
          {expiry && (
            <p className="admin-banned-impact text-[clamp(0.95rem,3.2vw,1.35rem)] tracking-wide opacity-90">
              SCADE IL {expiry.toUpperCase()}
            </p>
          )}
          {needTap && (
            <p className="admin-banned-impact mt-1 animate-pulse text-[clamp(0.85rem,2.8vw,1.1rem)] text-yellow-300">
              TOCCA PER L&apos;AUDIO
            </p>
          )}
        </div>

        {onDismiss ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDismiss();
            }}
            className="pointer-events-auto admin-banned-impact rounded-sm border-2 border-white bg-black/50 px-6 py-3 text-[clamp(0.9rem,2.8vw,1.15rem)] tracking-wider text-white transition-colors hover:bg-black/70"
          >
            CHIUDI
          </button>
        ) : (
          <span className="h-12" />
        )}
      </motion.div>
    </div>
  );
}
