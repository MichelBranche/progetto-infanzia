import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";

const DRAG_THRESHOLD_PX = 10;

interface RowInteractionContextValue {
  collapseEpoch: number;
}

export const RowInteractionContext = createContext<RowInteractionContextValue>({
  collapseEpoch: 0,
});

export function useRowInteraction() {
  return useContext(RowInteractionContext);
}

interface RowScrollContainerResult {
  scrollRef: RefObject<HTMLDivElement | null>;
  collapseEpoch: number;
  scrollProps: {
    onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
    onPointerMove: (event: ReactPointerEvent<HTMLDivElement>) => void;
    onPointerUp: (event: ReactPointerEvent<HTMLDivElement>) => void;
    onPointerCancel: (event: ReactPointerEvent<HTMLDivElement>) => void;
  };
}

export function useRowScrollContainer(): RowScrollContainerResult {
  const scrollRef = useRef<HTMLDivElement>(null);
  const pointerRef = useRef({
    active: false,
    dragging: false,
    startX: 0,
    startY: 0,
  });
  const [collapseEpoch, setCollapseEpoch] = useState(0);

  const bumpCollapse = useCallback(() => {
    setCollapseEpoch((value) => value + 1);
  }, []);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;

    const onScroll = () => bumpCollapse();
    element.addEventListener("scroll", onScroll, { passive: true });
    return () => element.removeEventListener("scroll", onScroll);
  }, [bumpCollapse]);

  const endPointer = useCallback((element: HTMLDivElement) => {
    if (pointerRef.current.dragging) {
      const suppressClick = (event: MouseEvent) => {
        event.preventDefault();
        event.stopImmediatePropagation();
      };
      element.addEventListener("click", suppressClick, { capture: true, once: true });
    }
    delete element.dataset.rowDragging;
    pointerRef.current = {
      active: false,
      dragging: false,
      startX: 0,
      startY: 0,
    };
  }, []);

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      pointerRef.current = {
        active: true,
        dragging: false,
        startX: event.clientX,
        startY: event.clientY,
      };
      bumpCollapse();
    },
    [bumpCollapse],
  );

  const onPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const pointer = pointerRef.current;
      if (!pointer.active || pointer.dragging) return;

      const delta = Math.hypot(
        event.clientX - pointer.startX,
        event.clientY - pointer.startY,
      );
      if (delta < DRAG_THRESHOLD_PX) return;

      pointer.dragging = true;
      event.currentTarget.dataset.rowDragging = "1";
      bumpCollapse();
    },
    [bumpCollapse],
  );

  const onPointerUp = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!pointerRef.current.active) return;
      endPointer(event.currentTarget);
    },
    [endPointer],
  );

  const onPointerCancel = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!pointerRef.current.active) return;
      endPointer(event.currentTarget);
    },
    [endPointer],
  );

  return {
    scrollRef,
    collapseEpoch,
    scrollProps: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel,
    },
  };
}

export function isRowDragging(): boolean {
  return Boolean(document.querySelector("[data-row-dragging='1']"));
}
