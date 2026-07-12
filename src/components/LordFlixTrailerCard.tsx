import { memo, useMemo, useState, type CSSProperties } from "react";
import { Loader2, Play } from "lucide-react";
import {
  accentCss,
  boostAmbientPalette,
  DEFAULT_AMBIENT_PALETTE,
  extractPaletteFromImage,
} from "../lib/imagePalette";

export interface LordFlixTrailerCardProps {
  thumbnailUrl?: string;
  title?: string;
  badge?: string;
  disabled?: boolean;
  onClick: () => void;
  className?: string;
}

export const LordFlixTrailerCard = memo(function LordFlixTrailerCard({
  thumbnailUrl,
  title = "Trailer",
  badge = "Trailer ufficiale",
  disabled = false,
  onClick,
  className = "",
}: LordFlixTrailerCardProps) {
  const [cardGlow, setCardGlow] = useState(
    accentCss(DEFAULT_AMBIENT_PALETTE.accents[0], 0.62),
  );

  const glowStyle = useMemo(
    () =>
      ({
        "--lf-card-glow": cardGlow,
      }) as CSSProperties,
    [cardGlow],
  );

  const handleImageLoad = (image: HTMLImageElement) => {
    const palette = extractPaletteFromImage(image);
    if (palette) {
      setCardGlow(accentCss(boostAmbientPalette(palette).accents[0], 0.72));
    }
  };

  return (
    <button
      type="button"
      className={`lf-trailer-card group/trailer ${className}`.trim()}
      onClick={onClick}
      disabled={disabled}
      aria-label={title}
    >
      <div className="lf-trailer-card__stage">
        <div className="lf-trailer-card__glow" style={glowStyle} aria-hidden />
        <div className="lf-trailer-card__frame">
          {thumbnailUrl ? (
            <img
              src={thumbnailUrl}
              alt=""
              loading="lazy"
              decoding="async"
              onLoad={(event) => handleImageLoad(event.currentTarget)}
              className="lf-trailer-card__img"
            />
          ) : (
            <div className="lf-trailer-card__fallback" aria-hidden />
          )}
          <div className="lf-trailer-card__scrim" aria-hidden />
          <span className="lf-trailer-card__badge">{badge}</span>
          <span className="lf-trailer-card__play" aria-hidden>
            {disabled ? (
              <Loader2 className="h-7 w-7 animate-spin" strokeWidth={2} />
            ) : (
              <Play className="h-7 w-7 fill-white" strokeWidth={1.75} />
            )}
          </span>
        </div>
      </div>
    </button>
  );
});
