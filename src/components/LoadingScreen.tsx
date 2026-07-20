import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { BranchefyIntro } from "./BranchefyIntro";
import { BootLiquidBackground } from "./LiquidBackground";
import { readIntroSoundPref } from "../lib/settingsApi";
import {
  onWebAudioUnlock,
  playAudioElement,
  unlockAppAudio,
} from "../lib/webAudio";

const INTRO_SOUND_DELAY_MS = 500;
const INTRO_HOLD_MS = 3500;
const INTRO_TAIL_MS = 700;
const FADE_OUT_MS = 700;
const INTRO_SOUND_SRC = "/audio/netflix-intro.mp3";

const PREPARE_LABELS = [
  "Caricamento catalogo…",
  "Preparazione homepage…",
  "Hero e titoli in evidenza…",
  "Quasi pronto…",
];

interface LoadingScreenProps {
  preparing: boolean;
  ready: boolean;
  onIntroComplete: () => void;
  onComplete: () => void;
  /** Solo fase preparing (niente intro): usato dopo la scelta profilo. */
  skipIntro?: boolean;
}

export function LoadingScreen({
  preparing,
  ready,
  onIntroComplete,
  onComplete,
  skipIntro = false,
}: LoadingScreenProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const introRootRef = useRef<HTMLDivElement | null>(null);
  const introPlayedRef = useRef(false);
  const introCompleteRef = useRef(false);
  const bootCompleteRef = useRef(false);
  const [introExiting, setIntroExiting] = useState(false);
  const [labelIdx, setLabelIdx] = useState(0);

  useEffect(() => {
    if (skipIntro) return;

    const audio = new Audio(INTRO_SOUND_SRC);
    audio.preload = "auto";
    audio.volume = 0.92;
    audio.setAttribute("playsinline", "");
    audio.load();
    audioRef.current = audio;

    const playIntro = async () => {
      if (introPlayedRef.current || !readIntroSoundPref()) return;
      const started = await playAudioElement(audio);
      if (started || !audio.paused) {
        introPlayedRef.current = true;
      }
    };

    const scheduleIntro = (delayMs = INTRO_SOUND_DELAY_MS) =>
      window.setTimeout(() => void playIntro(), delayMs);

    let playTimer = scheduleIntro(0);

    const onAudioReady = () => {
      if (!introPlayedRef.current) void playIntro();
    };
    audio.addEventListener("canplaythrough", onAudioReady);
    audio.addEventListener("loadeddata", onAudioReady);

    const cancelUnlock = onWebAudioUnlock(() => {
      if (!introPlayedRef.current) {
        window.clearTimeout(playTimer);
        playTimer = scheduleIntro(0);
      }
    });

    const onIntroGesture = () => {
      unlockAppAudio();
      if (!introPlayedRef.current) {
        window.clearTimeout(playTimer);
        void playIntro();
      }
    };

    const introRoot = introRootRef.current;
    introRoot?.addEventListener("pointerdown", onIntroGesture, { once: true });

    return () => {
      window.clearTimeout(playTimer);
      cancelUnlock();
      audio.removeEventListener("canplaythrough", onAudioReady);
      audio.removeEventListener("loadeddata", onAudioReady);
      introRoot?.removeEventListener("pointerdown", onIntroGesture);
      audio.pause();
      audioRef.current = null;
    };
  }, [skipIntro]);

  useEffect(() => {
    if (skipIntro) {
      if (!introCompleteRef.current) {
        introCompleteRef.current = true;
        onIntroComplete();
      }
      return;
    }

    const holdTimer = window.setTimeout(
      () => setIntroExiting(true),
      INTRO_SOUND_DELAY_MS + INTRO_HOLD_MS + INTRO_TAIL_MS,
    );
    return () => window.clearTimeout(holdTimer);
  }, [skipIntro, onIntroComplete]);

  useEffect(() => {
    if (skipIntro || !introExiting) return;

    const audio = audioRef.current;
    if (audio) {
      const fadeSteps = 8;
      const stepMs = FADE_OUT_MS / fadeSteps;
      let step = 0;
      const startVolume = audio.volume;
      const fadeTimer = window.setInterval(() => {
        step += 1;
        audio.volume = Math.max(0, startVolume * (1 - step / fadeSteps));
        if (step >= fadeSteps) {
          window.clearInterval(fadeTimer);
          audio.pause();
        }
      }, stepMs);
    }

    const doneTimer = window.setTimeout(() => {
      if (introCompleteRef.current) return;
      introCompleteRef.current = true;
      onIntroComplete();
    }, FADE_OUT_MS);

    return () => window.clearTimeout(doneTimer);
  }, [introExiting, onIntroComplete, skipIntro]);

  useLayoutEffect(() => {
    if (!preparing || !ready || bootCompleteRef.current) return;
    bootCompleteRef.current = true;
    onComplete();
  }, [preparing, ready, onComplete]);

  useEffect(() => {
    const resume = () => {
      if (!skipIntro && !introExiting && !preparing) {
        setIntroExiting(true);
      }
      if (preparing && ready && !bootCompleteRef.current) {
        bootCompleteRef.current = true;
        onComplete();
      }
    };
    window.addEventListener("focus", resume);
    document.addEventListener("visibilitychange", resume);
    return () => {
      window.removeEventListener("focus", resume);
      document.removeEventListener("visibilitychange", resume);
    };
  }, [introExiting, preparing, ready, onComplete, skipIntro]);

  useEffect(() => {
    if (!preparing || ready) return;
    const timer = window.setInterval(() => {
      setLabelIdx((i) => (i + 1) % PREPARE_LABELS.length);
    }, 2200);
    return () => window.clearInterval(timer);
  }, [preparing, ready]);

  const showIntro = !skipIntro && !preparing;
  const showPrepare = preparing || skipIntro;

  return (
    <div
      className={`fixed inset-0 z-[100] ${showPrepare ? "bg-[#05000d]" : ""}`}
    >
      {showIntro && (
        <motion.div
          ref={introRootRef}
          className="absolute inset-0"
          initial={{ opacity: 1 }}
          animate={{ opacity: introExiting ? 0 : 1 }}
          transition={{ duration: FADE_OUT_MS / 1000, ease: "easeInOut" }}
        >
          <BranchefyIntro />
        </motion.div>
      )}

      {showPrepare && (
        <div className="absolute inset-0 overflow-hidden">
          <BootLiquidBackground />
          <div className="relative z-10 flex h-full flex-col items-center justify-center px-6">
            <span className="chromatic-logo chromatic-logo--skew">B</span>
            <div className="mt-7 h-9 w-9 animate-spin rounded-full border-2 border-white/10 border-t-white/85" />
            <p className="mt-6 text-center text-[11px] font-medium uppercase tracking-[0.28em] text-white/55">
              {PREPARE_LABELS[labelIdx]}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
