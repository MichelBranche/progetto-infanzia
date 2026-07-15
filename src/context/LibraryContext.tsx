import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { fetchSettings } from "../lib/settingsApi";
import type { Library, MediaItem } from "../types/media";

const EMPTY_LIBRARY: Library = {
  items: [],
  collections: [],
  mediaRoot: "",
  totalCount: 0,
};

interface LibraryContextValue {
  library: Library | null;
  loading: boolean;
  error: string | null;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  searchResults: MediaItem[];
  subscribedServices: string[];
  refresh: () => Promise<void>;
  rescan: () => Promise<void>;
  scanning: boolean;
  toggleFavorite: (mediaId: string) => Promise<void>;
  getItemsBySection: (section: string) => MediaItem[];
}

const LibraryContext = createContext<LibraryContextValue | null>(null);

export function LibraryProvider({
  children,
}: {
  profileId: string;
  children: ReactNode;
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [subscribedServices, setSubscribedServices] = useState<string[]>([]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const settings = await fetchSettings();
      setSubscribedServices(settings.subscribedServices);
      localStorage.setItem(
        "branchefy-intro-sound",
        String(settings.introSoundEnabled),
      );
      localStorage.setItem(
        "branchefy-home-card-sounds",
        String(settings.homeCardSoundsEnabled),
      );
    } catch {
      // impostazioni opzionali al primo avvio
    } finally {
      setLoading(false);
    }
  }, []);

  const rescan = useCallback(async () => {
    await refresh();
  }, [refresh]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const toggleFavorite = useCallback(async (_mediaId: string) => {
    // local library removed
  }, []);

  const getItemsBySection = useCallback((_section: string): MediaItem[] => {
    return [];
  }, []);

  const value = useMemo(
    () => ({
      library: EMPTY_LIBRARY,
      loading,
      error,
      searchQuery,
      setSearchQuery,
      searchResults: [] as MediaItem[],
      subscribedServices,
      refresh,
      rescan,
      scanning: false,
      toggleFavorite,
      getItemsBySection,
    }),
    [
      loading,
      error,
      searchQuery,
      subscribedServices,
      refresh,
      rescan,
      toggleFavorite,
      getItemsBySection,
    ],
  );

  return (
    <LibraryContext.Provider value={value}>{children}</LibraryContext.Provider>
  );
}

export function useLibrary() {
  const ctx = useContext(LibraryContext);
  if (!ctx) throw new Error("useLibrary must be used within LibraryProvider");
  return ctx;
}
