import { useEffect, useState } from "react";

/** Fallback altezza pannello hover (px). */
export const STREAM_CARD_PANEL_HEIGHT = 188;

export interface StreamCardDimensions {
  collapsed: number;
  expanded: number;
  collapsedHeight: number;
  expandedImageHeight: number;
  expandedTotalHeight: number;
  expandOverflow: number;
  panelHeight: number;
  gap: number;
  radius: number;
  radiusExpanded: number;
}

function buildDimensions(
  collapsed: number,
  expanded: number,
  gap: number,
  radius: number,
  radiusExpanded: number,
  heightRatio: number,
  panelHeight: number,
): StreamCardDimensions {
  const collapsedHeight = Math.round(collapsed * heightRatio);
  const expandedImageHeight = Math.round(expanded * heightRatio);
  const expandedTotalHeight = expandedImageHeight + panelHeight;
  return {
    collapsed,
    expanded,
    collapsedHeight,
    expandedImageHeight,
    expandedTotalHeight,
    expandOverflow: expandedTotalHeight - collapsedHeight,
    panelHeight,
    gap,
    radius,
    radiusExpanded,
  };
}

function readStreamCardDimensions(): StreamCardDimensions {
  if (typeof window === "undefined") {
    return buildDimensions(360, 456, 24, 6, 8, 0.625, STREAM_CARD_PANEL_HEIGHT);
  }
  const styles = getComputedStyle(document.documentElement);
  const collapsed =
    parseFloat(styles.getPropertyValue("--stream-card-width")) || 360;
  const expanded =
    parseFloat(styles.getPropertyValue("--stream-card-expanded")) || 456;
  const gap = parseFloat(styles.getPropertyValue("--stream-card-gap")) || 24;
  const radius =
    parseFloat(styles.getPropertyValue("--stream-card-radius")) || 6;
  const radiusExpanded =
    parseFloat(styles.getPropertyValue("--stream-card-radius-expanded")) || 8;
  const heightRatio =
    parseFloat(styles.getPropertyValue("--stream-card-height-ratio")) || 0.625;
  const panelHeight =
    parseFloat(styles.getPropertyValue("--stream-card-panel-height")) ||
    STREAM_CARD_PANEL_HEIGHT;
  return buildDimensions(
    collapsed,
    expanded,
    gap,
    radius,
    radiusExpanded,
    heightRatio,
    panelHeight,
  );
}

export function useStreamCardDimensions(): StreamCardDimensions {
  const [dims, setDims] = useState<StreamCardDimensions>(() =>
    readStreamCardDimensions(),
  );

  useEffect(() => {
    const update = () => setDims(readStreamCardDimensions());
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  return dims;
}
