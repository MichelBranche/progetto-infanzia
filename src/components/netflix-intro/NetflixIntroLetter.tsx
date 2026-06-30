function FurStripes() {
  return (
    <>
      {Array.from({ length: 31 }, (_, index) => (
        <span key={index} className={`fur-${31 - index}`} />
      ))}
    </>
  );
}

function Lumieres() {
  return (
    <>
      {Array.from({ length: 28 }, (_, index) => (
        <span key={index} className={`lamp-${index + 1}`} />
      ))}
    </>
  );
}

function EffectBrush() {
  return (
    <div className="effect-brush">
      <FurStripes />
    </div>
  );
}

/** B geometrica in stile Netflix Sans — più leggibile dei blocchi CSS. */
function LetterBShape() {
  return (
    <svg
      className="netflix-letter-b-svg"
      viewBox="0 0 300 300"
      aria-hidden
    >
      <path
        fill="#e50914"
        fillRule="evenodd"
        d="M78 44h52c52 0 74 26 74 58 0 22-14 40-36 48 26 8 42 28 42 58 0 44-32 58-78 58H78V44zm32 26v56h18c22 0 36-12 36-28s-14-28-36-28h-18zm0 86v58h20c26 0 42-14 42-34s-16-34-42-34h-20z"
      />
    </svg>
  );
}

export type IntroLetter = "B" | "N" | "E" | "T" | "F" | "L" | "I" | "X";

interface NetflixIntroLetterProps {
  letter: IntroLetter;
}

export function NetflixIntroLetter({ letter }: NetflixIntroLetterProps) {
  if (letter === "B") {
    return (
      <div
        className="netflix-intro-letter netflix-intro-letter--svg-b"
        data-letter="B"
      >
        <LetterBShape />
        <div className="helper-1">
          <EffectBrush />
          <div className="effect-lumieres">
            <Lumieres />
          </div>
        </div>
      </div>
    );
  }

  if (letter === "N" || letter === "E") {
    return (
      <div className="netflix-intro-letter" data-letter={letter}>
        <div className="helper-1">
          <EffectBrush />
          <div className="effect-lumieres">
            <Lumieres />
          </div>
        </div>
        <div className="helper-2">
          <EffectBrush />
        </div>
        <div className="helper-3">
          <EffectBrush />
        </div>
        <div className="helper-4">
          <EffectBrush />
        </div>
      </div>
    );
  }

  if (letter === "F") {
    return (
      <div className="netflix-intro-letter" data-letter="F">
        <div className="helper-1">
          <EffectBrush />
          <div className="effect-lumieres">
            <Lumieres />
          </div>
        </div>
        <div className="helper-2">
          <EffectBrush />
        </div>
        <div className="helper-3">
          <EffectBrush />
        </div>
      </div>
    );
  }

  if (letter === "T" || letter === "I") {
    return (
      <div className="netflix-intro-letter" data-letter={letter}>
        <div className="helper-1">
          <EffectBrush />
          <div className="effect-lumieres">
            <Lumieres />
          </div>
        </div>
        <div className="helper-2">
          <EffectBrush />
        </div>
      </div>
    );
  }

  if (letter === "L") {
    return (
      <div className="netflix-intro-letter" data-letter="L">
        <div className="helper-1">
          <EffectBrush />
          <div className="effect-lumieres">
            <Lumieres />
          </div>
        </div>
        <div className="helper-2">
          <EffectBrush />
        </div>
      </div>
    );
  }

  return (
    <div className="netflix-intro-letter" data-letter="X">
      <div className="helper-1">
        <EffectBrush />
        <div className="effect-lumieres">
          <Lumieres />
        </div>
      </div>
      <div className="helper-2">
        <EffectBrush />
      </div>
    </div>
  );
}
