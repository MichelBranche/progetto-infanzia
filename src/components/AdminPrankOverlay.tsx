import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, Skull } from "lucide-react";
import { useAdminPrank } from "../hooks/useAdminPrank";
import {
  openIdiotPrankWindows,
} from "../lib/idiotPrankWindows";
import {
  IDIOT_VIDEO_SRC,
  resolveJumpscareVideoSrc,
  type AdminPrank,
} from "../types/adminPrank";

function applyBodyClass(className: string, ms: number) {
  document.documentElement.classList.add(className);
  window.setTimeout(() => {
    document.documentElement.classList.remove(className);
  }, ms);
}

function IdiotVirusOverlay({ onDone }: { onDone: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const doneRef = useRef(false);
  const closeWindowsRef = useRef<(() => void) | null>(null);

  const finish = () => {
    if (doneRef.current) return;
    doneRef.current = true;
    closeWindowsRef.current?.();
    closeWindowsRef.current = null;
    onDone();
  };

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const { sync, closeAll } = await openIdiotPrankWindows();
        if (cancelled) {
          closeAll();
          return;
        }
        closeWindowsRef.current = closeAll;

        const video = videoRef.current;
        if (video) {
          video.loop = true;
          video.muted = false;
          video.volume = 1;
          const wait = Math.max(0, sync.startAt - Date.now());
          window.setTimeout(() => {
            if (cancelled || doneRef.current) return;
            try {
              video.currentTime = 0;
            } catch {
              // ignore
            }
            const play = video.play();
            if (play && typeof play.catch === "function") {
              play.catch(() => {
                video.muted = true;
                void video.play().then(() => {
                  video.muted = false;
                });
              });
            }
          }, wait);
        }

        window.setTimeout(finish, Math.max(0, sync.endAt - Date.now()));
      } catch (err) {
        console.warn("[idiot-prank] open windows failed", err);
        // Fallback: solo overlay principale
        window.setTimeout(finish, 20_000);
        const video = videoRef.current;
        if (video) {
          video.loop = true;
          void video.play().catch(() => {
            video.muted = true;
            void video.play();
          });
        }
      }
    })();

    return () => {
      cancelled = true;
      closeWindowsRef.current?.();
      closeWindowsRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <motion.div
      role="alertdialog"
      aria-label="You are an idiot"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[140] overflow-hidden bg-black"
    >
      <video
        ref={videoRef}
        src={IDIOT_VIDEO_SRC}
        className="absolute inset-0 h-full w-full object-contain bg-black"
        playsInline
        preload="auto"
        onError={finish}
      />
    </motion.div>
  );
}

function JumpscareOverlay({
  prank,
  onDone,
}: {
  prank: AdminPrank;
  onDone: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [src] = useState(() => resolveJumpscareVideoSrc(prank.message));
  const doneRef = useRef(false);

  const finish = () => {
    if (doneRef.current) return;
    doneRef.current = true;
    onDone();
  };

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    video.muted = false;
    video.volume = 1;
    const play = video.play();
    if (play && typeof play.catch === "function") {
      play.catch(() => {
        video.muted = true;
        void video.play().then(() => {
          video.muted = false;
        });
      });
    }

    const safety = window.setTimeout(finish, 45_000);
    return () => window.clearTimeout(safety);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src]);

  return (
    <motion.div
      role="alertdialog"
      aria-label="Jumpscare"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[140] overflow-hidden bg-black"
    >
      <video
        ref={videoRef}
        src={src}
        className="absolute inset-0 h-full w-full object-cover"
        playsInline
        autoPlay
        preload="auto"
        onEnded={finish}
        onError={finish}
      />
    </motion.div>
  );
}

function FakeBanOverlay({
  prank,
  onDone,
}: {
  prank: AdminPrank;
  onDone: () => void;
}) {
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    const id = window.setTimeout(() => setRevealed(true), 3200);
    return () => window.clearTimeout(id);
  }, [prank.id]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[140] flex items-center justify-center bg-black/80 p-4 backdrop-blur-md"
    >
      <motion.div
        initial={{ y: 24, scale: 0.96 }}
        animate={{ y: 0, scale: 1 }}
        className="relative w-full max-w-md overflow-hidden rounded-2xl border border-warm/30 bg-[#120a0a] shadow-[0_32px_80px_rgba(0,0,0,0.7)]"
      >
        <div className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-warm/25 to-transparent" />
        <div className="relative px-6 py-7 sm:px-7">
          <div className="flex items-start gap-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-warm/30 bg-warm/10 text-warm">
              {revealed ? <Skull className="h-5 w-5" /> : <AlertTriangle className="h-5 w-5" />}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-warm">
                {revealed ? "Amministrazione Branchefy" : "Sicurezza account"}
              </p>
              <h2 className="font-display mt-2 text-[1.55rem] font-semibold tracking-[-0.03em] text-text-primary">
                {revealed ? "Scherzo riuscito." : "Account sospeso"}
              </h2>
              <p className="mt-3 text-[13px] leading-relaxed text-text-secondary">
                {revealed
                  ? prank.message?.trim() ||
                    "Tranquillo: non è successo niente. Era solo uno scherzo dell’amministrazione."
                  : "Il tuo account è stato sospeso per violazione dei termini di servizio. Contatta il supporto per ulteriori informazioni."}
              </p>
            </div>
          </div>
        </div>
        {revealed && (
          <div className="relative border-t border-white/[0.06] bg-black/30 px-6 py-4 sm:px-7">
            <button
              type="button"
              onClick={onDone}
              className="inline-flex w-full items-center justify-center rounded-full border border-white/10 px-5 py-3 text-[13px] font-semibold text-text-primary transition-colors hover:border-white/20 hover:bg-white/[0.04]"
            >
              Ok, mi hai fregato
            </button>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}

function TransientEffect({
  prank,
  onDone,
}: {
  prank: AdminPrank;
  onDone: () => void;
}) {
  useEffect(() => {
    const ms = prank.kind === "shake" ? 2200 : 3500;
    if (prank.kind === "shake") applyBodyClass("admin-prank-shake", ms);
    if (prank.kind === "invert") applyBodyClass("admin-prank-invert", ms);
    const id = window.setTimeout(onDone, ms + 50);
    return () => {
      window.clearTimeout(id);
      document.documentElement.classList.remove(
        "admin-prank-shake",
        "admin-prank-invert",
      );
    };
  }, [onDone, prank.id, prank.kind]);

  return null;
}

export function AdminPrankOverlay() {
  const { active, dismiss } = useAdminPrank();

  return (
    <AnimatePresence mode="wait">
      {active?.kind === "jumpscare" && (
        <JumpscareOverlay key={active.id} prank={active} onDone={dismiss} />
      )}
      {active?.kind === "fake_ban" && (
        <FakeBanOverlay key={active.id} prank={active} onDone={dismiss} />
      )}
      {active?.kind === "idiot" && (
        <IdiotVirusOverlay key={active.id} onDone={dismiss} />
      )}
      {(active?.kind === "shake" || active?.kind === "invert") && (
        <TransientEffect key={active.id} prank={active} onDone={dismiss} />
      )}
    </AnimatePresence>
  );
}
