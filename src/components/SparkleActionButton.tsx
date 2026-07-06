import {
  useEffect,
  useState,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type MouseEvent,
  type ReactNode,
} from "react";

export type SparkleVariant = "list" | "info";

interface SparkleActionButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  sparkle?: SparkleVariant;
  /** Lista: sparkle solo in aggiunta; stile attivo quando il titolo è in lista */
  checked?: boolean;
}

const SPARKLE_PARTICLES = [
  { x: 0, y: -14, size: 4, delay: 0, rotate: 8 },
  { x: 11, y: -5, size: 3, delay: 18, rotate: 52 },
  { x: -11, y: -5, size: 3, delay: 28, rotate: -48 },
  { x: 0, y: 9, size: 3, delay: 12, rotate: 118 },
] as const;

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduced(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  return reduced;
}

function SparkleBurst({ variant }: { variant: SparkleVariant }) {
  return (
    <span
      className={`sparkle-burst sparkle-burst--${variant}`}
      aria-hidden
    >
      {SPARKLE_PARTICLES.map((particle, index) => (
        <span
          key={index}
          className="sparkle-particle"
          style={
            {
              "--sparkle-x": `${particle.x}px`,
              "--sparkle-y": `${particle.y}px`,
              "--sparkle-size": `${particle.size}px`,
              "--sparkle-delay": `${particle.delay}ms`,
              "--sparkle-rotate": `${particle.rotate}deg`,
            } as CSSProperties
          }
        >
          <svg viewBox="0 0 10 10" className="h-full w-full">
            <path
              d="M5 0.4 6.15 3.75 9.6 4.05 7.05 6.45 7.85 9.85 5 8.15 2.15 9.85 2.95 6.45 0.4 4.05 3.85 3.75Z"
              fill="currentColor"
            />
          </svg>
        </span>
      ))}
    </span>
  );
}

export function SparkleActionButton({
  children,
  sparkle = "list",
  checked = false,
  className = "",
  disabled,
  onClick,
  ...props
}: SparkleActionButtonProps) {
  const reducedMotion = usePrefersReducedMotion();
  const [burstKey, setBurstKey] = useState(0);
  const [popping, setPopping] = useState(false);

  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    const adding = sparkle === "list" ? !checked : true;
    if (!disabled && !reducedMotion && adding) {
      setBurstKey((value) => value + 1);
      setPopping(true);
      window.setTimeout(() => setPopping(false), 320);
    }
    onClick?.(event);
  };

  return (
    <button
      type="button"
      {...props}
      disabled={disabled}
      onClick={handleClick}
      className={`sparkle-action-btn sparkle-action-btn--${sparkle} ${
        checked ? "sparkle-action-btn--checked" : ""
      } ${popping ? "sparkle-action-btn--pop" : ""} ${className}`.trim()}
    >
      <span className="sparkle-action-btn__icon">{children}</span>
      {!reducedMotion && burstKey > 0 && (
        <SparkleBurst key={burstKey} variant={sparkle} />
      )}
    </button>
  );
}
