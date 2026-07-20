import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { ChevronLeft, ChevronRight, SkipBack } from "lucide-react";
import { useMobileDevice } from "../context/MobileDeviceContext";

/**
 * Desktop: libro 3D con fogli fronte/retro (rotateY).
 * Mobile: swipe stile Kindle (più affidabile al touch).
 */

const RENDER_WINDOW = 5;
const SWIPE_THRESHOLD_RATIO = 0.18;
const SWIPE_VELOCITY_THRESHOLD = 0.45;
const PAGE_TURN_MS = 280;
const RENDER_MARGIN = 2;

interface MangaBookReaderProps {
  pages: string[];
  title: string;
  initialPage?: number;
  onPageChange?: (page: number) => void;
  /** Manga = RTL. Libri / EPUB = LTR. */
  readingDirection?: "ltr" | "rtl";
}

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
  const isNext = index === flippedCount;
  const isPrev = index === flippedCount - 1;

  const handleClick = useCallback(() => {
    if (isNext) onFlipForward();
    else if (isPrev) onFlipBack();
  }, [isNext, isPrev, onFlipForward, onFlipBack]);

  const zIndex = isFlipped ? 20 + index : 20 + (totalSheets - index);

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

function MangaBook3DReader({
  pages,
  title,
  initialPage = 0,
  onPageChange,
}: Omit<MangaBookReaderProps, "readingDirection">) {
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

  useEffect(() => {
    setFlippedCount(
      Math.min(Math.floor(initialPage / 2), Math.max(sheets.length - 1, 0)),
    );
  }, [initialPage, sheets.length]);

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
      } else if (e.key === "Home") {
        e.preventDefault();
        rewindToStart();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [flipForward, flipBack, rewindToStart]);

  const isOpen = flippedCount > 0 && flippedCount < sheets.length;
  const [titleLeft, titleRight] = useMemo(() => {
    const words = title.trim().split(/\s+/);
    if (words.length < 2) return [title, ""] as const;
    const mid = Math.ceil(words.length / 2);
    return [words.slice(0, mid).join(" "), words.slice(mid).join(" ")] as const;
  }, [title]);

  return (
    <div className="manga-book-scene">
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
        className="manga-book__nav manga-book__nav--prev"
        onClick={flipBack}
        disabled={flippedCount === 0}
        aria-label="Pagina precedente"
      >
        <ChevronLeft className="h-5 w-5" />
      </button>
      <button
        type="button"
        className="manga-book__nav manga-book__nav--next"
        onClick={flipForward}
        disabled={flippedCount >= sheets.length}
        aria-label="Pagina successiva"
      >
        <ChevronRight className="h-5 w-5" />
      </button>
    </div>
  );
}

const KindlePage = memo(function KindlePage({
  src,
  index,
  shouldRender,
}: {
  src: string;
  index: number;
  shouldRender: boolean;
}) {
  return (
    <div className="manga-kindle__page" aria-hidden={!shouldRender}>
      {shouldRender ? (
        <img
          src={src}
          alt={`Pagina ${index + 1}`}
          loading={index < 2 ? "eager" : "lazy"}
          decoding="async"
          draggable={false}
        />
      ) : (
        <div className="manga-kindle__page-placeholder" />
      )}
    </div>
  );
});

