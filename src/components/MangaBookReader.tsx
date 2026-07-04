import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, SkipBack } from "lucide-react";

/**
 * Lettore manga a libro 3D: le pagine sono fogli fronte/retro che si
 * sfogliano con una rotazione 3D (adattato dal componente book-gallery).
 */

const RENDER_WINDOW = 5;

interface Sheet {
  front: string;
  back: string | null;
}

const BookSheet = memo(function BookSheet({
  sheet,
  index,
  flippedCount,
  totalSheets,
  shouldRender,
  rewindFrom,
  onFlipForward,
  onFlipBack,
}: {
  sheet: Sheet;
  index: number;
  flippedCount: number;
  totalSheets: number;
  shouldRender: boolean;
  rewindFrom: number | null;
  onFlipForward: () => void;
  onFlipBack: () => void;
}) {
  const isFlipped = index < flippedCount;
  // Foglio in cima alla pila destra (da sfogliare) o sinistra (da ri-sfogliare)
  const isNext = index === flippedCount;
  const isPrev = index === flippedCount - 1;

  const handleClick = useCallback(() => {
    if (isNext) onFlipForward();
    else if (isPrev) onFlipBack();
  }, [isNext, isPrev, onFlipForward, onFlipBack]);

  const zIndex = isFlipped ? 20 + index : 20 + (totalSheets - index);

  // Durante il riavvolgimento le pagine tornano in sequenza (ultima per prima).
  const rewindDelay =
    rewindFrom !== null && index < rewindFrom
      ? `${(rewindFrom - 1 - index) * 70}ms`
      : undefined;

  return (
    <div
      className={`manga-book__sheet ${isFlipped ? "is-flipped" : ""} ${
        isNext || isPrev ? "is-interactive" : ""
      }`}
      style={{ zIndex, transitionDelay: rewindDelay }}
      onClick={handleClick}
      role="button"
      aria-label={isFlipped ? "Pagina precedente" : "Pagina successiva"}
    >
      {shouldRender ? (
        <>
          <img
            src={sheet.front}
            alt={`Pagina ${index * 2 + 1}`}
            loading="lazy"
            decoding="async"
            draggable={false}
          />
          {sheet.back ? (
            <img
              src={sheet.back}
              alt={`Pagina ${index * 2 + 2}`}
              loading="lazy"
              decoding="async"
              draggable={false}
              className="manga-book__back"
            />
          ) : (
            <div className="manga-book__back manga-book__blank">Fine</div>
          )}
        </>
      ) : (
        <div className="manga-book__placeholder" />
      )}
    </div>
  );
});

interface MangaBookReaderProps {
  pages: string[];
  title: string;
  initialPage?: number;
  onPageChange?: (page: number) => void;
}

