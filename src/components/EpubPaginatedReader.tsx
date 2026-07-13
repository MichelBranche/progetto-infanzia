import ePub, { type Rendition } from "epubjs";
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

interface EpubPaginatedReaderProps {
  bookUrl: string;
  title: string;
  onPageChange?: (page: number, total: number) => void;
}

export const EpubPaginatedReader = memo(function EpubPaginatedReader({
  bookUrl,
  title,
  onPageChange,
}: EpubPaginatedReaderProps) {
  const { isMobileDevice } = useMobileDevice();
  const hostRef = useRef<HTMLDivElement>(null);
  const renditionRef = useRef<Rendition | null>(null);
  const onPageChangeRef = useRef(onPageChange);
  onPageChangeRef.current = onPageChange;

  const [ready, setReady] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [dragX, setDragX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isTurning, setIsTurning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dragStartRef = useRef({ x: 0, time: 0, pointerId: -1 });
  const didDragRef = useRef(false);
  const viewportWidthRef = useRef(0);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let cancelled = false;
    setReady(false);
    setError(null);
    setCurrentPage(1);
    setTotalPages(1);

    const book = ePub(bookUrl);
    const width = Math.min(host.clientWidth || 640, 900);
    const height = Math.max((host.parentElement?.clientHeight ?? 700) - 24, 480);
    const rendition = book.renderTo(host, {
      width,
      height,
      spread: "none",
      flow: "paginated",
    });
    renditionRef.current = rendition;

    const onRelocated = (location: { start?: { displayed?: { page?: number; total?: number } } }) => {
      const displayed = location.start?.displayed;
      if (!displayed) return;
      const page = displayed.page ?? 1;
      const total = displayed.total ?? 1;
      setCurrentPage(page);
      setTotalPages(total);
      onPageChangeRef.current?.(page - 1, total);
    };

    rendition.on("relocated", onRelocated);

    void rendition.display().then(() => {
      if (!cancelled) setReady(true);
    }).catch((err: unknown) => {
      if (!cancelled) {
        setError(err instanceof Error ? err.message : String(err));
      }
    });

    return () => {
      cancelled = true;
      rendition.off("relocated", onRelocated);
      rendition.destroy();
      renditionRef.current = null;
      host.innerHTML = "";
    };
  }, [bookUrl]);

  const turnNext = useCallback(async () => {
    const rendition = renditionRef.current;
    if (!rendition || isTurning || currentPage >= totalPages) return;
    setIsTurning(true);
    await rendition.next();
    window.setTimeout(() => setIsTurning(false), PAGE_TURN_MS);
  }, [currentPage, isTurning, totalPages]);

  const turnPrev = useCallback(async () => {
    const rendition = renditionRef.current;
    if (!rendition || isTurning || currentPage <= 1) return;
    setIsTurning(true);
    await rendition.prev();
    window.setTimeout(() => setIsTurning(false), PAGE_TURN_MS);
  }, [currentPage, isTurning]);

  const rewindToStart = useCallback(async () => {
    const rendition = renditionRef.current;
    if (!rendition || currentPage <= 1 || isTurning) return;
    setIsTurning(true);
    await rendition.display();
    window.setTimeout(() => setIsTurning(false), PAGE_TURN_MS);
  }, [currentPage, isTurning]);

  const clampDrag = useCallback(
    (dx: number) => {
      const atStart = currentPage <= 1;
      const atEnd = currentPage >= totalPages;
      if (atStart && dx > 0) return dx * 0.28;
      if (atEnd && dx < 0) return dx * 0.28;
      return dx;
    },
    [currentPage, totalPages],
  );

  const finishDrag = useCallback(
    (dx: number, elapsedMs: number) => {
      const width = viewportWidthRef.current || hostRef.current?.clientWidth || 0;
      const threshold = width * SWIPE_THRESHOLD_RATIO;
      const velocity = dx / Math.max(elapsedMs, 1);

      if (dx < -threshold || velocity < -SWIPE_VELOCITY_THRESHOLD) {
        void turnNext();
      } else if (dx > threshold || velocity > SWIPE_VELOCITY_THRESHOLD) {
        void turnPrev();
      }
      setDragX(0);
    },
    [turnNext, turnPrev],
  );

  const onPointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (isTurning || !ready) return;
    viewportWidthRef.current = hostRef.current?.clientWidth ?? 0;
    didDragRef.current = false;
    dragStartRef.current = { x: event.clientX, time: Date.now(), pointerId: event.pointerId };
    setIsDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  }, [isTurning, ready]);

  const onPointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (!isDragging || dragStartRef.current.pointerId !== event.pointerId) return;
    const rawDx = event.clientX - dragStartRef.current.x;
    if (Math.abs(rawDx) > 8) didDragRef.current = true;
    setDragX(clampDrag(rawDx));
  }, [clampDrag, isDragging]);

  const onPointerUp = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (!isDragging || dragStartRef.current.pointerId !== event.pointerId) return;
    setIsDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    finishDrag(event.clientX - dragStartRef.current.x, Date.now() - dragStartRef.current.time);
  }, [finishDrag, isDragging]);

  const onViewportClick = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (didDragRef.current || isTurning) return;
    const rect = hostRef.current?.getBoundingClientRect();
    if (!rect) return;
    const ratio = (event.clientX - rect.left) / rect.width;
    if (ratio <= 0.34) void turnPrev();
    else if (ratio >= 0.66) void turnNext();
  }, [isTurning, turnNext, turnPrev]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        void turnPrev();
      } else if (event.key === "ArrowRight" || event.key === " ") {
        event.preventDefault();
        void turnNext();
      } else if (event.key === "Home") {
        event.preventDefault();
        void rewindToStart();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [rewindToStart, turnNext, turnPrev]);

  const progress = totalPages > 0 ? (currentPage / totalPages) * 100 : 0;

  if (error) {
    return (
      <div className="flex flex-1 items-center justify-center px-6 text-center text-[14px] text-red-400/90">
        {error}
      </div>
    );
  }

  return (
    <div className="manga-kindle manga-kindle--ltr flex min-h-0 flex-1 flex-col">
      <div className="manga-kindle__title" aria-hidden>
        {title}
      </div>

      <div
        className={`manga-kindle__viewport manga-kindle__viewport--epub${isDragging ? " is-dragging" : ""}${
          isTurning ? " is-turning" : ""
        }`}
        onClick={onViewportClick}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => {
          setIsDragging(false);
          setDragX(0);
        }}
        style={{ transform: dragX ? `translateX(${dragX}px)` : undefined }}
      >
        <div ref={hostRef} className="manga-kindle__epub-host" />
        {!ready && (
          <div className="absolute inset-0 flex items-center justify-center bg-[#1a1a1a]/80 text-[13px] text-text-muted">
            Caricamento libro…
          </div>
        )}
        {isMobileDevice && (
          <div className="manga-kindle__hint manga-kindle__hint--ltr" aria-hidden>
            <span>Indietro</span>
            <span>Avanti</span>
          </div>
        )}
      </div>

      <div className="manga-kindle__footer">
        <div className="manga-kindle__progress" aria-hidden>
          <div className="manga-kindle__progress-fill" style={{ width: `${progress}%` }} />
        </div>
        {currentPage > 1 && (
          <button
            type="button"
            className="manga-kindle__rewind"
            onClick={() => void rewindToStart()}
            aria-label="Torna all'inizio"
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
              onClick={() => void turnPrev()}
              disabled={currentPage <= 1 || isTurning}
              aria-label="Pagina precedente"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              type="button"
              className="manga-kindle__nav manga-kindle__nav--next"
              onClick={() => void turnNext()}
              disabled={currentPage >= totalPages || isTurning}
              aria-label="Pagina successiva"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </>
        )}
      </div>
    </div>
  );
});
