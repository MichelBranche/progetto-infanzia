import {
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { ChevronLeft, ChevronRight, SkipBack } from "lucide-react";
import { useMobileDevice } from "../context/MobileDeviceContext";

const SWIPE_THRESHOLD_RATIO = 0.18;
const SWIPE_VELOCITY_THRESHOLD = 0.45;
const PAGE_TURN_MS = 280;
const RENDER_MARGIN = 2;

interface MangaBookReaderProps {
  pages: string[];
  title: string;
  initialPage?: number;
  onPageChange?: (page: number) => void;
  /** Manga = RTL (tap sinistra = avanti). Libri = LTR. */
  readingDirection?: "ltr" | "rtl";
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

export function MangaBookReader({
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
      const dx = clampDrag(rawDx);
      setDragX(dx);
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
          <div className={`manga-kindle__hint${isLtr ? " manga-kindle__hint--ltr" : ""}`} aria-hidden>
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