export function MangaBookReader({
  pages,
  title,
  initialPage = 0,
  onPageChange,
}: MangaBookReaderProps) {
  const sheets = useMemo<Sheet[]>(() => {
    const out: Sheet[] = [];
    for (let i = 0; i < pages.length; i += 2) {
      out.push({ front: pages[i], back: pages[i + 1] ?? null });
    }
    return out;
  }, [pages]);

  const [flippedCount, setFlippedCount] = useState(() =>
    Math.min(Math.floor(initialPage / 2), Math.max(sheets.length - 1, 0)),
  );
  const onPageChangeRef = useRef(onPageChange);
  onPageChangeRef.current = onPageChange;

  const flipForward = useCallback(() => {
    setFlippedCount((prev) => Math.min(prev + 1, sheets.length));
  }, [sheets.length]);

  const flipBack = useCallback(() => {
    setFlippedCount((prev) => Math.max(prev - 1, 0));
  }, []);

  const [rewindFrom, setRewindFrom] = useState<number | null>(null);
  const rewindTimerRef = useRef<number | null>(null);
  const rewindToStart = useCallback(() => {
    setFlippedCount((prev) => {
      if (prev === 0) return prev;
      setRewindFrom(prev);
      if (rewindTimerRef.current) window.clearTimeout(rewindTimerRef.current);
      rewindTimerRef.current = window.setTimeout(
        () => setRewindFrom(null),
        prev * 70 + 700,
      );
      return 0;
    });
  }, []);

  useEffect(() => {
    return () => {
      if (rewindTimerRef.current) window.clearTimeout(rewindTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const page = Math.min(flippedCount * 2, Math.max(pages.length - 1, 0));
    onPageChangeRef.current?.(page);
  }, [flippedCount, pages.length]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === " ") {
        e.preventDefault();
        flipForward();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        flipBack();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [flipForward, flipBack]);

  const isOpen = flippedCount > 0 && flippedCount < sheets.length;
  const [titleLeft, titleRight] = useMemo(() => {
    const words = title.trim().split(/\s+/);
    if (words.length < 2) return [title, ""] as const;
    const mid = Math.ceil(words.length / 2);
    return [words.slice(0, mid).join(" "), words.slice(mid).join(" ")] as const;
  }, [title]);

  return (
    <div className="manga-book-scene">
      <style>{`
        .manga-book-scene {
          position: relative;
          flex: 1;
          min-height: 0;
          display: flex;
          justify-content: center;
          align-items: center;
          overflow: hidden;
          perspective: 1400px;
          background:
            radial-gradient(ellipse at center, rgba(255, 103, 64, 0.06), transparent 65%),
            #101014;
        }
        .manga-book__typo {
          position: absolute;
          inset: 0;
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 0 4vw;
          pointer-events: none;
          z-index: 0;
          font-weight: 800;
          font-size: clamp(2rem, 7vw, 6rem);
          line-height: 0.9;
          color: rgba(255, 255, 255, 0.05);
          text-transform: uppercase;
          letter-spacing: -0.03em;
          user-select: none;
        }
        .manga-book {
          position: relative;
          /* Quasi tutta l'altezza; limitata dalla larghezza per far stare
             il libro aperto (pagina + spostamento dorso ≈ altezza totale). */
          height: min(94%, calc((100vw - 160px) * 0.72));
          aspect-ratio: 2 / 3;
          transform-style: preserve-3d;
          transform: translateX(0);
          transition: transform 0.5s ease;
          z-index: 10;
        }
        .manga-book.is-open {
          /* 50% della larghezza pagina = metà dorso centrato */
          transform: translateX(50%);
        }
        .manga-book__sheet {
          position: absolute;
          inset: 0;
          transform-origin: left center;
          transform: rotateY(0deg);
          transition: transform 0.55s cubic-bezier(0.4, 0.05, 0.2, 1);
          transform-style: preserve-3d;
          box-shadow: 2px 2px 14px rgba(0, 0, 0, 0.45);
          background: #14141c;
        }
        .manga-book__sheet.is-flipped {
          transform: rotateY(-180deg);
        }
        .manga-book__sheet.is-interactive {
          cursor: pointer;
        }
        .manga-book__sheet img {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          object-fit: contain;
          background: #f6f2ea;
          backface-visibility: hidden;
        }
        .manga-book__sheet .manga-book__back {
          transform: rotateY(180deg) translateZ(1px);
        }
        .manga-book__blank {
          position: absolute;
          inset: 0;
          display: flex;
          justify-content: center;
          align-items: center;
          background: #14141c;
          color: rgba(255, 255, 255, 0.35);
          font-size: 14px;
          backface-visibility: hidden;
        }
        .manga-book__placeholder {
          position: absolute;
          inset: 0;
          background: #14141c;
        }
        .manga-book__nav {
          position: absolute;
          top: 50%;
          transform: translateY(-50%);
          z-index: 40;
          display: flex;
          align-items: center;
          justify-content: center;
          width: 44px;
          height: 44px;
          border-radius: 9999px;
          background: rgba(0, 0, 0, 0.55);
          color: rgba(255, 255, 255, 0.85);
          backdrop-filter: blur(4px);
          transition: background 0.2s, opacity 0.2s;
        }
        .manga-book__nav:hover { background: rgba(255, 103, 64, 0.85); }
        .manga-book__nav:disabled { opacity: 0.25; pointer-events: none; }
        .manga-book__rewind {
          position: absolute;
          bottom: 16px;
          left: 50%;
          transform: translateX(-50%);
          z-index: 40;
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 8px 16px;
          border-radius: 9999px;
          background: rgba(0, 0, 0, 0.55);
          color: rgba(255, 255, 255, 0.85);
          font-size: 12px;
          font-weight: 500;
          backdrop-filter: blur(4px);
          transition: background 0.2s, color 0.2s;
        }
        .manga-book__rewind:hover {
          background: rgba(255, 103, 64, 0.85);
          color: #fff;
        }
      `}</style>

      <div className="manga-book__typo" aria-hidden>
        <span>{titleLeft}</span>
        <span>{titleRight}</span>
      </div>

      <div className={`manga-book ${isOpen ? "is-open" : ""}`}>
        {sheets.map((sheet, index) => (
          <BookSheet
            key={index}
            sheet={sheet}
            index={index}
            flippedCount={flippedCount}
            totalSheets={sheets.length}
            shouldRender={
              Math.abs(index - flippedCount) <= RENDER_WINDOW ||
              (rewindFrom !== null && index < rewindFrom)
            }
            rewindFrom={rewindFrom}
            onFlipForward={flipForward}
            onFlipBack={flipBack}
          />
        ))}
      </div>

      {flippedCount > 0 && (
        <button
          type="button"
          className="manga-book__rewind"
          onClick={rewindToStart}
          aria-label="Torna all'inizio del capitolo"
        >
          <SkipBack className="h-4 w-4" />
          Torna all'inizio
        </button>
      )}

      <button
        type="button"
        className="manga-book__nav"
        style={{ left: "16px" }}
        onClick={flipBack}
        disabled={flippedCount === 0}
        aria-label="Pagina precedente"
      >
        <ChevronLeft className="h-5 w-5" />
      </button>
      <button
        type="button"
        className="manga-book__nav"
        style={{ right: "16px" }}
        onClick={flipForward}
        disabled={flippedCount >= sheets.length}
        aria-label="Pagina successiva"
      >
        <ChevronRight className="h-5 w-5" />
      </button>
    </div>
  );
}
