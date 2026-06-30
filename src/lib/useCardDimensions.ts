import { useEffect, useState } from "react";

export interface CardDimensions {
  collapsed: number;
  expanded: number;
  titleSlot: number;
  slotHeight: number;
  posterHeight: number;
}

function readCardDimensions(): CardDimensions {
  if (typeof window === "undefined") {
    return {
      collapsed: 188,
      expanded: 328,
      titleSlot: 42,
      slotHeight: 0,
      posterHeight: 0,
    };
  }

  const styles = getComputedStyle(document.documentElement);
  const collapsed =
    parseFloat(styles.getPropertyValue("--card-collapsed")) || 188;
  const expanded = parseFloat(styles.getPropertyValue("--card-expanded")) || 328;
  const titleSlot =
    parseFloat(styles.getPropertyValue("--card-title-slot")) || 42;
  const posterHeight = Math.round(collapsed * (3 / 2));

  return {
    collapsed,
    expanded,
    titleSlot,
    posterHeight,
    slotHeight: posterHeight + titleSlot,
  };
}

export function useCardDimensions(): CardDimensions {
  const [dims, setDims] = useState<CardDimensions>(() => readCardDimensions());

  useEffect(() => {
    const update = () => setDims(readCardDimensions());
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  return dims;
}

export function top10PosterWidth(viewportWidth: number): number {
  if (viewportWidth >= 1280) return 188;
  if (viewportWidth >= 1024) return 176;
  if (viewportWidth >= 640) return 164;
  return 148;
}

export function top10NumberPad(rank: number, posterWidth: number): number {
  const scale = posterWidth / 148;
  const base = [0, 40, 60, 72, 80, 88, 94, 100, 106, 112, 118];
  return Math.round((base[rank] ?? 118) * scale);
}
