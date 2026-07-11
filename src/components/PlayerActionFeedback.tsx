import { AnimatePresence, motion } from "framer-motion";
import { Pause, Play, RotateCcw, RotateCw } from "lucide-react";

export type PlayerActionKind = "play" | "pause" | "skip";

export interface PlayerActionPulse {
  id: number;
  kind: PlayerActionKind;
  /** Secondi saltati (solo per skip). */
  delta?: number;
}

interface PlayerActionFeedbackProps {
  pulse: PlayerActionPulse | null;
}

const CENTER_MOTION = {
  initial: { opacity: 0, scale: 0.55 },
  animate: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.92 },
  transition: { duration: 0.22, ease: [0.22, 1, 0.36, 1] as const },
};

const SIDE_MOTION = {
  initial: { opacity: 0, scale: 0.5, x: 0 },
  animate: { opacity: 1, scale: 1, x: 0 },
  exit: { opacity: 0, scale: 0.88 },
  transition: { duration: 0.2, ease: [0.22, 1, 0.36, 1] as const },
};

function SkipRing({
  seconds,
  forward,
}: {
  seconds: number;
  forward: boolean;
}) {
  const Icon = forward ? RotateCw : RotateCcw;
  return (
    <div className="relative flex h-[5.5rem] w-[5.5rem] items-center justify-center sm:h-28 sm:w-28">
      <div className="absolute inset-0 rounded-full border-[3px] border-white/85 shadow-[0_0_40px_rgba(0,0,0,0.45)]" />
      <Icon
        className={`absolute h-7 w-7 text-white/90 sm:h-8 sm:w-8 ${
          forward ? "-right-1 top-1" : "-left-1 top-1"
        }`}
        strokeWidth={2.25}
      />
      <span className="font-display text-[2rem] font-bold tabular-nums tracking-tight text-white drop-shadow-lg sm:text-[2.35rem]">
        {seconds}
      </span>
    </div>
  );
}

export function PlayerActionFeedback({ pulse }: PlayerActionFeedbackProps) {
  return (
    <div className="pointer-events-none absolute inset-0 z-[28] overflow-hidden">
      <AnimatePresence mode="wait">
        {pulse?.kind === "play" && (
          <motion.div
            key={`play-${pulse.id}`}
            className="absolute inset-0 flex items-center justify-center"
            {...CENTER_MOTION}
          >
            <div className="flex h-[4.75rem] w-[4.75rem] items-center justify-center rounded-full bg-black/35 shadow-[0_8px_40px_rgba(0,0,0,0.5)] backdrop-blur-[2px] sm:h-[5.25rem] sm:w-[5.25rem]">
              <Play
                className="ml-1 h-12 w-12 fill-white text-white sm:h-[3.25rem] sm:w-[3.25rem]"
                strokeWidth={0}
              />
            </div>
          </motion.div>
        )}

        {pulse?.kind === "pause" && (
          <motion.div
            key={`pause-${pulse.id}`}
            className="absolute inset-0 flex items-center justify-center"
            {...CENTER_MOTION}
          >
            <div className="flex h-[4.75rem] w-[4.75rem] items-center justify-center rounded-full bg-black/35 shadow-[0_8px_40px_rgba(0,0,0,0.5)] backdrop-blur-[2px] sm:h-[5.25rem] sm:w-[5.25rem]">
              <Pause
                className="h-11 w-11 fill-white text-white sm:h-12 sm:w-12"
                strokeWidth={0}
              />
            </div>
          </motion.div>
        )}

        {pulse?.kind === "skip" && pulse.delta != null && (
          <motion.div
            key={`skip-${pulse.id}`}
            className={`absolute top-1/2 -translate-y-1/2 ${
              pulse.delta > 0
                ? "right-[10%] sm:right-[16%]"
                : "left-[10%] sm:left-[16%]"
            }`}
            {...SIDE_MOTION}
          >
            <SkipRing seconds={Math.abs(Math.round(pulse.delta))} forward={pulse.delta > 0} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
