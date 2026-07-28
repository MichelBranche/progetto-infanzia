import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { motion } from "framer-motion";
import { Shield } from "lucide-react";
import {
  resolveJumpscareVideoSrc,
  type AdminPrank,
} from "../types/adminPrank";

function stopAllVideos() {
  document.querySelectorAll("video").forEach((node) => {
    try {
      node.pause();
    } catch {
      // ignore
    }
  });
}

function playScream(
  src: string,
  videoRef: RefObject<HTMLVideoElement | null>,
) {
  const video = videoRef.current;
  if (!video) return;
  video.src = src;
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
}

/** Fade lento → occhi → scream (jumpscare audio/video). */
export function FaceDarkOverlay({
  prank,
  onDone,
}: {
  prank: AdminPrank;
  onDone: () => void;
}) {
  const [phase, setPhase] = useState<"fade" | "eyes" | "scream">("fade");
  const videoRef = useRef<HTMLVideoElement>(null);
  const screamSrc = useMemo(
    () => resolveJumpscareVideoSrc(prank.message),
    [prank.message],
  );
  const doneRef = useRef(false);

  const finish = () => {
    if (doneRef.current) return;
    doneRef.current = true;
    onDone();
  };

  // Timeline fasi. Il <video> resta sempre montato (nascosto) così al scream il ref esiste.
  useEffect(() => {
    doneRef.current = false;
    setPhase("fade");

    // Non mettere in pausa il nostro video di preload.
    document.querySelectorAll("video").forEach((node) => {
      if (node === videoRef.current) return;
      try {
        node.pause();
      } catch {
        // ignore
      }
    });

    const tEyes = window.setTimeout(() => setPhase("eyes"), 3200);
    const tScream = window.setTimeout(() => setPhase("scream"), 5200);
    const safety = window.setTimeout(finish, 45_000);

    return () => {
      window.clearTimeout(tEyes);
      window.clearTimeout(tScream);
      window.clearTimeout(safety);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prank.id]);

  // Play solo dopo il commit della fase scream (mai nello stesso tick di setPhase).
  useEffect(() => {
    if (phase !== "scream") return;

    let cancelled = false;
    let raf = 0;
    let attempts = 0;
    let videoEl: HTMLVideoElement | null = null;

    const onReady = () => {
      if (!videoEl || cancelled) return;
      videoEl.removeEventListener("canplay", onReady);
      start(videoEl);
    };
    const onError = () => {
      if (videoEl) videoEl.removeEventListener("error", onError);
      finish();
    };

    const start = (video: HTMLVideoElement) => {
      if (cancelled || doneRef.current) return;
      try {
        video.currentTime = 0;
      } catch {
        // ignore
      }
      video.muted = false;
      video.volume = 1;
      const play = video.play();
      if (play && typeof play.catch === "function") {
        play.catch(() => {
          if (cancelled) return;
          video.muted = true;
          void video.play().then(() => {
            video.muted = false;
          });
        });
      }
    };

    const attachAndPlay = (video: HTMLVideoElement) => {
      videoEl = video;
      video.addEventListener("error", onError);
      if (video.readyState >= 2) {
        start(video);
        return;
      }
      video.addEventListener("canplay", onReady);
      // Alcuni browser non bufferizzano media opacity-0: forza il load al scream.
      video.load();
    };

    const tryPlay = () => {
      if (cancelled || doneRef.current) return;
      const video = videoRef.current;
      if (!video) {
        attempts += 1;
        if (attempts > 30) {
          finish();
          return;
        }
        raf = window.requestAnimationFrame(tryPlay);
        return;
      }
      attachAndPlay(video);
    };

    tryPlay();

    return () => {
      cancelled = true;
      if (raf) window.cancelAnimationFrame(raf);
      if (videoEl) {
        videoEl.removeEventListener("canplay", onReady);
        videoEl.removeEventListener("error", onError);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  return (
    <motion.div
      role="alertdialog"
      aria-label="Face in the dark"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.35 }}
      className="admin-prank-face-dark fixed inset-0 z-[140] overflow-hidden bg-black"
    >
      {phase !== "scream" && (
        <motion.div
          className="absolute inset-0 z-[1] bg-black"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 3.2, ease: "easeIn" }}
        />
      )}

      {phase === "eyes" && (
        <div className="absolute inset-0 z-[2] flex items-center justify-center gap-16 sm:gap-24">
          <span className="admin-prank-eye" />
          <span className="admin-prank-eye" />
        </div>
      )}

      {/* Sempre montato (nascosto) → preload durante fade/occhi */}
      <video
        ref={videoRef}
        src={screamSrc}
        className={`absolute inset-0 z-[3] h-full w-full object-cover ${
          phase === "scream" ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        playsInline
        preload="auto"
        autoPlay={phase === "scream"}
        onEnded={finish}
        onError={() => {
          if (phase === "scream") finish();
        }}
      />
    </motion.div>
  );
}

/** Specchio nero “ti vedo” ~2s. */
export function ReflectionOverlay({
  prank,
  onDone,
}: {
  prank: AdminPrank;
  onDone: () => void;
}) {
  useEffect(() => {
    stopAllVideos();
    const id = window.setTimeout(onDone, 2200);
    return () => window.clearTimeout(id);
  }, [onDone, prank.id]);

  const text = prank.message?.trim() || "ti vedo";

  return (
    <motion.div
      role="alertdialog"
      aria-label="Reflection"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="admin-prank-reflection fixed inset-0 z-[140] flex items-center justify-center"
    >
      <p className="admin-prank-reflection__text">{text}</p>
    </motion.div>
  );
}

type CmdWin = { id: number; left: string; top: string; z: number };

/** Cascade di finestre CMD fake. */
export function CmdCascadeOverlay({ onDone }: { onDone: () => void }) {
  const [wins, setWins] = useState<CmdWin[]>([]);
  const [lines, setLines] = useState<string[]>([]);
  const user =
    typeof navigator !== "undefined"
      ? (navigator.userAgent.includes("Windows") ? "User" : "user")
      : "User";

  useEffect(() => {
    stopAllVideos();
    const slots = [
      { left: "6%", top: "8%" },
      { left: "28%", top: "18%" },
      { left: "52%", top: "10%" },
      { left: "14%", top: "42%" },
      { left: "40%", top: "48%" },
      { left: "62%", top: "38%" },
      { left: "22%", top: "62%" },
      { left: "48%", top: "66%" },
    ];
    const spawned: CmdWin[] = [];
    slots.forEach((slot, i) => {
      window.setTimeout(() => {
        spawned.push({ id: i, left: slot.left, top: slot.top, z: 140 + i });
        setWins([...spawned]);
      }, i * 280);
    });

    const paths = [
      `C:\\Users\\${user}\\Documents\\Branchefy\\profiles.db`,
      `C:\\Users\\${user}\\AppData\\Roaming\\Branchefy\\watch.db`,
      `C:\\Users\\${user}\\Videos\\*`,
      `C:\\Users\\${user}\\Desktop\\*`,
      `C:\\Users\\${user}\\Downloads\\*`,
      `C:\\Windows\\System32\\config\\*`,
    ];
    let n = 0;
    const tick = window.setInterval(() => {
      const path = paths[n % paths.length];
      setLines((prev) =>
        [`deleting ${path} ... OK`, ...prev].slice(0, 40),
      );
      n += 1;
    }, 90);

    const end = window.setTimeout(() => {
      window.clearInterval(tick);
      onDone();
    }, 9000);

    return () => {
      window.clearInterval(tick);
      window.clearTimeout(end);
    };
  }, [onDone, user]);

  return (
    <motion.div
      role="alertdialog"
      aria-label="CMD cascade"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[140] bg-black/55"
    >
      {wins.map((w) => (
        <div
          key={w.id}
          className="admin-prank-cmd"
          style={{ left: w.left, top: w.top, zIndex: w.z }}
        >
          <div className="admin-prank-cmd__title">
            Amministratore: C:\Windows\System32\cmd.exe
          </div>
          <div className="admin-prank-cmd__body">
            <p>Microsoft Windows [Version 10.0.19045.3693]</p>
            <p>(c) Microsoft Corporation. Tutti i diritti riservati.</p>
            <p className="mt-2">C:\Windows\System32&gt; del /f /s /q C:\Users\{user}\*</p>
            {lines.slice(0, 12).map((line, i) => (
              <p key={`${w.id}-${i}`}>{line}</p>
            ))}
            <p className="admin-prank-cmd__cursor">_</p>
          </div>
        </div>
      ))}
    </motion.div>
  );
}

/** Dialogo UAC fake → jumpscare. */
export function UacSpoofOverlay({
  prank,
  onDone,
}: {
  prank: AdminPrank;
  onDone: () => void;
}) {
  const [phase, setPhase] = useState<"uac" | "jump">("uac");
  const videoRef = useRef<HTMLVideoElement>(null);
  const src = useMemo(
    () => resolveJumpscareVideoSrc(prank.message),
    [prank.message],
  );
  const doneRef = useRef(false);

  const finish = () => {
    if (doneRef.current) return;
    doneRef.current = true;
    onDone();
  };

  useEffect(() => {
    stopAllVideos();
  }, []);

  useEffect(() => {
    if (phase !== "jump") return;
    playScream(src, videoRef);
    const safety = window.setTimeout(finish, 45_000);
    return () => window.clearTimeout(safety);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, src]);

  if (phase === "jump") {
    return (
      <motion.div
        role="alertdialog"
        aria-label="Jumpscare"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="fixed inset-0 z-[140] overflow-hidden bg-black"
      >
        <video
          ref={videoRef}
          src={src}
          className="absolute inset-0 h-full w-full object-cover"
          playsInline
          preload="auto"
          onEnded={finish}
          onError={finish}
        />
      </motion.div>
    );
  }

  return (
    <motion.div
      role="alertdialog"
      aria-label="Controllo dell'account utente"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[140] flex items-center justify-center bg-[#0a2040]/88 p-4"
    >
      <div className="admin-prank-uac w-full max-w-[420px] overflow-hidden rounded-sm shadow-2xl">
        <div className="admin-prank-uac__bar">
          Controllo dell&apos;account utente
        </div>
        <div className="bg-white px-5 py-4 text-[#1a1a1a]">
          <div className="flex gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-[#0078d4] text-white">
              <Shield className="h-5 w-5" />
            </span>
            <div>
              <p className="text-[15px] font-semibold">
                Vuoi consentire a questa app di apportare modifiche al
                dispositivo?
              </p>
              <p className="mt-2 text-[13px] text-[#333]">
                Branchefy Desktop
              </p>
              <p className="mt-1 text-[12px] text-[#666]">
                Publisher verificato: Branchefy Admin
              </p>
            </div>
          </div>
          <div className="mt-5 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setPhase("jump")}
              className="min-w-[88px] rounded-sm border border-[#adadad] bg-[#e1e1e1] px-4 py-1.5 text-[13px] hover:bg-[#d4d4d4]"
            >
              Sì
            </button>
            <button
              type="button"
              onClick={() => setPhase("jump")}
              className="min-w-[88px] rounded-sm border border-[#adadad] bg-[#e1e1e1] px-4 py-1.5 text-[13px] hover:bg-[#d4d4d4]"
            >
              No
            </button>
          </div>
        </div>
        <p className="bg-[#f0f0f0] px-5 py-2 text-[11px] text-[#555]">
          Mostra altri dettagli
        </p>
      </div>
    </motion.div>
  );
}

function formatClock(totalSecs: number) {
  const m = Math.floor(totalSecs / 60);
  const s = totalSecs % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** Ransomware fake con countdown da 5:00 (accelerato ~45s reali). */
export function RansomwareOverlay({
  prank,
  onDone,
}: {
  prank: AdminPrank;
  onDone: () => void;
}) {
  const [secs, setSecs] = useState(5 * 60);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    stopAllVideos();
    // 300 tick visuali in ~45s → ogni 150ms togli 1 secondo
    const tick = window.setInterval(() => {
      setSecs((prev) => {
        if (prev <= 1) {
          window.clearInterval(tick);
          setRevealed(true);
          return 0;
        }
        return prev - 1;
      });
    }, 150);
    return () => window.clearInterval(tick);
  }, [prank.id]);

  return (
    <motion.div
      role="alertdialog"
      aria-label="Ransomware"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="admin-prank-ransom fixed inset-0 z-[140] overflow-auto bg-[#1a0000] p-5 text-[#ffb4b4]"
    >
      <div className="mx-auto flex min-h-full max-w-2xl flex-col justify-center">
        <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-red-400">
          BranchefyLocker v9.9
        </p>
        <h1 className="font-display mt-3 text-[2rem] font-semibold tracking-[-0.03em] text-white sm:text-[2.4rem]">
          {revealed ? "Scherzo riuscito." : "I tuoi profili sono crittografati"}
        </h1>
        <p className="mt-4 text-[14px] leading-relaxed text-red-200/90">
          {revealed
            ? prank.message?.trim() ||
              "Nessun file è stato toccato. Era solo l’amministrazione Branchefy."
            : "Tutti i profili, la watchlist e la cronologia di visualizzazione sono stati bloccati con AES-256. Per recuperarli invia 3 BTC entro la scadenza."}
        </p>

        {!revealed && (
          <>
            <p className="mt-8 font-mono text-[3rem] tabular-nums text-red-400 sm:text-[3.5rem]">
              {formatClock(secs)}
            </p>
            <ul className="mt-6 space-y-1 font-mono text-[12px] text-red-300/80">
              <li>ENCRYPTED profiles.db</li>
              <li>ENCRYPTED watch_progress.db</li>
              <li>ENCRYPTED my_list.json</li>
              <li>ENCRYPTED cloud_session.token</li>
            </ul>
          </>
        )}

        {revealed && (
          <button
            type="button"
            onClick={onDone}
            className="mt-8 inline-flex w-fit items-center justify-center rounded-full border border-white/20 px-5 py-2.5 text-[13px] font-semibold text-white hover:bg-white/10"
          >
            Ok, mi hai fregato
          </button>
        )}
      </div>
    </motion.div>
  );
}
