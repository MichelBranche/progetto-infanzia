import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";

function findScrollParent(el: HTMLElement | null): HTMLElement | null {
  let node = el?.parentElement ?? null;
  while (node) {
    const overflowY = window.getComputedStyle(node).overflowY;
    if (
      overflowY === "auto" ||
      overflowY === "scroll" ||
      overflowY === "overlay" ||
      node.classList.contains("lf-main-scroll")
    ) {
      return node;
    }
    node = node.parentElement;
  }
  return null;
}

function measureColumns(grid: HTMLElement): number {
  const tracks = window
    .getComputedStyle(grid)
    .gridTemplateColumns.split(/\s+/)
    .filter(Boolean);
  return Math.max(1, tracks.length);
}

function measureRowStride(grid: HTMLElement, fallback: number): number {
  const styles = window.getComputedStyle(grid);
  const gapY =
    parseFloat(styles.rowGap || "0") || parseFloat(styles.gap || "0") || 0;
  const cell = grid.querySelector(":scope > [data-grid-cell]") as HTMLElement | null;
  if (!cell) return fallback;
  const height = cell.getBoundingClientRect().height;
  return height > 0 ? height + gapY : fallback;
}

export interface VerticalGridWindow {
  startIndex: number;
  endIndex: number;
  /** Offset Y del blocco visibile dentro il contenitore alto totalHeight. */
  offsetY: number;
  totalHeight: number;
  active: boolean;
  columns: number;
}

interface HookOptions {
  itemCount: number;
  overscanRows?: number;
  minCount?: number;
  estimateRowHeight?: number;
}

/**
 * Windowing verticale per griglie CSS.
 * Usa un contenitore con altezza totale + griglia absolute (niente paddingTop
 * sulla grid: evita salti di scroll / regressioni di layout).
 */
export function useVerticalGridWindow(
  containerRef: RefObject<HTMLElement | null>,
  gridRef: RefObject<HTMLElement | null>,
  {
    itemCount,
    overscanRows = 2,
    minCount = 40,
    estimateRowHeight = 260,
  }: HookOptions,
): VerticalGridWindow {
  const active = itemCount >= minCount;
  const [columns, setColumns] = useState(6);
  const [rowStride, setRowStride] = useState(estimateRowHeight);
  const [startRow, setStartRow] = useState(0);
  const [rowCount, setRowCount] = useState(8);
  const rowStrideRef = useRef(rowStride);
  rowStrideRef.current = rowStride;

  const recompute = useCallback(() => {
    const container = containerRef.current;
    const grid = gridRef.current;
    if (!container) return;

    if (!active) {
      setStartRow(0);
      setRowCount(Math.ceil(itemCount / Math.max(1, columns)) || 1);
      return;
    }

    if (grid) {
      const nextCols = measureColumns(grid);
      const nextStride = measureRowStride(grid, estimateRowHeight);
      setColumns((c) => (c === nextCols ? c : nextCols));
      if (Math.abs(nextStride - rowStrideRef.current) > 1) {
        setRowStride(nextStride);
        rowStrideRef.current = nextStride;
      }
    }

    const cols = grid ? measureColumns(grid) : columns;
    const stride = rowStrideRef.current;
    const totalRows = Math.max(1, Math.ceil(itemCount / Math.max(1, cols)));

    const scrollParent = findScrollParent(container);
    const viewportTop = scrollParent
      ? scrollParent.getBoundingClientRect().top
      : 0;
    const viewportHeight = scrollParent
      ? scrollParent.clientHeight
      : window.innerHeight;
    const containerTop = container.getBoundingClientRect().top;

    const yStart = Math.max(0, viewportTop - containerTop);
    const yEnd = yStart + viewportHeight;

    const nextStart = Math.max(0, Math.floor(yStart / stride) - overscanRows);
    const nextEnd = Math.min(
      totalRows,
      Math.ceil(yEnd / stride) + overscanRows,
    );
    const visible = Math.max(1, nextEnd - nextStart);

    setStartRow((prev) => (prev === nextStart ? prev : nextStart));
    setRowCount((prev) => (prev === visible ? prev : visible));
  }, [
    active,
    columns,
    containerRef,
    estimateRowHeight,
    gridRef,
    itemCount,
    overscanRows,
  ]);

  useEffect(() => {
    recompute();
  }, [recompute, itemCount]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const scrollParent = findScrollParent(container);
    let raf = 0;
    const schedule = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        recompute();
      });
    };

    scrollParent?.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    const ro =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(schedule)
        : null;
    ro?.observe(container);
    if (gridRef.current) ro?.observe(gridRef.current);

    return () => {
      if (raf) cancelAnimationFrame(raf);
      scrollParent?.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      ro?.disconnect();
    };
  }, [containerRef, gridRef, recompute]);

  const cols = Math.max(1, columns);
  const totalRows = Math.max(1, Math.ceil(itemCount / cols));
  const safeStart = Math.min(startRow, Math.max(0, totalRows - 1));
  const safeEnd = Math.min(totalRows, safeStart + Math.max(rowCount, 1));

  if (!active) {
    return {
      startIndex: 0,
      endIndex: itemCount,
      offsetY: 0,
      totalHeight: 0,
      active: false,
      columns: cols,
    };
  }

  return {
    startIndex: safeStart * cols,
    endIndex: Math.min(itemCount, safeEnd * cols),
    offsetY: safeStart * rowStride,
    totalHeight: totalRows * rowStride,
    active: true,
    columns: cols,
  };
}

interface VirtualizedDiscoveryGridProps<T> {
  items: T[];
  className?: string;
  getKey: (item: T, index: number) => string;
  renderItem: (item: T, index: number) => ReactNode;
  /** Classe extra sul wrapper cella (es. stagger-card). */
  cellClassName?: string | ((item: T, index: number) => string | undefined);
}

/**
 * Griglia discovery con windowing: contenitore a altezza fissa + grid absolute.
 */
export function VirtualizedDiscoveryGrid<T>({
  items,
  className = "lf-discovery-grid lf-discovery-grid--browse",
  getKey,
  renderItem,
  cellClassName,
}: VirtualizedDiscoveryGridProps<T>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const windowed = useVerticalGridWindow(containerRef, gridRef, {
    itemCount: items.length,
  });

  const visible = useMemo(
    () => items.slice(windowed.startIndex, windowed.endIndex),
    [items, windowed.startIndex, windowed.endIndex],
  );

  if (!windowed.active) {
    return (
      <div ref={gridRef} className={className}>
        {items.map((item, index) => {
          const extra =
            typeof cellClassName === "function"
              ? cellClassName(item, index)
              : cellClassName;
          return (
            <div
              key={getKey(item, index)}
              className={extra}
              data-grid-cell
            >
              {renderItem(item, index)}
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      style={{ height: windowed.totalHeight, position: "relative" }}
    >
      <div
        ref={gridRef}
        className={className}
        style={{
          position: "absolute",
          top: windowed.offsetY,
          left: 0,
          right: 0,
        }}
      >
        {visible.map((item, localIndex) => {
          const index = windowed.startIndex + localIndex;
          const extra =
            typeof cellClassName === "function"
              ? cellClassName(item, index)
              : cellClassName;
          return (
            <div
              key={getKey(item, index)}
              className={extra}
              data-grid-cell
            >
              {renderItem(item, index)}
            </div>
          );
        })}
      </div>
    </div>
  );
}
