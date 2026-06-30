import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { hasStreamingAccess, listAddons } from "../lib/addonsApi";
import { STREMIO_ADDONS_ENABLED } from "../lib/features";
import type { InstalledAddon } from "../types/stremio";

interface AddonsContextValue {
  addons: InstalledAddon[];
  hasStreaming: boolean;
  loading: boolean;
  refreshAddons: () => Promise<void>;
}

const AddonsContext = createContext<AddonsContextValue | null>(null);

export function AddonsProvider({
  profileId,
  children,
}: {
  profileId: string;
  children: ReactNode;
}) {
  const [addons, setAddons] = useState<InstalledAddon[]>([]);
  // SC catalog is enabled by default on the backend — show streaming UI until we know otherwise.
  const [hasStreaming, setHasStreaming] = useState(true);
  const [loading, setLoading] = useState(true);

  const refreshAddons = useCallback(async () => {
    setLoading(true);
    let list: InstalledAddon[] = [];
    let access = true;

    try {
      if (STREMIO_ADDONS_ENABLED) {
        list = await listAddons(profileId);
      }
    } catch {
      list = [];
    }

    try {
      access = await hasStreamingAccess(profileId);
    } catch {
      access = true;
    }

    setAddons(list);
    setHasStreaming(access);
    setLoading(false);
  }, [profileId]);

  useEffect(() => {
    void refreshAddons();
  }, [refreshAddons]);

  return (
    <AddonsContext.Provider
      value={{ addons, hasStreaming, loading, refreshAddons }}
    >
      {children}
    </AddonsContext.Provider>
  );
}

export function useAddons() {
  const ctx = useContext(AddonsContext);
  if (!ctx) {
    throw new Error("useAddons must be used within AddonsProvider");
  }
  return ctx;
}
