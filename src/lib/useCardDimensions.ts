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

export function top10NumberPad(rank: number, posterWidth: number): number {
  const scale = posterWidth / 128;
  const base = [0, 56, 78, 92, 102, 110, 118, 124, 130, 136, 142];
  return Math.round((base[rank] ?? 142) * scale);
}
