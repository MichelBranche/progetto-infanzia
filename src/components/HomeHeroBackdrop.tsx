import { AnimatePresence, motion } from "framer-motion";
import { useHeroAmbientActive } from "../context/HeroAmbientContext";

const backdropEase = [0.4, 0, 0.2, 1] as const;

/**
 * Backdrop LordFlix: artwork del titolo hero sfocato a tutto schermo
 * dietro i contenuti della home (fixed, sotto le righe).
 */
export function HomeHeroBackdrop() {
  const { active, backdropUrl } = useHeroAmbientActive();

  if (!active || !backdropUrl) return null;

  return (
    <div className="lf-hero-backdrop" aria-hidden>
      <AnimatePresence mode="sync" initial={false}>
        <motion.div
          key={backdropUrl}
          className="lf-hero-backdrop__slide absolute inset-0"
          initial={{ opacity: 0, filter: "blur(12px)" }}
          animate={{
            opacity: 1,
            filter: "blur(0px)",
            transition: { duration: 0.72, ease: backdropEase },
          }}
          exit={{
            opacity: 0,
            filter: "blur(8px)",
            transition: { duration: 0.55, ease: [0.4, 0, 1, 1] },
          }}
        >
          <img src={backdropUrl} alt="" draggable={false} />
          <div className="lf-hero-backdrop__top">
            <img src={backdropUrl} alt="" draggable={false} />
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
