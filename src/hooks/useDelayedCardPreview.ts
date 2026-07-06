import { useEffect, useState } from "react";
import { CARD_PREVIEW_START_DELAY_MS } from "../lib/preview";

/** Attiva l'anteprima video solo dopo un breve delay dall'espansione hover. */
export function useDelayedCardPreview(
  expanded: boolean,
  enabled: boolean,
  delayMs = CARD_PREVIEW_START_DELAY_MS,
): boolean {
  const [previewActive, setPreviewActive] = useState(false);

  useEffect(() => {
    if (!expanded || !enabled) {
      setPreviewActive(false);
      return;
    }

    const timer = window.setTimeout(() => {
      setPreviewActive(true);
    }, delayMs);

    return () => window.clearTimeout(timer);
  }, [expanded, enabled, delayMs]);

  return previewActive;
}
