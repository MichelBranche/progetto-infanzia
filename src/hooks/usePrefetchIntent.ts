import { useCallback, useEffect, useRef } from "react";

/** Passaggi accidentali del mouse non devono generare traffico. */
const INTENT_DELAY_MS = 140;

/**
 * Handler da spalmare su un bottone per anticipare un caricamento costoso
 * quando l'utente mostra l'intenzione di cliccarlo (hover fermo o focus).
 */
export function usePrefetchIntent(prefetch?: () => void) {
  const timerRef = useRef<number | null>(null);
  const doneRef = useRef(false);

  const clear = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => clear, [clear]);

  const run = useCallback(() => {
    if (doneRef.current || !prefetch) return;
    doneRef.current = true;
    prefetch();
  }, [prefetch]);

  const arm = useCallback(() => {
    if (doneRef.current || !prefetch) return;
    clear();
    timerRef.current = window.setTimeout(run, INTENT_DELAY_MS);
  }, [clear, prefetch, run]);

  if (!prefetch) return {};

  return {
    onPointerEnter: arm,
    onPointerLeave: clear,
    onFocus: run,
    // Il touch non passa dall'hover: il down anticipa comunque il click.
    onPointerDown: run,
  };
}
