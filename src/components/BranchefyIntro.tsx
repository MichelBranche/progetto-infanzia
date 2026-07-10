import { useEffect, useState } from "react";
import "../styles/branchefy-intro.css";

const TITLE = "Branchefy";
const TAGLINE = "e fanculo l'abbonamento";
const LETTER_STAGGER_MS = 55;
const LETTER_START_MS = 450;

/**
 * Intro boot: wordmark chromatic in stile brand con reveal a blur
 * staggerato, sweep di luce e aurora liquida sul fondo #05000d.
 */
export function BranchefyIntro() {
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => setPlaying(true));
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <div className={`bfy-intro${playing ? " bfy-intro--play" : ""}`}>
      <div className="bfy-intro__aurora" aria-hidden>
        <span className="bfy-intro__blob bfy-intro__blob--a" />
        <span className="bfy-intro__blob bfy-intro__blob--b" />
        <span className="bfy-intro__blob bfy-intro__blob--c" />
      </div>

      <div className="bfy-intro__stage">
        <div className="bfy-intro__glow" aria-hidden />

        <h1 className="bfy-intro__wordmark" aria-label={TITLE}>
          <span className="bfy-intro__letters" aria-hidden>
            {TITLE.split("").map((char, index) => (
              <span
                key={`${char}-${index}`}
                className="bfy-intro__letter"
                style={{
                  animationDelay: `${LETTER_START_MS + index * LETTER_STAGGER_MS}ms`,
                }}
              >
                {char}
              </span>
            ))}
          </span>
          <span className="bfy-intro__shine" aria-hidden>
            {TITLE}
          </span>
        </h1>

        <p className="bfy-intro__tagline">{TAGLINE}</p>
      </div>

      <div className="bfy-intro__vignette" aria-hidden />
    </div>
  );
}
