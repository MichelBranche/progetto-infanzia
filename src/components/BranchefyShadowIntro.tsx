import { useEffect, useState } from "react";
import "../styles/branchefy-shadow-intro.css";

const TITLE = "Branchefy";

export function BranchefyShadowIntro() {
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => setPlaying(true));
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <div className="branchefy-shadow-intro">
      <div className="branchefy-shadow-intro__stage">
        <h1 className="branchefy-shadow-intro__title" aria-label={TITLE}>
          {TITLE.split("").map((char, index) => (
            <span
              key={`${char}-${index}`}
              className={playing ? "play" : undefined}
              data-index={String(index + 1)}
            >
              {char}
            </span>
          ))}
        </h1>
        <p className="branchefy-shadow-intro__tagline">La tua capsula del tempo</p>
      </div>
    </div>
  );
}
