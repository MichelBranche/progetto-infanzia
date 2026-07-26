import { useCallback, useEffect, useState } from "react";
import {
  fetchHomeTop10Config,
} from "../lib/homeTop10Api";
import type { HomeTop10Config } from "../types/homeTop10";
import { isCloudEnabled } from "../lib/cloudConfig";

const DEFAULT: HomeTop10Config = { mode: "sc", items: [] };

export function useHomeTop10Config() {
  const [config, setConfig] = useState<HomeTop10Config>(DEFAULT);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!isCloudEnabled()) {
      setConfig(DEFAULT);
      setLoading(false);
      return;
    }
    try {
      const next = await fetchHomeTop10Config();
      setConfig(next);
    } catch {
      setConfig(DEFAULT);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const id = window.setInterval(() => void refresh(), 60_000);
    return () => window.clearInterval(id);
  }, [refresh]);

  return { config, loading, refresh };
}