function MangaKindleReader({
  pages,
  title,
  initialPage = 0,
  onPageChange,
  readingDirection = "rtl",
}: MangaBookReaderProps) {
  const isLtr = readingDirection === "ltr";
  const { isMobileDevice } = useMobileDevice();
  const viewportRef = useRef<HTMLDivElement>(null);
  const onPageChangeRef = useRef(onPageChange);
  onPageChangeRef.current = onPageChange;

  const [currentPage, setCurrentPage] = useState(() =>
    Math.min(Math.max(initialPage, 0), Math.max(pages.length - 1, 0)),
  );
  const [dragX, setDragX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isTurning, setIsTurning] = useState(false);

  const dragStartRef = useRef({ x: 0, time: 0, pointerId: -1 });
  const didDragRef = useRef(false);
  const viewportWidthRef = useRef(0);

  useEffect(() => {
    const next = Math.min(Math.max(initialPage, 0), Math.max(pages.length - 1, 0));
    setCurrentPage(next);
    setDragX(0);
  }, [initialPage, pages.length]);

  useEffect(() => {
    onPageChangeRef.current?.(currentPage);
  }, [currentPage]);

  const clampDrag = useCallback(
    (dx: number) => {
      const atStart = currentPage === 0;
      const atEnd = currentPage >= pages.length - 1;
      if (atStart && dx > 0) return dx * 0.28;
      if (atEnd && dx < 0) return dx * 0.28;
      return dx;
    },
    [currentPage, pages.length],
  );

  const goToPage = useCallback(
    (nextPage: number, direction: "next" | "prev" | "snap") => {
      const width = viewportWidthRef.current || viewportRef.current?.clientWidth || 0;
      if (!width || direction === "snap") {
        setDragX(0);
        return;
      }

      setIsTurning(true);
      setDragX(direction === "next" ? -width : width);

      window.setTimeout(() => {
        setCurrentPage(nextPage);
        setDragX(0);
        setIsTurning(false);
      }, PAGE_TURN_MS);
    },
    [],
  );

  const turnNext = useCallback(() => {
    if (currentPage >= pages.length - 1 || isTurning) return;
    goToPage(currentPage + 1, "next");
  }, [currentPage, goToPage, isTurning, pages.length]);

  const turnPrev = useCallback(() => {
    if (currentPage <= 0 || isTurning) return;
    goToPage(currentPage - 1, "prev");
  }, [currentPage, goToPage, isTurning]);

  const rewindToStart = useCallback(() => {
    if (currentPage === 0 || isTurning) return;
    setCurrentPage(0);
    setDragX(0);
  }, [currentPage, isTurning]);

  const finishDrag = useCallback(
    (dx: number, elapsedMs: number) => {
      const width = viewportWidthRef.current || viewportRef.current?.clientWidth || 0;
      const threshold = width * SWIPE_THRESHOLD_RATIO;
      const velocity = dx / Math.max(elapsedMs, 1);

      if (dx < -threshold || velocity < -SWIPE_VELOCITY_THRESHOLD) {
        if (currentPage < pages.length - 1) {
          goToPage(currentPage + 1, "next");
          return;
        }
      } else if (dx > threshold || velocity > SWIPE_VELOCITY_THRESHOLD) {
        if (currentPage > 0) {
          goToPage(currentPage - 1, "prev");
          return;
        }
      }

      setDragX(0);
    },
    [currentPage, goToPage, pages.length],
  );

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (isTurning || pages.length === 0) return;
      viewportWidthRef.current = viewportRef.current?.clientWidth ?? 0;
      didDragRef.current = false;
      dragStartRef.current = {
        x: event.clientX,
        time: Date.now(),
        pointerId: event.pointerId,
      };
      setIsDragging(true);
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [isTurning, pages.length],
  );

  const onPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!isDragging || dragStartRef.current.pointerId !== event.pointerId) return;
      const rawDx = event.clientX - dragStartRef.current.x;
      if (Math.abs(rawDx) > 8) didDragRef.current = true;
      setDragX(clampDrag(rawDx));
    },
    [clampDrag, isDragging],
  );

  const onPointerUp = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!isDragging || dragStartRef.current.pointerId !== event.pointerId) return;
      setIsDragging(false);
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      const dx = event.clientX - dragStartRef.current.x;
      const elapsed = Date.now() - dragStartRef.current.time;
      finishDrag(dx, elapsed);
    },
    [finishDrag, isDragging],
  );

  const onPointerCancel = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!isDragging) return;
      setIsDragging(false);
      setDragX(0);
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    },
    [isDragging],
  );

  const onViewportClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (didDragRef.current || isTurning) return;
      const rect = viewportRef.current?.getBoundingClientRect();
      if (!rect) return;
      const ratio = (event.clientX - rect.left) / rect.width;
      if (isLtr) {
        if (ratio <= 0.34) turnPrev();
        else if (ratio >= 0.66) turnNext();
      } else {
        if (ratio <= 0.34) turnNext();
        else if (ratio >= 0.66) turnPrev();
      }
    },
    [isLtr, isTurning, turnNext, turnPrev],
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (isLtr) {
        if (event.key === "ArrowLeft") {
          event.preventDefault();
          turnPrev();
        } else if (event.key === "ArrowRight" || event.key === " ") {
          event.preventDefault();
          turnNext();
        }
      } else {
        if (event.key === "ArrowLeft" || event.key === " ") {
          event.preventDefault();
          turnNext();
        } else if (event.key === "ArrowRight") {
          event.preventDefault();
          turnPrev();
        }
      }
      if (event.key === "Home") {
        event.preventDefault();
        rewindToStart();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isLtr, rewindToStart, turnNext, turnPrev]);

  const progress =
    pages.length > 0 ? ((currentPage + 1) / pages.length) * 100 : 0;

  return (
    <div className={`manga-kindle${isLtr ? " manga-kindle--ltr" : ""}`}>
      <div className="manga-kindle__title" aria-hidden>
        {title}
      </div>

      <div
        ref={viewportRef}
        className={`manga-kindle__viewport${isDragging ? " is-dragging" : ""}${
          isTurning ? " is-turning" : ""
        }`}
        onClick={onViewportClick}
      >
        <div
          className="manga-kindle__track-wrap"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerCancel}
        >
          <div
            className="manga-kindle__track"
            style={{
              transform: `translate3d(calc(-${currentPage * 100}% + ${dragX}px), 0, 0)`,
            }}
          >
            {pages.map((src, index) => (
              <KindlePage
                key={`${index}-${src}`}
                src={src}
                index={index}
                shouldRender={Math.abs(index - currentPage) <= RENDER_MARGIN}
              />
            ))}
          </div>
        </div>

        {isMobileDevice && (
          <div
            className={`manga-kindle__hint${isLtr ? " manga-kindle__hint--ltr" : ""}`}
            aria-hidden
          >
            <span>{isLtr ? "Indietro" : "Avanti"}</span>
            <span>{isLtr ? "Avanti" : "Indietro"}</span>
          </div>
        )}
      </div>

      <div className="manga-kindle__footer">
        <div className="manga-kindle__progress" aria-hidden>
          <div
            className="manga-kindle__progress-fill"
            style={{ width: `${progress}%` }}
          />
        </div>

        {currentPage > 0 && (
          <button
            type="button"
            className="manga-kindle__rewind"
            onClick={rewindToStart}
            aria-label="Torna all'inizio del capitolo"
          >
            <SkipBack className="h-4 w-4" />
            Inizio
          </button>
        )}

        {!isMobileDevice && (
          <>
            <button
              type="button"
              className="manga-kindle__nav manga-kindle__nav--prev"
              onClick={turnPrev}
              disabled={currentPage === 0 || isTurning}
              aria-label="Pagina precedente"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              type="button"
              className="manga-kindle__nav manga-kindle__nav--next"
              onClick={turnNext}
              disabled={currentPage >= pages.length - 1 || isTurning}
              aria-label="Pagina successiva"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export function MangaBookReader(props: MangaBookReaderProps) {
  const { isMobileDevice } = useMobileDevice();
  if (isMobileDevice) {
    return <MangaKindleReader {...props} />;
  }
  return <MangaBook3DReader {...props} />;
}
