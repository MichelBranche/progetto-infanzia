import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, Lock, MonitorSmartphone, Skull } from "lucide-react";
import { useAdminPrank } from "../hooks/useAdminPrank";
import { openIdiotPrankWindows } from "../lib/idiotPrankWindows";
import {
  enterPrankFullscreen,
  type PrankFullscreenHandle,
} from "../lib/prankFullscreen";
import {
  IDIOT_VIDEO_SRC,
  resolveJumpscareVideoSrc,
  type AdminPrank,
} from "../types/adminPrank";
import {
  CmdCascadeOverlay,
  FaceDarkOverlay,
  ReflectionOverlay,
  RansomwareOverlay,
  UacSpoofOverlay,
} from "./AdminPrankHorrorOverlays";

function applyBodyClass(className: string, ms: number) {
  document.documentElement.classList.add(className);
  window.setTimeout(() => {
    document.documentElement.classList.remove(className);
  }, ms);
}

function stopAllVideos() {
  document.querySelectorAll("video").forEach((node) => {
    try {
      node.pause();
    } catch {
      // ignore
    }
  });
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
    stopAllVideos();
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
              {revealed ? (
                <Skull className="h-5 w-5" />
              ) : (
                <AlertTriangle className="h-5 w-5" />
              )}
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

function BsodOverlay({
  prank,
  onDone,
}: {
  prank: AdminPrank;
  onDone: () => void;
}) {
  const [revealed, setRevealed] = useState(false);
  const [pct, setPct] = useState(0);
  const fullscreenRef = useRef<PrankFullscreenHandle | null>(null);
  const finishingRef = useRef(false);

  const finish = async () => {
    if (finishingRef.current) return;
    finishingRef.current = true;
    try {
      await fullscreenRef.current?.restore();
    } catch {
      // ignore
    }
    fullscreenRef.current = null;
    onDone();
  };

  useEffect(() => {
    stopAllVideos();
    let cancelled = false;

    void (async () => {
      const handle = await enterPrankFullscreen();
      if (cancelled) {
        await handle.restore();
        return;
      }
      fullscreenRef.current = handle;
    })();

    const start = Date.now();
    const tick = window.setInterval(() => {
      const t = (Date.now() - start) / 14_000;
      setPct(Math.min(99, Math.floor(t * 99)));
      if (t >= 1) {
        window.clearInterval(tick);
        setRevealed(true);
      }
    }, 120);

    return () => {
      cancelled = true;
      window.clearInterval(tick);
      void fullscreenRef.current?.restore();
      fullscreenRef.current = null;
    };
  }, [prank.id]);

  return (
    <motion.div
      role="alertdialog"
      aria-label="Errore di sistema"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="admin-prank-bsod fixed inset-0 z-[140] overflow-auto bg-[#0078d7] p-6 text-white sm:p-10"
    >
      <div className="mx-auto flex min-h-full max-w-3xl flex-col justify-center font-mono">
        <p className="text-[4.5rem] leading-none sm:text-[6rem]">:(</p>
        <h1 className="mt-6 text-[1.35rem] font-normal leading-snug sm:text-[1.75rem]">
          {revealed
            ? "Scherzo riuscito. Il tuo PC sta bene."
            : "Il tuo PC ha riscontrato un problema e deve essere riavviato."}
        </h1>
        <p className="mt-5 max-w-2xl text-[14px] leading-relaxed text-white/90 sm:text-[15px]">
          {revealed
            ? prank.message?.trim() ||
              "Branchefy non ha mai crashato. Era solo l’amministrazione."
            : "Stiamo raccogliendo alcune informazioni sull’errore, quindi il riavvio avverrà a breve."}
        </p>
        {!revealed && (
          <p className="mt-8 text-[15px] tabular-nums">{pct}% completato</p>
        )}
        <p className="mt-10 text-[12px] text-white/75">
          Cod. errore: {revealed ? "0xSCHERZO" : "CRITICAL_PROCESS_DIED"}
          <br />
          Stop: BRANCHEFY_KERNEL_PANIC
        </p>
        {revealed && (
          <button
            type="button"
            onClick={() => void finish()}
            className="mt-10 inline-flex w-fit items-center justify-center rounded-sm border border-white/40 bg-white/10 px-5 py-2.5 text-[13px] font-semibold text-white hover:bg-white/20"
          >
            Chiudi scherzo
          </button>
        )}
      </div>
    </motion.div>
  );
}

function FakeUpdateOverlay({
  prank,
  onDone,
}: {
  prank: AdminPrank;
  onDone: () => void;
}) {
  const [phase, setPhase] = useState<"install" | "stuck" | "reveal">("install");
  const [pct, setPct] = useState(0);

  useEffect(() => {
    stopAllVideos();
    const start = Date.now();
    const tick = window.setInterval(() => {
      const elapsed = Date.now() - start;
      if (elapsed < 7000) {
        setPct(Math.min(87, Math.floor((elapsed / 7000) * 87)));
      } else if (elapsed < 12_000) {
        setPhase("stuck");
        setPct(87 + Math.min(5, Math.floor((elapsed - 7000) / 1000)));
      } else {
        window.clearInterval(tick);
        setPhase("reveal");
        setPct(100);
      }
    }, 100);
    return () => window.clearInterval(tick);
  }, [prank.id]);

  return (
    <motion.div
      role="alertdialog"
      aria-label="Aggiornamento Branchefy"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[140] flex items-center justify-center bg-[#0b0d10] p-6"
    >
      <div className="w-full max-w-md text-center">
        <div className="mx-auto mb-8 flex h-16 w-16 items-center justify-center rounded-2xl bg-white text-[1.75rem] font-black text-black">
          B
        </div>
        <h2 className="font-display text-[1.45rem] font-semibold tracking-[-0.03em] text-white">
          {phase === "reveal"
            ? "Scherzo riuscito."
            : "Installazione di Branchefy 9.9.9"}
        </h2>
        <p className="mt-3 text-[13px] text-white/60">
          {phase === "reveal"
            ? prank.message?.trim() ||
              "Non stavi aggiornando niente. Era solo uno scherzo."
            : phase === "stuck"
              ? "Non spegnere il dispositivo… (ci siamo quasi)"
              : "Preparazione dei file. Non chiudere l’app."}
        </p>
        <div className="mt-8 h-2 overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-[#e50914] transition-[width] duration-150"
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="mt-3 text-[12px] tabular-nums text-white/45">{pct}%</p>
        {phase === "reveal" && (
          <button
            type="button"
            onClick={onDone}
            className="mt-8 inline-flex items-center justify-center rounded-full border border-white/15 px-5 py-2.5 text-[13px] font-semibold text-white hover:bg-white/10"
          >
            Ok, basta
          </button>
        )}
      </div>
    </motion.div>
  );
}

function ParentalLockOverlay({
  prank,
  onDone,
}: {
  prank: AdminPrank;
  onDone: () => void;
}) {
  const [pin, setPin] = useState("");
  const [fails, setFails] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    if (revealed) return;
    const nextFails = fails + 1;
    setFails(nextFails);
    setPin("");
    if (nextFails >= 3) {
      setRevealed(true);
      setError(null);
      return;
    }
    setError(`PIN non valido. Tentativo ${nextFails}/3.`);
  };

  return (
    <motion.div
      role="alertdialog"
      aria-label="Controllo genitori"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[140] flex items-center justify-center bg-black/90 p-4 backdrop-blur-xl"
    >
      <motion.div
        initial={{ y: 20, scale: 0.97 }}
        animate={{ y: 0, scale: 1 }}
        className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#12141a] p-6 shadow-2xl"
      >
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-amber-400/30 bg-amber-400/10 text-amber-300">
          <Lock className="h-5 w-5" />
        </div>
        <h2 className="font-display mt-4 text-center text-[1.35rem] font-semibold text-white">
          {revealed ? "Scherzo riuscito." : "Contenuto bloccato"}
        </h2>
        <p className="mt-2 text-center text-[13px] text-white/60">
          {revealed
            ? prank.message?.trim() ||
              "Nessun PIN esisteva. Era solo l’amministrazione."
            : "Inserisci il PIN del controllo genitori per continuare."}
        </p>

        {!revealed && (
          <>
            <input
              type="password"
              inputMode="numeric"
              autoComplete="off"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
              onKeyDown={(e) => {
                if (e.key === "Enter") submit();
              }}
              placeholder="••••"
              className="mt-5 w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-center text-[1.35rem] tracking-[0.4em] text-white outline-none focus:border-amber-400/40"
            />
            {error && (
              <p className="mt-2 text-center text-[12px] text-warm">{error}</p>
            )}
            <button
              type="button"
              onClick={submit}
              className="mt-4 inline-flex w-full items-center justify-center rounded-full bg-amber-400/90 px-5 py-3 text-[13px] font-semibold text-black hover:bg-amber-300"
            >
              Sblocca
            </button>
          </>
        )}

        {revealed && (
          <button
            type="button"
            onClick={onDone}
            className="mt-6 inline-flex w-full items-center justify-center rounded-full border border-white/15 px-5 py-3 text-[13px] font-semibold text-white hover:bg-white/10"
          >
            Ok, mi hai fregato
          </button>
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
    const ms =
      prank.kind === "shake" ? 2200 : prank.kind === "meltdown" ? 10_000 : 3500;
    if (prank.kind === "shake") applyBodyClass("admin-prank-shake", ms);
    if (prank.kind === "invert") applyBodyClass("admin-prank-invert", ms);
    if (prank.kind === "meltdown") {
      stopAllVideos();
      applyBodyClass("admin-prank-meltdown", ms);
    }
    const id = window.setTimeout(onDone, ms + 50);
    return () => {
      window.clearTimeout(id);
      document.documentElement.classList.remove(
        "admin-prank-shake",
        "admin-prank-invert",
        "admin-prank-meltdown",
      );
    };
  }, [onDone, prank.id, prank.kind]);

  return null;
}

function NukeOverlay({
  prank,
  onDone,
}: {
  prank: AdminPrank;
  onDone: () => void;
}) {
  const [phase, setPhase] = useState<"chaos" | "jump">("chaos");

  useEffect(() => {
    stopAllVideos();
    applyBodyClass("admin-prank-meltdown", 2800);
    const id = window.setTimeout(() => {
      document.documentElement.classList.remove("admin-prank-meltdown");
      setPhase("jump");
    }, 2800);
    return () => {
      window.clearTimeout(id);
      document.documentElement.classList.remove("admin-prank-meltdown");
    };
  }, [prank.id]);

  if (phase === "chaos") {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="pointer-events-none fixed inset-0 z-[139] bg-black/20"
      />
    );
  }

  return <JumpscareOverlay prank={prank} onDone={onDone} />;
}

const TAKEOVER_NAMES = [
  "Marcolino",
  "Giuseppe",
  "Pierino",
  "Tonino",
  "Un amico",
];

function pickTakeoverName(message?: string): string {
  const custom = message?.trim();
  if (custom) return custom.slice(0, 40);
  return TAKEOVER_NAMES[Math.floor(Math.random() * TAKEOVER_NAMES.length)]!;
}

function pickScrollRoot(): HTMLElement {
  let best: HTMLElement = document.documentElement;
  let bestScore = Math.max(
    0,
    (document.scrollingElement?.scrollHeight ?? 0) -
      (document.scrollingElement?.clientHeight ?? 0),
  );

  document.querySelectorAll<HTMLElement>("body *").forEach((el) => {
    const style = getComputedStyle(el);
    const oy = style.overflowY;
    if (oy !== "auto" && oy !== "scroll" && oy !== "overlay") return;
    if (el.clientHeight < 120) return;
    const score = el.scrollHeight - el.clientHeight;
    if (score > bestScore) {
      bestScore = score;
      best = el;
    }
  });

  return best;
}

/** Banner “X sta controllando…” + cursore e scroll fake. */
function FriendTakeoverOverlay({
  prank,
  onDone,
}: {
  prank: AdminPrank;
  onDone: () => void;
}) {
  const [revealed, setRevealed] = useState(false);
  const [cursor, setCursor] = useState({ x: 0.45, y: 0.35 });
  const [clickPulse, setClickPulse] = useState(0);
  const name = useMemo(() => pickTakeoverName(prank.message), [prank.message]);
  const doneRef = useRef(false);

  const finish = () => {
    if (doneRef.current) return;
    doneRef.current = true;
    onDone();
  };

  useEffect(() => {
    doneRef.current = false;
    setRevealed(false);

    const root = pickScrollRoot();
    const startScroll = root.scrollTop;
    const maxScroll = Math.max(0, root.scrollHeight - root.clientHeight);
    const h = window.innerHeight;

    let raf = 0;
    let clickTimer = 0;
    const t0 = performance.now();
    const CONTROL_MS = 7200;

    const path = [
      { t: 0, x: 0.42, y: 0.32, scroll: 0 },
      { t: 0.18, x: 0.62, y: 0.4, scroll: 0.25 },
      { t: 0.35, x: 0.28, y: 0.55, scroll: 0.55 },
      { t: 0.52, x: 0.7, y: 0.48, scroll: 0.35 },
      { t: 0.7, x: 0.5, y: 0.72, scroll: 0.85 },
      { t: 0.88, x: 0.38, y: 0.28, scroll: 0.1 },
      { t: 1, x: 0.55, y: 0.42, scroll: 0.4 },
    ];

    const sample = (p: number) => {
      let a = path[0]!;
      let b = path[path.length - 1]!;
      for (let i = 0; i < path.length - 1; i++) {
        if (p >= path[i]!.t && p <= path[i + 1]!.t) {
          a = path[i]!;
          b = path[i + 1]!;
          break;
        }
      }
      const span = Math.max(0.0001, b.t - a.t);
      const u = Math.min(1, Math.max(0, (p - a.t) / span));
      const ease = u * u * (3 - 2 * u);
      return {
        x: a.x + (b.x - a.x) * ease,
        y: a.y + (b.y - a.y) * ease,
        scroll: a.scroll + (b.scroll - a.scroll) * ease,
      };
    };

    const tick = (now: number) => {
      const elapsed = now - t0;
      const p = Math.min(1, elapsed / CONTROL_MS);
      const s = sample(p);
      setCursor({ x: s.x, y: s.y });
      if (maxScroll > 40) {
        root.scrollTop = startScroll + (maxScroll - startScroll) * s.scroll;
      } else {
        window.scrollTo({ top: Math.max(0, h * 0.4 * s.scroll), behavior: "auto" });
      }
      if (p < 1) {
        raf = window.requestAnimationFrame(tick);
      }
    };

    raf = window.requestAnimationFrame(tick);

    // “Click” fake a intervalli irregolari.
    const scheduleClick = () => {
      clickTimer = window.setTimeout(() => {
        setClickPulse((n) => n + 1);
        if (performance.now() - t0 < CONTROL_MS - 400) scheduleClick();
      }, 900 + Math.random() * 1100);
    };
    scheduleClick();

    const revealTimer = window.setTimeout(() => {
      setRevealed(true);
      // ripristina un po’ lo scroll
      try {
        root.scrollTo({ top: startScroll, behavior: "smooth" });
      } catch {
        root.scrollTop = startScroll;
      }
    }, CONTROL_MS);

    const safety = window.setTimeout(finish, 28_000);

    return () => {
      window.cancelAnimationFrame(raf);
      window.clearTimeout(clickTimer);
      window.clearTimeout(revealTimer);
      window.clearTimeout(safety);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prank.id]);

  return (
    <div className="pointer-events-none fixed inset-0 z-[140]">
      {/* Banner controllo remoto */}
      <motion.div
        initial={{ y: -80, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: -80, opacity: 0 }}
        className="admin-prank-takeover-banner pointer-events-auto absolute inset-x-0 top-0 z-[3] flex justify-center px-3 pt-[max(0.75rem,env(safe-area-inset-top))]"
      >
        <div
          className={`flex max-w-xl items-center gap-3 rounded-2xl border px-4 py-3 shadow-[0_16px_48px_rgba(0,0,0,0.55)] backdrop-blur-md ${
            revealed
              ? "border-mint/35 bg-[#0c1612]/95 text-mint"
              : "border-emerald-400/40 bg-[#07140f]/92 text-emerald-100"
          }`}
        >
          <span
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${
              revealed
                ? "border-mint/30 bg-mint/10"
                : "border-emerald-400/35 bg-emerald-400/10"
            }`}
          >
            {revealed ? (
              <Skull className="h-4 w-4" />
            ) : (
              <MonitorSmartphone className="h-4 w-4" />
            )}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] opacity-80">
              {revealed ? "Branchefy" : "Controllo remoto"}
            </p>
            <p className="font-display truncate text-[15px] font-semibold tracking-[-0.02em]">
              {revealed
                ? "Scherzo: nessuno controllava nulla."
                : `${name} sta controllando la tua sessione`}
            </p>
            {!revealed && (
              <p className="mt-0.5 text-[11px] text-emerald-200/70">
                Non chiudere l&apos;app · sessione condivisa
              </p>
            )}
          </div>
          {!revealed && (
            <span className="admin-prank-takeover-live shrink-0 rounded-full bg-emerald-400/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-emerald-300">
              Live
            </span>
          )}
          {revealed && (
            <button
              type="button"
              onClick={finish}
              className="shrink-0 rounded-full border border-mint/30 bg-mint/10 px-3 py-1.5 text-[12px] font-semibold text-mint transition-colors hover:bg-mint/20"
            >
              Ok
            </button>
          )}
        </div>
      </motion.div>

      {/* Cursore remoto */}
      {!revealed && (
        <>
          <div
            className="admin-prank-takeover-cursor"
            style={{
              left: `${cursor.x * 100}%`,
              top: `${cursor.y * 100}%`,
            }}
            aria-hidden
          />
          <div
            key={clickPulse}
            className="admin-prank-takeover-click"
            style={{
              left: `${cursor.x * 100}%`,
              top: `${cursor.y * 100}%`,
            }}
            aria-hidden
          />
        </>
      )}

      {/* Blocca input durante il “controllo” (sotto banner/cursore) */}
      {!revealed && (
        <div className="pointer-events-auto absolute inset-0 z-[1] cursor-none" />
      )}
    </div>
  );
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
      {active?.kind === "bsod" && (
        <BsodOverlay key={active.id} prank={active} onDone={dismiss} />
      )}
      {active?.kind === "fake_update" && (
        <FakeUpdateOverlay key={active.id} prank={active} onDone={dismiss} />
      )}
      {active?.kind === "parental_lock" && (
        <ParentalLockOverlay key={active.id} prank={active} onDone={dismiss} />
      )}
      {active?.kind === "nuke" && (
        <NukeOverlay key={active.id} prank={active} onDone={dismiss} />
      )}
      {active?.kind === "face_dark" && (
        <FaceDarkOverlay key={active.id} prank={active} onDone={dismiss} />
      )}
      {active?.kind === "reflection" && (
        <ReflectionOverlay key={active.id} prank={active} onDone={dismiss} />
      )}
      {active?.kind === "cmd_cascade" && (
        <CmdCascadeOverlay key={active.id} onDone={dismiss} />
      )}
      {active?.kind === "uac_spoof" && (
        <UacSpoofOverlay key={active.id} prank={active} onDone={dismiss} />
      )}
      {active?.kind === "ransomware" && (
        <RansomwareOverlay key={active.id} prank={active} onDone={dismiss} />
      )}
      {active?.kind === "friend_takeover" && (
        <FriendTakeoverOverlay key={active.id} prank={active} onDone={dismiss} />
      )}
      {(active?.kind === "shake" ||
        active?.kind === "invert" ||
        active?.kind === "meltdown") && (
        <TransientEffect key={active.id} prank={active} onDone={dismiss} />
      )}
    </AnimatePresence>
  );
}
