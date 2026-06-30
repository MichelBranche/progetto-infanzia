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
  if (viewportWidth >= 1280) return 168;
  if (viewportWidth >= 1024) return 156;
  if (viewportWidth >= 640) return 144;
  return 128;
}

export function top10NumberPad(rank: number, posterWidth: number): number {
  const scale = posterWidth / 128;
  const base = [0, 48, 68, 80, 88, 96, 102, 108, 114, 120, 126];
  return Math.round((base[rank] ?? 126) * scale);
}
