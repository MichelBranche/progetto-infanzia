import { AnimatePresence, motion } from "framer-motion";
import { useHeroAmbientActive } from "../context/HeroAmbientContext";

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
        <motion.img
          key={backdropUrl}
          src={backdropUrl}
          alt=""
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 1, ease: "easeInOut" }}
          draggable={false}
        />
      </AnimatePresence>
      <div className="lf-hero-backdrop__top">
        <img src={backdropUrl} alt="" draggable={false} />
      </div>
    </div>
  );
}
