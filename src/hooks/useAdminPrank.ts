import { useCallback, useEffect, useRef, useState } from "react";
import { useCloudAccount } from "../context/CloudAccountContext";
import {
  ackAdminPrank,
  fetchPendingAdminPranks,
  subscribeAdminPranks,
} from "../lib/adminPrankApi";
import type { AdminPrank } from "../types/adminPrank";

const QUEUE_CAP = 4;

export function useAdminPrank() {
  const { profile } = useCloudAccount();
  const [active, setActive] = useState<AdminPrank | null>(null);
  const queueRef = useRef<AdminPrank[]>([]);
  const seenRef = useRef<Set<string>>(new Set());
  const busyRef = useRef(false);

  const pump = useCallback(() => {
    if (busyRef.current) return;
    const next = queueRef.current.shift();
    if (!next) {
      setActive(null);
      return;
    }
    busyRef.current = true;
    setActive(next);
  }, []);

  const enqueue = useCallback(
    (prank: AdminPrank) => {
      if (!prank.id || seenRef.current.has(prank.id)) return;
      seenRef.current.add(prank.id);
      if (seenRef.current.size > 40) {
        const first = seenRef.current.values().next().value;
        if (first) seenRef.current.delete(first);
      }
      if (queueRef.current.length >= QUEUE_CAP) return;
      queueRef.current.push(prank);
      pump();
    },
    [pump],
  );

  const dismiss = useCallback(() => {
    const current = active;
    busyRef.current = false;
    setActive(null);
    if (current?.id) {
      void ackAdminPrank(current.id);
    }
    window.setTimeout(() => pump(), 80);
  }, [active, pump]);

  useEffect(() => {
    const userId = profile?.id;
    if (!userId) return;

    let cancelled = false;
    void fetchPendingAdminPranks(userId).then((rows) => {
      if (cancelled) return;
      for (const row of rows) enqueue(row);
    });

    const unsub = subscribeAdminPranks(userId, (prank) => {
      if (cancelled) return;
      enqueue(prank);
    });

    return () => {
      cancelled = true;
      unsub();
    };
  }, [profile?.id, enqueue]);

  return { active, dismiss };
}
