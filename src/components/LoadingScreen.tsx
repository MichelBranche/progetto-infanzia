import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import "../styles/netflix-intro.css";
import { readIntroSoundPref } from "../lib/settingsApi";

const INTRO_ZOOM_DELAY_MS = 500;
const INTRO_ZOOM_DURATION_MS = 3500;
const INTRO_HOLD_MS = 700;
const FADE_OUT_MS = 700;
const PREPARE_MIN_MS = 500;
const INTRO_SOUND_SRC = "/audio/netflix-intro.mp3";

const PREPARE_LABELS = [
  "Caricamento catalogo…",
  "Preparazione titoli in evidenza…",
  "Quasi pronto…",
];

interface LoadingScreenProps {
  preparing: boolean;
  ready: boolean;
  onIntroComplete: () => void;
  onComplete: () => void;
}

export function LoadingScreen({
  preparing,
  ready,
  onIntroComplete,
  onComplete,
}: LoadingScreenProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [introExiting, setIntroExiting] = useState(false);
  const [prepareExiting, setPrepareExiting] = useState(false);
  const [labelIdx, setLabelIdx] = useState(0);
  const prepareShownAt = useRef(0);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  useEffect(() => {
    const audio = new Audio(INTRO_SOUND_SRC);
    audio.preload = "auto";
    audio.volume = 0.92;
    audioRef.current = audio;

    const playTimer = window.setTimeout(() => {
      if (!readIntroSoundPref()) return;
      audio.currentTime = 0;
      void audio.play().catch(() => undefined);
    }, INTRO_ZOOM_DELAY_MS);

    return () => {
      window.clearTimeout(playTimer);
      audio.pause();
      audioRef.current = null;
    };
  }, []);

  useEffect(() => {
    const holdTimer = window.setTimeout(
      () => setIntroExiting(true),
      INTRO_ZOOM_DELAY_MS + INTRO_ZOOM_DURATION_MS + INTRO_HOLD_MS,
    );
    return () => window.clearTimeout(holdTimer);
  }, []);

  useEffect(() => {
    if (!introExiting) return;

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

    const doneTimer = window.setTimeout(onIntroComplete, FADE_OUT_MS);
    return () => window.clearTimeout(doneTimer);
  }, [introExiting, onIntroComplete]);

  useEffect(() => {
    if (!preparing) return;
    prepareShownAt.current = Date.now();
  }, [preparing]);

  useEffect(() => {
    if (!preparing || !ready || prepareExiting) return;

    const elapsed = Date.now() - prepareShownAt.current;
    const wait = Math.max(0, PREPARE_MIN_MS - elapsed);
    const timer = window.setTimeout(() => setPrepareExiting(true), wait);
    return () => window.clearTimeout(timer);
  }, [preparing, ready, prepareExiting]);

  useEffect(() => {
    if (!prepareExiting) return;
    const timer = window.setTimeout(onComplete, FADE_OUT_MS);
    return () => window.clearTimeout(timer);
  }, [prepareExiting, onComplete]);

  useEffect(() => {
    if (!preparing || ready) return;
    const timer = window.setInterval(() => {
      setLabelIdx((i) => (i + 1) % PREPARE_LABELS.length);
    }, 2200);
    return () => window.clearInterval(timer);
  }, [preparing, ready]);

  const showIntro = !preparing;
  const showPrepare = preparing;

  return (
    <motion.div
      className="fixed inset-0 z-[100] bg-black"
      initial={{ opacity: 1 }}
      animate={{ opacity: prepareExiting ? 0 : 1 }}
      transition={{ duration: FADE_OUT_MS / 1000, ease: "easeInOut" }}
    >
      <AnimatePresence mode="wait">
        {showIntro && (
          <motion.div
            key="intro"
            className="absolute inset-0"
            initial={{ opacity: 1 }}
            animate={{ opacity: introExiting ? 0 : 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: FADE_OUT_MS / 1000, ease: "easeInOut" }}
          >
            <div className="netflix-intro-shell relative h-full w-full">
              <div className="branchefy-intro-zoom">
                <h1 className="font-display text-[3.25rem] font-bold leading-none tracking-[-0.04em] text-[#e50914]">
                  Branchefy
                </h1>
                <p className="branchefy-intro-tagline mt-5 text-[10px] font-medium uppercase tracking-[0.35em] text-white/55">
                  La tua capsula del tempo
                </p>
              </div>
            </div>
          </motion.div>
        )}

        {showPrepare && (
          <motion.div
            key="prepare"
            className="absolute inset-0 flex flex-col items-center justify-center px-6"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.45, ease: "easeOut" }}
          >
            <div className="h-9 w-9 animate-spin rounded-full border-2 border-white/10 border-t-[#e50914]" />
            <p className="mt-6 text-center text-[11px] font-medium uppercase tracking-[0.28em] text-white/45">
              {PREPARE_LABELS[labelIdx]}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
